/ api/groq.js - Complete working version
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Groq API Request received:', req.body);

    const { destination, stops, tourType = 'comprehensive', language = 'English', context = '' } = req.body;

    // Validate inputs
    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    if (!stops) {
      return res.status(400).json({ error: 'Number of stops is required' });
    }

    // Check if API key exists
    if (!process.env.GROQ_API_KEY) {
      console.error('GROQ_API_KEY environment variable not set');
      return res.status(500).json({ error: 'Groq API key not configured' });
    }

    const numStops = parseInt(stops);
    console.log(`Generating ${numStops} stops for ${destination}`);

    // Create the prompt for Groq
    const prompt = `Create a professional audioguide for ${destination} with exactly ${numStops} stops. Each stop must be approximately 900 words.

REQUIREMENTS:
- Language: ${language}
- Tour Type: ${tourType}
- Exactly ${numStops} stops total
- Each stop: ~900 words of rich, detailed content
- Professional audioguide narration style

FORMAT EXACTLY LIKE THIS:

STOP 1: INTRODUCTION
------------------------------
[Write 900 words of engaging introduction]

STOP 2: HISTORY
------------------------------
[Write 900 words of historical narrative]

STOP 3: MAIN ATTRACTION 1
------------------------------
[Write 900 words about major attraction]

${numStops > 3 ? `[Continue for all ${numStops} stops, ending with:]

STOP ${numStops - 1}: LOCAL CUISINE
------------------------------
[Write 900 words about local food culture]

STOP ${numStops}: PRACTICAL TIPS
------------------------------
[Write 900 words of practical visiting advice]` : ''}

Create rich, detailed content with specific historical facts, architectural details, and cultural insights for ${destination}.`;

    console.log('Making request to Groq API...');

    // Make request to Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          {
            role: 'system',
            content: 'You are an expert audioguide creator specializing in cultural heritage sites. You write immersive, detailed audioguides with approximately 900 words per stop. Your content is educational, engaging, and professionally narrated.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 8000,
        top_p: 0.9,
        stream: false
      })
    });

    console.log('Groq API Response Status:', groqResponse.status);

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API Error Response:', errorText);
      
      return res.status(groqResponse.status).json({ 
        error: 'Groq API request failed',
        details: errorText,
        status: groqResponse.status
      });
    }

    const data = await groqResponse.json();
    console.log('Groq API Success - Response received');
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid Groq response format:', data);
      return res.status(500).json({ 
        error: 'Invalid response format from Groq API',
        data: data
      });
    }

    const audioguideContent = data.choices[0].message.content;

    // Format the response to match CloudGuide format
    const formattedContent = formatAudioguideResponse(audioguideContent, destination, numStops, language);

    console.log('Sending successful response');
    return res.status(200).json({
      success: true,
      destination: destination,
      language: language,
      tourType: tourType,
      stops: numStops,
      model: 'Groq Mixtral',
      content: formattedContent,
      timestamp: new Date().toISOString(),
      source: 'Groq API'
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}

function formatAudioguideResponse(content, destination, stops, language) {
  // Create the header format that matches CloudGuide output
  const header = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Language: ${language}
Tour Type: comprehensive
Total Stops: ${stops}
AI Model: Groq Mixtral
Source: Direct Input

===================================================

`;

  // Add the footer
  const footer = `

===================================================
© CloudGuide - www.cloudguide.me`;

  // Combine header + content + footer
  return header + content + footer;
}
