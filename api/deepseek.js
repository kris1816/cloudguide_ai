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
    // Handle both formats - the old format (location, duration, interests) and new format (prompt)
    const { prompt, location, duration, interests } = req.body;
    
    let finalPrompt = '';
    
    if (prompt) {
      // New format from current index.html
      finalPrompt = prompt;
    } else if (location) {
      // Old format that was working
      finalPrompt = `Create a detailed audioguide for visiting ${location}. 
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
    } else {
      return res.status(400).json({ error: 'Either prompt or location is required' });
    }

    // DeepSeek API configuration
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-02c5e57c70a24590bf83a60f3ea8a226';
    const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

    console.log('Calling DeepSeek API...');

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
            content: 'You are a professional travel guide and audioguide writer. Create engaging, detailed, informative content for tourist audioguides. Write in a natural, flowing narrative style.'
          },
          {
            role: 'user',
            content: finalPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', response.status, errorText);
      
      return res.status(500).json({ 
        error: 'DeepSeek API error',
        status: response.status,
        details: errorText
      });
    }

    const data = await response.json();

    // Check if we have a valid response
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid DeepSeek response structure:', data);
      return res.status(500).json({ 
        error: 'Invalid response structure from DeepSeek',
        data: data
      });
    }

    const content = data.choices[0].message.content;

    // Return in multiple formats for compatibility
    return res.status(200).json({
      success: true,
      content: content,  // For new index.html format
      generated_text: content,  // Alternative field
      location: location,
      duration: duration,
      interests: interests,
      usage: data.usage
    });

  } catch (error) {
    console.error('DeepSeek handler error:', error);
    
    // Return a proper error response
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
