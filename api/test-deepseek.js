export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test the DeepSeek API directly with a simple prompt
    const DEEPSEEK_API_KEY = 'sk-02c5e57c70a24590bf83a60f3ea8a226';
    
    console.log('Testing DeepSeek API...');
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: 'Write a one paragraph description of the Eiffel Tower.'
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', responseText);

    if (!response.ok) {
      return res.status(200).json({ 
        error: true,
        status: response.status,
        message: responseText
      });
    }

    const data = JSON.parse(responseText);
    
    return res.status(200).json({
      success: true,
      response: data,
      content: data.choices?.[0]?.message?.content || 'No content'
    });

  } catch (error) {
    return res.status(200).json({ 
      error: true,
      message: error.message,
      stack: error.stack
    });
  }
}
