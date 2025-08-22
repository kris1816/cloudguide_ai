export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Test endpoint
  if (req.method === 'GET') {
    return res.status(200).json({ 
      message: 'OpenAI TTS endpoint is working!',
      timestamp: new Date().toISOString()
    });
  }

  // Handle POST request
  if (req.method === 'POST') {
    try {
      const { text, voice, speed } = req.body;

      // Validate input
      if (!text) {
        return res.status(400).json({ 
          error: 'Text is required'
        });
      }

      // Get OpenAI API key from environment variable
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      
      if (!OPENAI_API_KEY) {
        return res.status(500).json({ 
          error: 'OpenAI API key not configured'
        });
      }

      console.log('Generating audio with OpenAI TTS...');

      // OpenAI TTS API call
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',  // or 'tts-1-hd' for higher quality
          input: text,
          voice: voice || 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
          speed: speed || 1.0  // 0.25 to 4.0
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        return res.status(500).json({ 
          error: 'Failed to generate audio',
          details: errorText
        });
      }

      // Get the audio data as a buffer
      const audioBuffer = await response.arrayBuffer();
      
      // Convert to base64 for sending to frontend
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;

      // Return success with audio data
      return res.status(200).json({
        success: true,
        audioUrl: audioDataUrl,
        message: 'Audio generated successfully'
      });

    } catch (error) {
      console.error('Error in handler:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}
