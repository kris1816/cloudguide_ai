export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request (for testing)
  if (req.method === 'GET') {
    return res.status(200).json({ 
      message: 'Lovo TTS endpoint is working!',
      method: 'GET',
      timestamp: new Date().toISOString()
    });
  }

  // Handle POST request
  if (req.method === 'POST') {
    try {
      const { text, voice, language } = req.body;

      // Validate input
      if (!text) {
        return res.status(400).json({ 
          error: 'Text is required'
        });
      }

      // Get API key
      const LOVO_API_KEY = process.env.LOVO_API_KEY || '794d1665-e8e5-4fd6-bc5a-c667c2a62cd4';
      
      console.log('Starting TTS generation...');

      // Create TTS job
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
        console.error('Lovo API error:', errorText);
        return res.status(500).json({ 
          error: 'Lovo API error',
          details: errorText
        });
      }

      const jobData = await createResponse.json();
      const jobId = jobData.id;

      if (!jobId) {
        return res.status(500).json({ 
          error: 'No job ID returned'
        });
      }

      // Poll for completion
      let audioUrl = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResponse = await fetch(`https://api.genny.lovo.ai/api/v1/tts/${jobId}`, {
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
              error: 'TTS generation failed'
            });
          }
        }
      }

      if (!audioUrl) {
        return res.status(500).json({ 
          error: 'Timeout waiting for audio'
        });
      }

      return res.status(200).json({
        success: true,
        audioUrl: audioUrl,
        jobId: jobId
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ 
        error: 'Server error',
        message: error.message
      });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}
    });
  }
}
