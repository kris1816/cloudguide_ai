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
      message: 'DeepSeek API endpoint is working!',
      timestamp: new Date().toISOString()
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { location, duration, interests } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    // DeepSeek API configuration
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-02c5e57c70a24590bf83a60f3ea8a226';
    const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

    const prompt = `Create a detailed audioguide for visiting ${location}. 
Duration: ${duration || 'half-day'}. 
Interests: ${interests || 'general sightseeing'}.

Please provide:
1. A brief introduction to ${location}
2. Top 5 must-see attractions with descriptions
3. Suggested route and timing
4. Local tips and recommendations
5. Cultural insights
6. Practical information (best time to visit, what to bring, etc.)

Format the response with clear sections using "STOP 1:", "STOP 2:", etc. for each attraction.
Make it engaging and informative, as if a knowledgeable local guide is speaking.`;

    console.log('Calling DeepSeek API for:', location);

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a professional travel guide creating engaging audioguides for tourists. Your responses should be informative, friendly, and well-structured.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false
      })
    });

    const responseText = await response.text();
    console.log('DeepSeek API response status:', response.status);

    if (!response.ok) {
      console.error('DeepSeek API error:', response.status, responseText);
      
      // Try to parse error
      let errorMessage = 'DeepSeek API error';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch (e) {
        errorMessage = responseText || errorMessage;
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        status: response.status
      });
    }

    // Parse response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse DeepSeek response:', responseText);
      return res.status(500).json({ 
        error: 'Invalid response from DeepSeek'
      });
    }

    // Check if we have a valid response
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid DeepSeek response structure:', data);
      return res.status(500).json({ 
        error: 'Invalid response structure from DeepSeek'
      });
    }

    const content = data.choices[0].message.content;

    // Return success
    return res.status(200).json({
      success: true,
      content: content,
      location: location,
      duration: duration,
      interests: interests,
      model: 'deepseek-chat',
      usage: data.usage
    });

  } catch (error) {
    console.error('DeepSeek handler error:', error);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
