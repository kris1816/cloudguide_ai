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
        console.log('OpenAI API called with prompt length:', req.body.prompt?.length);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional audioguide script writer. Create engaging, detailed, and immersive content for tourist locations.'
                    },
                    {
                        role: 'user',
                        content: req.body.prompt
                    }
                ],
                max_tokens: req.body.max_tokens || 2000,
                temperature: req.body.temperature || 0.8
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('OpenAI API error:', error);
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('OpenAI Error:', error);
        res.status(500).json({ error: error.message });
    }
}
