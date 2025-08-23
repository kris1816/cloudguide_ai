// api/multilingual-tts.js
// Simplified TTS handler with OpenAI and Google Cloud TTS only

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, language, voice, speed } = req.body;

    // Validate input
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Check if we have Google API key
    const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please add OPENAI_API_KEY to your environment variables'
      });
    }
    
    // Decision logic:
    // 1. Use OpenAI for English (it's excellent for English)
    // 2. Use Google for other languages if available
    // 3. Fall back to OpenAI with warning for non-English if no Google
    
    const isEnglish = language.startsWith('en-');
    
    if (isEnglish) {
      // Always use OpenAI for English - it's the best option
      console.log(`Using OpenAI for English content (${language})`);
      return await generateOpenAITTS(text, voice, speed, res);
    } else if (GOOGLE_API_KEY) {
      // Use Google for non-English languages
      console.log(`Using Google Cloud TTS for ${language}`);
      return await generateGoogleTTS(text, language, speed, GOOGLE_API_KEY, res);
    } else {
      // Fallback to OpenAI with warning
      console.log(`Using OpenAI for ${language} (Google not configured)`);
      const warning = `⚠️ Using OpenAI for ${language}. Audio will have English accent. For native pronunciation, configure Google Cloud TTS.`;
      return await generateOpenAITTS(text, voice, speed, res, warning);
    }

  } catch (error) {
    console.error('TTS Error:', error);
    return res.status(500).json({ 
      error: 'TTS generation failed',
      message: error.message 
    });
  }
}

// OpenAI TTS Generation
async function generateOpenAITTS(text, voice, speed, res, warning = null) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  try {
    console.log('Calling OpenAI TTS API...');
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',  // You can make this configurable if needed
        input: text,
        voice: voice || 'alloy',
        speed: speed || 1.0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI TTS Error:', errorText);
      throw new Error(`OpenAI TTS failed: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    return res.status(200).json({
      success: true,
      audioUrl: `data:audio/mp3;base64,${base64Audio}`,
      provider: 'openai',
      voice: voice,
      warning: warning
    });
    
  } catch (error) {
    console.error('OpenAI TTS Error:', error);
    throw error;
  }
}

// Google Cloud TTS Generation
async function generateGoogleTTS(text, language, speed, apiKey, res) {
  try {
    console.log(`Calling Google TTS for ${language}...`);
    
    // Google voice selection based on language
    // Using Wavenet voices for better quality where available
    const googleVoices = {
      // Spanish variants
      'es-ES': { name: 'es-ES-Wavenet-C', gender: 'FEMALE' },  // Spanish (Spain) - Sofia voice
      'es-MX': { name: 'es-MX-Wavenet-A', gender: 'FEMALE' },  // Spanish (Mexico)
      'es-US': { name: 'es-US-Wavenet-A', gender: 'FEMALE' },  // Spanish (US)
      
      // European languages
      'fr-FR': { name: 'fr-FR-Wavenet-E', gender: 'FEMALE' },  // French - Marie voice
      'de-DE': { name: 'de-DE-Wavenet-F', gender: 'FEMALE' },  // German - Anna voice
      'it-IT': { name: 'it-IT-Wavenet-A', gender: 'FEMALE' },  // Italian - Giulia voice
      'pt-PT': { name: 'pt-PT-Wavenet-A', gender: 'FEMALE' },  // Portuguese (Portugal)
      'pt-BR': { name: 'pt-BR-Wavenet-A', gender: 'FEMALE' },  // Portuguese (Brazil)
      
      // Asian languages
      'zh-CN': { name: 'cmn-CN-Wavenet-A', gender: 'FEMALE' }, // Chinese Mandarin
      'ja-JP': { name: 'ja-JP-Wavenet-B', gender: 'FEMALE' },  // Japanese
      'ko-KR': { name: 'ko-KR-Wavenet-A', gender: 'FEMALE' },  // Korean
      
      // Other languages
      'ru-RU': { name: 'ru-RU-Wavenet-E', gender: 'FEMALE' },  // Russian
      'ar-XA': { name: 'ar-XA-Wavenet-A', gender: 'FEMALE' },  // Arabic
      'hi-IN': { name: 'hi-IN-Wavenet-A', gender: 'FEMALE' },  // Hindi
      'nl-NL': { name: 'nl-NL-Wavenet-E', gender: 'FEMALE' },  // Dutch
      'pl-PL': { name: 'pl-PL-Wavenet-E', gender: 'FEMALE' },  // Polish
      'tr-TR': { name: 'tr-TR-Wavenet-E', gender: 'FEMALE' },  // Turkish
      'sv-SE': { name: 'sv-SE-Wavenet-A', gender: 'FEMALE' },  // Swedish
      'da-DK': { name: 'da-DK-Wavenet-A', gender: 'FEMALE' },  // Danish
      'no-NO': { name: 'nb-NO-Wavenet-E', gender: 'FEMALE' },  // Norwegian
      'fi-FI': { name: 'fi-FI-Wavenet-A', gender: 'FEMALE' },  // Finnish
      
      // Fallback to English if language not found
      'default': { name: 'en-US-Wavenet-F', gender: 'FEMALE' }
    };

    // Select appropriate voice or use default
    const selectedVoice = googleVoices[language] || googleVoices['default'];
    
    // Use the language code for the voice if not specified
    const voiceLanguageCode = language || 'en-US';

    const requestBody = {
      input: { text: text },
      voice: {
        languageCode: voiceLanguageCode,
        name: selectedVoice.name,
        ssmlGender: selectedVoice.gender
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: speed || 1.0,
        pitch: 0,  // Natural pitch
        volumeGainDb: 0,  // Normal volume
        effectsProfileId: ['headphone-class-device']  // Optimized for headphones
      }
    };

    console.log('Google TTS Request:', {
      voice: selectedVoice.name,
      language: voiceLanguageCode,
      textLength: text.length
    });

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google TTS Error Response:', errorData);
      
      // Provide helpful error messages
      if (response.status === 403) {
        throw new Error('Google API key is invalid or doesn\'t have Text-to-Speech API enabled');
      } else if (response.status === 400) {
        throw new Error(`Google TTS error: ${errorData.error?.message || 'Invalid request'}`);
      } else {
        throw new Error(`Google TTS failed: ${errorData.error?.message || response.statusText}`);
      }
    }

    const data = await response.json();
    
    if (!data.audioContent) {
      throw new Error('No audio content received from Google TTS');
    }
    
    console.log('Google TTS Success! Audio generated.');
    
    return res.status(200).json({
      success: true,
      audioUrl: `data:audio/mp3;base64,${data.audioContent}`,
      provider: 'google',
      voice: selectedVoice.name,
      language: voiceLanguageCode,
      nativeLanguage: true
    });
    
  } catch (error) {
    console.error('Google TTS Error:', error);
    throw error;
  }
}

// Export configuration for reference
export const supportedLanguages = {
  // English variants (OpenAI)
  'en-US': { provider: 'openai', name: 'English (US)' },
  'en-GB': { provider: 'openai', name: 'English (UK)' },
  
  // Spanish variants (Google)
  'es-ES': { provider: 'google', name: 'Spanish (Spain)' },
  'es-MX': { provider: 'google', name: 'Spanish (Mexico)' },
  'es-US': { provider: 'google', name: 'Spanish (US)' },
  
  // European languages (Google)
  'fr-FR': { provider: 'google', name: 'French' },
  'de-DE': { provider: 'google', name: 'German' },
  'it-IT': { provider: 'google', name: 'Italian' },
  'pt-PT': { provider: 'google', name: 'Portuguese (Portugal)' },
  'pt-BR': { provider: 'google', name: 'Portuguese (Brazil)' },
  'nl-NL': { provider: 'google', name: 'Dutch' },
  'pl-PL': { provider: 'google', name: 'Polish' },
  'ru-RU': { provider: 'google', name: 'Russian' },
  'tr-TR': { provider: 'google', name: 'Turkish' },
  'sv-SE': { provider: 'google', name: 'Swedish' },
  'da-DK': { provider: 'google', name: 'Danish' },
  'no-NO': { provider: 'google', name: 'Norwegian' },
  'fi-FI': { provider: 'google', name: 'Finnish' },
  
  // Asian languages (Google)
  'zh-CN': { provider: 'google', name: 'Chinese (Simplified)' },
  'ja-JP': { provider: 'google', name: 'Japanese' },
  'ko-KR': { provider: 'google', name: 'Korean' },
  
  // Other languages (Google)
  'ar-XA': { provider: 'google', name: 'Arabic' },
  'hi-IN': { provider: 'google', name: 'Hindi' }
};
