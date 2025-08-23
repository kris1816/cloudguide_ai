// api/test-google-tts.js
// Direct test of Google TTS API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;
  
  console.log('Testing Google TTS configuration...');
  console.log('API Key exists:', !!GOOGLE_API_KEY);
  console.log('API Key length:', GOOGLE_API_KEY?.length);
  console.log('API Key prefix:', GOOGLE_API_KEY?.substring(0, 10) + '...');

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({
      error: 'Google API key not configured',
      solution: 'Add GOOGLE_CLOUD_API_KEY to Vercel environment variables'
    });
  }

  try {
    // Step 1: Test if we can list voices (basic API access)
    console.log('Step 1: Testing voice list endpoint...');
    const voicesResponse = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?key=${GOOGLE_API_KEY}`
    );

    const voicesText = await voicesResponse.text();
    console.log('Voices response status:', voicesResponse.status);
    
    if (!voicesResponse.ok) {
      console.error('Voices endpoint failed:', voicesText);
      
      let errorMessage = 'Unknown error';
      try {
        const errorData = JSON.parse(voicesText);
        errorMessage = errorData.error?.message || voicesText;
      } catch (e) {
        errorMessage = voicesText;
      }

      if (voicesResponse.status === 403) {
        return res.status(200).json({
          error: 'Google API key is valid but Text-to-Speech API is not enabled',
          status: 403,
          solution: [
            '1. Go to https://console.cloud.google.com',
            '2. Select your project',
            '3. Search for "Cloud Text-to-Speech API"',
            '4. Click "Enable"',
            '5. Wait 1-2 minutes for it to activate'
          ],
          details: errorMessage
        });
      } else if (voicesResponse.status === 400 || voicesResponse.status === 401) {
        return res.status(200).json({
          error: 'Invalid Google API key',
          status: voicesResponse.status,
          solution: 'Check your GOOGLE_CLOUD_API_KEY in Vercel settings',
          details: errorMessage
        });
      }
    }

    const voicesData = JSON.parse(voicesText);
    console.log('Successfully retrieved', voicesData.voices?.length, 'voices');

    // Step 2: Test actual TTS synthesis with Spanish
    console.log('Step 2: Testing TTS synthesis with Spanish text...');
    
    const testText = 'Hola, esta es una prueba del sistema de audio.';
    const synthesizeBody = {
      input: { text: testText },
      voice: {
        languageCode: 'es-ES',
        name: 'es-ES-Standard-A',
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0
      }
    };

    console.log('Synthesis request:', JSON.stringify(synthesizeBody, null, 2));

    const synthesizeResponse = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(synthesizeBody)
      }
    );

    const synthesizeText = await synthesizeResponse.text();
    console.log('Synthesis response status:', synthesizeResponse.status);

    if (!synthesizeResponse.ok) {
      console.error('Synthesis failed:', synthesizeText);
      
      let errorMessage = 'Unknown error';
      try {
        const errorData = JSON.parse(synthesizeText);
        errorMessage = errorData.error?.message || synthesizeText;
      } catch (e) {
        errorMessage = synthesizeText;
      }

      return res.status(200).json({
        error: 'TTS synthesis failed',
        status: synthesizeResponse.status,
        voicesWork: true,
        synthesisError: errorMessage,
        possibleIssue: 'The voice name might not be available',
        solution: 'Try using Wavenet voices instead'
      });
    }

    const synthesizeData = JSON.parse(synthesizeText);
    const audioLength = synthesizeData.audioContent?.length || 0;

    // Step 3: Test with Wavenet voice
    console.log('Step 3: Testing with Wavenet voice...');
    
    const wavenetBody = {
      input: { text: testText },
      voice: {
        languageCode: 'es-ES',
        name: 'es-ES-Wavenet-C',
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0
      }
    };

    const wavenetResponse = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(wavenetBody)
      }
    );

    const wavenetOk = wavenetResponse.ok;
    let wavenetAudioLength = 0;
    
    if (wavenetOk) {
      const wavenetData = await wavenetResponse.json();
      wavenetAudioLength = wavenetData.audioContent?.length || 0;
    }

    // Find Spanish voices
    const spanishVoices = voicesData.voices?.filter(v => 
      v.languageCodes?.some(lc => lc.startsWith('es-'))
    ).map(v => ({
      name: v.name,
      gender: v.ssmlGender,
      type: v.name.includes('Wavenet') ? 'Wavenet' : 
            v.name.includes('Neural') ? 'Neural' : 'Standard'
    }));

    return res.status(200).json({
      success: true,
      message: '✅ Google TTS is working correctly!',
      test: {
        voicesList: {
          success: true,
          totalVoices: voicesData.voices?.length || 0,
          spanishVoices: spanishVoices?.length || 0
        },
        standardSynthesis: {
          success: audioLength > 0,
          audioSize: audioLength,
          voice: 'es-ES-Standard-A'
        },
        wavenetSynthesis: {
          success: wavenetOk,
          audioSize: wavenetAudioLength,
          voice: 'es-ES-Wavenet-C'
        }
      },
      availableSpanishVoices: spanishVoices?.slice(0, 10),
      recommendation: wavenetOk ? 
        'Use Wavenet voices for best quality' : 
        'Use Standard voices for compatibility',
      nextSteps: [
        '1. Your Google TTS is configured correctly',
        '2. The multilingual-tts.js should work now',
        '3. Try generating audio in Spanish'
      ]
    });

  } catch (error) {
    console.error('Test error:', error);
    return res.status(500).json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
