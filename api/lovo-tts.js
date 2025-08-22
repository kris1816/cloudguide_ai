// api/lovo-tts.js
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice, language } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get API key from environment variable
    const LOVO_API_KEY = process.env.LOVO_API_KEY;
    
    if (!LOVO_API_KEY) {
      console.error('LOVO_API_KEY is not set in environment variables');
      return res.status(500).json({ 
        error: 'API configuration error', 
        details: 'LOVO_API_KEY is not configured in Vercel environment variables' 
      });
    }

    console.log('Using API Key (first 10 chars):', LOVO_API_KEY.substring(0, 10) + '...');
    console.log('Request params:', { voice, language, textLength: text.length });

    // Step 1: Create TTS job
    const createResponse = await fetch('https://api.genny.lovo.ai/api/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVO_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
      
      if (createResponse.status === 401) {
        return res.status(401).json({ 
          error: 'Authentication failed', 
          details: 'Invalid API key. Please check your Lovo API key in Vercel settings.',
          status: 401
        });
      }
      
      return res.status(createResponse.status).json({ 
        error: 'Failed to create TTS job',
        details: errorText,
        status: createResponse.status
      });
    }

    const createData = await createResponse.json();
    const jobId = createData.id;

    if (!jobId) {
      return res.status(500).json({ 
        error: 'No job ID returned',
        details: 'The API did not return a job ID',
        data: createData
      });
    }

    console.log('Job created:', jobId);

    // Step 2: Poll for job completion
    let audioUrl = null;
    let retries = 0;
    const maxRetries = 30;

    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const statusResponse = await fetch(`https://api.genny.lovo.ai/api/v1/tts/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${LOVO_API_KEY}`,
          'Accept': 'application/json'
        }
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log('Job status:', statusData.status);

        if (statusData.status === 'completed' && statusData.download_url) {
          audioUrl = statusData.download_url;
          break;
        } else if (statusData.status === 'failed') {
          return res.status(500).json({ 
            error: 'TTS generation failed',
            details: 'The Lovo API failed to generate audio',
            jobId: jobId
          });
        }
      }

      retries++;
    }

    if (!audioUrl) {
      return res.status(500).json({ 
        error: 'TTS generation timeout',
        details: 'The audio generation took too long',
        jobId: jobId
      });
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
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
