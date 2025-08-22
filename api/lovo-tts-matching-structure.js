// api/lovo-tts.js
export default async function handler(req, res) {
  // Enable CORS headers (same as your OpenAI endpoint)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests (like your other endpoints)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice, language } = req.body;

    // Validate input
    if (!text) {
      return res.status(400).json({ 
        error: 'Text is required',
        received: req.body 
      });
    }

    // Use environment variable or fallback
    const LOVO_API_KEY = process.env.LOVO_API_KEY || '794d1665-e8e5-4fd6-bc5a-c667c2a62cd4';
    
    console.log('Creating TTS job for voice:', voice || 'en-US-sophia');

    // Step 1: Create TTS job
    const createResponse = await fetch('https://api.genny.lovo.ai/api/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        speaker: voice || 'en-US-sophia',
        language: language || 'en-US',
        text: text,
        speed: 1.0,
        pause: 0.5,
        emphasis: [[]]
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Lovo API error:', createResponse.status, errorText);
      return res.status(createResponse.status).json({ 
        error: 'Lovo API error',
        details: errorText
      });
    }

    const jobData = await createResponse.json();
    const jobId = jobData.id;

    if (!jobId) {
      return res.status(500).json({ 
        error: 'No job ID returned',
        data: jobData 
      });
    }

    // Step 2: Poll for completion (max 30 seconds)
    let audioUrl = null;
    let attempts = 0;

    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));

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
          return res.status(500).json({ 
            error: 'TTS generation failed',
            jobId: jobId 
          });
        }
      }
      
      attempts++;
    }

    if (!audioUrl) {
      return res.status(500).json({ 
        error: 'Timeout waiting for audio generation',
        jobId: jobId 
      });
    }

    // Return success
    return res.status(200).json({
      success: true,
      audioUrl: audioUrl,
      jobId: jobId
    });

  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}