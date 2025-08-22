// api/translate-deepseek.js
export default async function handler(req, res) {
  // Handle CORS
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
    const { text, fromLanguage, toLanguage } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required for translation' });
    }

    if (!fromLanguage || !toLanguage) {
      return res.status(400).json({ error: 'Source and target languages are required' });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'DeepSeek API key not configured' });
    }

    console.log(`Translating from ${fromLanguage} to ${toLanguage} using DeepSeek`);

    const prompt = `Translate the following audioguide content from ${fromLanguage} to ${toLanguage}.

IMPORTANT:
- Keep the exact same structure and formatting
- Preserve all headers like "STOP 1:", "STOP 2:", etc.
- Keep all dashes (-----) and line breaks
- Translate content naturally but maintain professional tone
- Do not add explanations, only provide the translation

TEXT TO TRANSLATE:
${text}

TRANSLATION:`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator specializing in tourism and audioguide content. You translate accurately while preserving formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error:', response.status, errorText);
      
      return res.status(response.status).json({ 
        error: 'DeepSeek translation failed',
        details: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({ 
        error: 'Invalid response format from DeepSeek API',
        data: data
      });
    }

    const translatedText = data.choices[0].message.content;

    return res.status(200).json({
      success: true,
      translatedText: translatedText,
      fromLanguage: fromLanguage,
      toLanguage: toLanguage,
      model: 'DeepSeek Chat',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('DeepSeek Translation API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
