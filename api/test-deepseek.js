// api/test-deepseek.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    // Check if API key exists
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'DEEPSEEK_API_KEY not found in environment variables',
        debug: {
          hasKey: false,
          keyLength: 0,
          allEnvKeys: Object.keys(process.env).filter(key => key.includes('DEEPSEEK'))
        }
      });
    }

    // Check API key format
    if (!apiKey.startsWith('sk-')) {
      return res.status(500).json({ 
        error: 'Invalid API key format',
        debug: {
          hasKey: true,
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 3),
          expectedPrefix: 'sk-'
        }
      });
    }

    // Test API call to DeepSeek
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: 'Test message. Reply with "API working".'
          }
        ],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ 
        error: 'DeepSeek API rejected the request',
        status: response.status,
        details: errorData,
        debug: {
          hasKey: true,
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 10) + '...'
        }
      });
    }

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      message: 'DeepSeek API is working correctly!',
      response: data.choices[0].message.content,
      debug: {
        hasKey: true,
        keyLength: apiKey.length,
        model: data.model,
        usage: data.usage
      }
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
