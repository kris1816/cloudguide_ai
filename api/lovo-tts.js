// Save this file as: api/lovo-tts.js in your Vercel project

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice, language, speed = '1.0', pitch = '0' } = req.body;

    if (!text || !voice) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Get API key from environment variable
    const LOVO_API_KEY = process.env.LOVO_API_KEY || '794d1665-e8e5-4fd6-bc5a-c667c2a62cd4';

    // Create TTS job with Lovo API
    const ttsResponse = await fetch('https://api.genny.lovo.ai/api/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        speaker: voice,
        text: text,
        speed: speed.toString(),
        pitch: pitch.toString()
      })
    });

    if (!ttsResponse.ok) {
      const errorData = await ttsResponse.text();
      console.error('Lovo API error:', errorData);
      return res.status(ttsResponse.status).json({ 
        error: 'TTS API error', 
        details: errorData 
      });
    }

    const jobData = await ttsResponse.json();
    const jobId = jobData.id;

    // Poll for job completion (max 30 seconds)
    let audioUrl = null;
    let retries = 0;
    const maxRetries = 30;

    while (!audioUrl && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const statusResponse = await fetch(`https://api.genny.lovo.ai/api/v1/tts/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${LOVO_API_KEY}`
        }
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (statusData.status === 'completed' && statusData.download_url) {
          audioUrl = statusData.download_url;
          break;
        } else if (statusData.status === 'failed') {
          return res.status(500).json({ error: 'TTS generation failed' });
        }
      }

      retries++;
    }

    if (!audioUrl) {
      return res.status(500).json({ error: 'TTS generation timeout' });
    }

    // Return the audio URL
    return res.status(200).json({
      success: true,
      audioUrl: audioUrl,
      jobId: jobId
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}

// Alternative: If you want to list available voices
export async function getVoices(req, res) {
  try {
    const LOVO_API_KEY = process.env.LOVO_API_KEY || '794d1665-e8e5-4fd6-bc5a-c667c2a62cd4';
    
    const response = await fetch('https://api.genny.lovo.ai/api/v1/speakers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOVO_API_KEY}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch voices' });
    }

    const voices = await response.json();
    
    // Filter for English and Spanish voices
    const filteredVoices = voices.filter(voice => 
      voice.language === 'en-US' || voice.language === 'es-ES'
    );

    return res.status(200).json({
      success: true,
      voices: filteredVoices
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
