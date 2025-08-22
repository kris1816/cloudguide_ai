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
      const { text, voice, language, speed, pitch } = req.body;

      // Validate input
      if (!text) {
        return res.status(400).json({ 
          error: 'Text is required'
        });
      }

      // Get API key (from environment variable or fallback)
      const LOVO_API_KEY = process.env.LOVO_API_KEY || '794d1665-e8e5-4fd6-bc5a-c667c2a62cd4';
      
      console.log('Starting TTS generation for voice:', voice || 'en-US-sophia');

      // Create TTS job with Lovo API
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
          speed: speed || 1.0,
          pause: 0.5,
          emphasis: [[]]
        })
      });

      const responseText = await createResponse.text();
      console.log('Lovo API response status:', createResponse.status);

      if (!createResponse.ok) {
        console.error('Lovo API error:', createResponse.status, responseText);
        
        // Try to parse error message
        let errorMessage = 'Failed to create TTS job';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = responseText || errorMessage;
        }
        
        return res.status(500).json({ 
          error: errorMessage,
          status: createResponse.status
        });
      }

      // Parse the response
      let jobData;
      try {
        jobData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse Lovo response:', responseText);
        return res.status(500).json({ 
          error: 'Invalid response from Lovo API'
        });
      }

      const jobId = jobData.id;

      if (!jobId) {
        console.error('No job ID in response:', jobData);
        return res.status(500).json({ 
          error: 'No job ID returned from Lovo'
        });
      }

      console.log('TTS job created with ID:', jobId);

      // Poll for completion (max 30 seconds)
      let audioUrl = null;
      for (let i = 0; i < 30; i++) {
        // Wait 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
          const statusResponse = await fetch(`https://api.genny.lovo.ai/api/v1/tts/${jobId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${LOVO_API_KEY}`,
              'Accept': 'application/json'
            }
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log(`Poll ${i + 1}: status = ${statusData.status}`);
            
            if (statusData.status === 'completed' && statusData.download_url) {
              audioUrl = statusData.download_url;
              console.log('Audio generation completed!');
              break;
            } else if (statusData.status === 'failed') {
              return res.status(500).json({ 
                error: 'TTS generation failed',
                jobId: jobId
              });
            }
          } else {
            console.error('Failed to check job status:', statusResponse.status);
          }
        } catch (pollError) {
          console.error('Error polling status:', pollError.message);
        }
      }

      if (!audioUrl) {
        return res.status(500).json({ 
          error: 'Timeout - audio generation took too long',
          jobId: jobId
        });
      }

      // Return success with audio URL
      return res.status(200).json({
        success: true,
        audioUrl: audioUrl,
        jobId: jobId
      });

    } catch (error) {
      console.error('Error in handler:', error);
      console.error('Error stack:', error.stack);
      
      // Return a proper JSON error response
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}
