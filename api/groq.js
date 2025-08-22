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
      message: 'Groq API endpoint is working!',
      timestamp: new Date().toISOString()
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Groq API configuration
    // You'll need to get a free API key from https://console.groq.com/keys
    const GROQ_API_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY_HERE';
    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    console.log('Calling Groq API...');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768', // Fast and high quality model
        messages: [
          {
            role: 'system',
            content: 'You are a professional audioguide writer. Create engaging, detailed content for tourist audioguides. Write in a natural, flowing narrative style without headers or bullet points. Follow the instructions exactly.'
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      
      if (response.status === 401) {
        return res.status(500).json({ 
          error: 'Groq API authentication failed. Please add a valid GROQ_API_KEY to your environment variables.',
          instructions: 'Get a free API key at https://console.groq.com/keys'
        });
      }
      
      return res.status(500).json({ 
        error: 'Groq API error',
        status: response.status,
        details: errorText
      });
    }

    const data = await response.json();

    // Check if we have a valid response
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid Groq response structure:', data);
      return res.status(500).json({ 
        error: 'Invalid response structure from Groq',
        data: data
      });
    }

    const content = data.choices[0].message.content;

    // Return in the format that index.html expects
    return res.status(200).json({
      success: true,
      content: content,
      generated_text: content,
      model: data.model,
      usage: data.usage
    });

  } catch (error) {
    console.error('Groq handler error:', error);
    
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
