export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('DeepSeek API called with prompt length:', req.body.prompt?.length);
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional audioguide script writer. Create engaging, detailed, and immersive content.'
                    },
                    {
                        role: 'user',
                        content: req.body.prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.8
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('DeepSeek API error:', error);
            throw new Error(`DeepSeek API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Format response to match frontend expectations
        res.status(200).json({
            content: data.choices?.[0]?.message?.content || '',
            generated_text: data.choices?.[0]?.message?.content || ''
        });
    } catch (error) {
        console.error('DeepSeek Error:', error);
        res.status(500).json({ error: error.message });
    }
}
      message: error.message 
    });
  }
}
