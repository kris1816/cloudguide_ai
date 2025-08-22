// api/translate-openai.js
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

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    console.log(`Translating from ${fromLanguage} to ${toLanguage}`);

    const prompt = `You are a professional translator specializing in audioguide content. Translate the following text from ${fromLanguage} to ${toLanguage}.

CRITICAL REQUIREMENTS:
- Maintain the exact same structure and formatting
- Keep all section headers (STOP 1:, STOP 2:, etc.) exactly as they are
- Preserve all line breaks, dashes, and spacing
- Translate content naturally while keeping the professional audioguide tone
- Maintain cultural and historical accuracy
- Keep proper nouns appropriate for the target language
- Do not add any explanations or notes, only provide the translated text

TEXT TO TRANSLATE:
${text}

TRANSLATED TEXT:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator specializing in audioguide and tourism content. You translate text accurately while preserving formatting and structure.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3, // Low temperature for consistent translation
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API Error:', response.status, errorText);
      
      return res.status(response.status).json({ 
        error: 'OpenAI translation failed',
        details: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({ 
        error: 'Invalid response format from OpenAI API',
        data: data
      });
    }

    const translatedText = data.choices[0].message.content;

    return res.status(200).json({
      success: true,
      translatedText: translatedText,
      fromLanguage: fromLanguage,
      toLanguage: toLanguage,
      model: 'OpenAI GPT-3.5',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Translation API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
