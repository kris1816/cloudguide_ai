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
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // DeepSeek API configuration
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-02c5e57c70a24590bf83a60f3ea8a226';
    const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

    console.log('Calling DeepSeek API with prompt length:', prompt.length);

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
            content: 'You are a professional audioguide writer. Create engaging, detailed content for tourist audioguides. Write in a natural, flowing narrative style without headers or bullet points.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
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

    // Return in the format that index.html expects
    return res.status(200).json({
      content: content,
      generated_text: content, // Fallback field
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
