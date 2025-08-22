// api/groq.js - Robust version with model fallbacks
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
    const { destination, stops, tourType, language } = req.body;

    // Basic validation
    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API key not configured in environment variables' });
    }

    const numStops = parseInt(stops) || 8;
    console.log(`Generating ${numStops} stops for ${destination}`);

    // List of models to try (in order of preference)
    const modelFallbacks = [
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant', 
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
      'llama3-70b-8192',
      'llama3-8b-8192'
    ];

    // Simplified prompt that works better with Groq
    const prompt = `Write a detailed ${numStops}-stop audioguide for ${destination}.

REQUIREMENTS:
- Language: ${language}
- Exactly ${numStops} stops
- Each stop should be about 900 words
- Professional audioguide style

FORMAT:
STOP 1: INTRODUCTION
------------------------------
[Write detailed introduction about ${destination}]

STOP 2: HISTORY  
------------------------------
[Write comprehensive history]

STOP 3: MAIN ATTRACTION 1
------------------------------
[Write about major attraction]

${numStops > 3 ? `[Continue pattern for all ${numStops} stops]` : ''}

Write engaging, informative content about ${destination} with specific historical facts, architectural details, and cultural insights.`;

    let lastError = null;
    
    // Try each model until one works
    for (const model of modelFallbacks) {
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
                content: 'You are an expert audioguide writer creating engaging, detailed content for tourists and travelers.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 4000,
            temperature: 0.8,
            top_p: 0.9
          })
        });

        console.log(`Groq API Response Status for ${model}:`, response.status);

        if (response.ok) {
          const data = await response.json();
          
          if (data.choices && data.choices[0] && data.choices[0].message) {
            const content = data.choices[0].message.content;
            
            // Format response
            const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Language: ${language}
Tour Type: ${tourType}
Total Stops: ${numStops}
AI Model: Groq ${model}
Source: Direct Input

===================================================

${content}

===================================================
© CloudGuide - www.cloudguide.me`;

            console.log(`Success with model: ${model}`);
            return res.status(200).json({
              success: true,
              content: formattedContent,
              destination,
              stops: numStops,
              model: `Groq ${model}`,
              modelUsed: model
            });
          }
        } else {
          const errorText = await response.text();
          lastError = `Model ${model} failed: ${errorText}`;
          console.error(lastError);
          continue; // Try next model
        }
        
      } catch (modelError) {
        lastError = `Model ${model} error: ${modelError.message}`;
        console.error(lastError);
        continue; // Try next model
      }
    }

    // If all models failed
    return res.status(500).json({ 
      error: 'All Groq models failed', 
      details: lastError,
      availableModels: modelFallbacks,
      suggestion: 'Try using OpenAI or DeepSeek instead'
    });

  } catch (error) {
    console.error('Groq API Handler Error:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      message: error.message,
      suggestion: 'Check your Groq API key and try again'
    });
  }
}
