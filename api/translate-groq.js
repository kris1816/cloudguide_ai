// api/translate-groq.js
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

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API key not configured' });
    }

    console.log(`Translating from ${fromLanguage} to ${toLanguage} using Groq`);

    const prompt = `Translate this audioguide content from ${fromLanguage} to ${toLanguage}. Keep the exact same formatting and structure.

RULES:
- Keep all headers like "STOP 1:", "STOP 2:" exactly the same
- Keep all dashes and line breaks
- Translate only the content, not the structure
- Use professional audioguide language

TEXT:
${text}

TRANSLATION:`;

    // Try multiple Groq models
    const models = ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
    
    for (const model of models) {
      try {
        console.log(`Trying Groq model: ${model}`);
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are a professional translator. Translate text accurately while preserving exact formatting and structure.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 4000,
            temperature: 0.3,
            top_p: 0.9
          })
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.choices && data.choices[0] && data.choices[0].message) {
            const translatedText = data.choices[0].message.content;
            
            return res.status(200).json({
              success: true,
              translatedText: translatedText,
              fromLanguage: fromLanguage,
              toLanguage: toLanguage,
              model: `Groq ${model}`,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          console.log(`Model ${model} failed, trying next...`);
          continue;
        }
        
      } catch (modelError) {
        console.log(`Model ${model} error:`, modelError.message);
        continue;
      }
    }

    // If all models failed
    return res.status(500).json({ 
      error: 'All Groq models failed for translation',
      suggestion: 'Try using OpenAI or DeepSeek instead'
    });

  } catch (error) {
    console.error('Groq Translation API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
