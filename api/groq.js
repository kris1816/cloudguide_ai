// api/groq.js - Simplified working version
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
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Simple prompt for testing
    const prompt = `Create an audioguide for ${destination} with ${stops} stops. Make each stop about 900 words. Format as:

STOP 1: INTRODUCTION
------------------------------
[900 words about ${destination}]

STOP 2: HISTORY
------------------------------
[900 words of history]

Continue for all ${stops} stops.`;

    // Make Groq API call
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ 
        error: 'Groq API failed', 
        details: errorText,
        status: response.status 
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'No content generated';

    // Format response
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Language: ${language}
Tour Type: ${tourType}
Total Stops: ${stops}
AI Model: Groq Mixtral
Source: Direct Input

===================================================

${content}

===================================================
© CloudGuide - www.cloudguide.me`;

    return res.status(200).json({
      success: true,
      content: formattedContent,
      destination,
      stops,
      model: 'Groq Mixtral'
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
}
