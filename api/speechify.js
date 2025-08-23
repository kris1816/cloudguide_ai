/ api/speechify.js - Speechify API endpoint for Vercel
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice, language, speed } = req.body;

    // Validate input
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get API key from environment variable
    const SPEECHIFY_API_KEY = process.env.SPEECHIFY_API_KEY;
    
    if (!SPEECHIFY_API_KEY) {
      return res.status(500).json({ 
        error: 'Speechify API key not configured',
        solution: 'Add SPEECHIFY_API_KEY to your Vercel environment variables'
      });
    }

    console.log(`Generating audio with Speechify voice: ${voice}, language: ${language}`);

    // Map voice selections to Speechify voice IDs
    const voiceMap = {
      'snoop': 'snoop-dogg',
      'gwyneth': 'gwyneth-paltrow', 
      'david': 'david-attenborough',
      'james': 'james-earl-jones',
      // Add more voice mappings as needed
    };

    const speechifyVoice = voiceMap[voice] || 'default';

    // Call Speechify API
    // Note: This is a placeholder - you'll need to check Speechify's actual API documentation
    // for the correct endpoint and request format
    const response = await fetch('https://api.speechify.com/v1/audio/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SPEECHIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        voice_id: speechifyVoice,
        language: language || 'en-US',
        speed: speed || 1.0,
        format: 'mp3'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Speechify API error:', response.status, errorText);
      
      return res.status(500).json({ 
        error: 'Speechify API error',
        status: response.status,
        details: errorText
      });
    }

    const data = await response.json();
    
    // Return the audio URL or base64 data
    // The actual response format will depend on Speechify's API
    return res.status(200).json({
      success: true,
      audioUrl: data.audio_url || data.url,
      audioData: data.audio_data, // If they return base64
      format: 'mp3',
      voice: voice,
      duration: data.duration
    });

  } catch (error) {
    console.error('Speechify handler error:', error);
    
    // Fallback to OpenAI TTS if Speechify fails
    if (process.env.OPENAI_API_KEY) {
      console.log('Falling back to OpenAI TTS...');
      
      try {
        const openAIResponse = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: req.body.text,
            voice: 'alloy', // or 'nova', 'echo', 'fable', 'onyx', 'shimmer'
            speed: req.body.speed || 1.0
          })
        });

        if (openAIResponse.ok) {
          const audioBuffer = await openAIResponse.arrayBuffer();
          const base64Audio = Buffer.from(audioBuffer).toString('base64');
          
          return res.status(200).json({
            success: true,
            audioData: `data:audio/mp3;base64,${base64Audio}`,
            format: 'mp3',
            voice: 'openai-alloy',
            fallback: true,
            message: 'Generated with OpenAI TTS (Speechify unavailable)'
          });
        }
      } catch (fallbackError) {
        console.error('OpenAI fallback also failed:', fallbackError);
      }
    }
    
    return res.status(500).json({ 
      error: 'Audio generation failed',
      message: error.message
    });
  }
}
