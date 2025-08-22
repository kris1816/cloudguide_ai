// api/groq.js - Corrected version matching your CloudGuide requirements
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
    const { destination, stops, tourType = 'comprehensive', language = 'English' } = req.body;

    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    if (!stops || ![3, 5, 8, 10].includes(parseInt(stops))) {
      return res.status(400).json({ error: 'Invalid number of stops. Must be 3, 5, 8, or 10' });
    }

    const numStops = parseInt(stops);

    // Enhanced prompt for exact number of stops with 900 words each
    const prompt = `Create a detailed audioguide for ${destination} with exactly ${numStops} stops. Each stop must be approximately 900 words long and provide rich, engaging content.

REQUIREMENTS:
- Language: ${language}
- Tour Type: ${tourType}
- Exactly ${numStops} stops
- Each stop: ~900 words (detailed, immersive content)
- Include specific historical facts, dates, names, architectural details
- Use vivid, immersive descriptions that transport visitors
- Write in conversational, engaging tone as if speaking to curious travelers
- Avoid generic phrases like "striking," "vibrant," "bustling," "marvel," "grandeur"

STOP CONTENT STRUCTURE (900 words each):
Each stop should include:
1. OPENING HOOK (100 words) - Start with a mystery, surprising fact, or intriguing question
2. SCENE SETTING (150 words) - Help visitors understand where they are, what they're seeing
3. HISTORICAL NARRATIVE (300 words) - Rich historical context with specific dates, events, people
4. ARCHITECTURAL/VISUAL FOCUS (200 words) - Specific features, materials, design elements to notice
5. CULTURAL SIGNIFICANCE (100 words) - Why this matters today, connections to modern relevance
6. INTERACTIVE ELEMENT (50 words) - "Try this" or "notice that" moment for engagement

STOP SELECTION GUIDE:
- For ${numStops} stops, choose the most significant and diverse locations
- Include main historical/architectural highlights
- Add cultural elements (local life, traditions, cuisine if relevant)
- Ensure variety in themes and experiences
- End with practical tips or local insights

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

STOP 1: [TITLE]
------------------------------
[~900 words of detailed, engaging content following the structure above]

STOP 2: [TITLE]  
------------------------------
[~900 words of detailed, engaging content]

[Continue for all ${numStops} stops]

Make each stop feel like a mini-documentary that educates and entertains. Include specific details like:
- Exact construction dates and historical periods
- Names of architects, rulers, artists involved
- Specific architectural measurements or materials when relevant
- Historical events that occurred at each location
- Cultural traditions and their origins
- Hidden details visitors should look for
- Sensory descriptions (sounds, textures, atmosphere)

Remember: Each stop should be substantial enough to keep visitors engaged for 5-7 minutes of listening, with fascinating stories and specific details about ${destination}.`;

    // Make request to Groq API with higher token limit for longer content
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768', // Use model with large context window
        messages: [
          {
            role: 'system',
            content: `You are an expert audioguide creator and cultural historian. You specialize in creating immersive, detailed audioguides that bring destinations to life. Your audioguides are known for:
            - Rich storytelling with specific historical details
            - Engaging narratives that transport listeners
            - Precise architectural and cultural information
            - Interactive elements that enhance the visitor experience
            - Approximately 900 words per stop for comprehensive coverage
            
            You have deep knowledge of world heritage sites, architecture, history, art, and local culture. You write in a conversational yet authoritative tone, as if personally guiding curious travelers through these remarkable places.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 8000, // Increased for longer content
        top_p: 0.9,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error:', response.status, errorText);
      
      return res.status(response.status).json({ 
        error: 'Groq API request failed',
        details: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({ 
        error: 'Invalid response format from Groq API',
        data: data
      });
    }

    const audioguideContent = data.choices[0].message.content;

    // Format the response to match your CloudGuide format
    const formattedContent = formatAudioguideResponse(audioguideContent, destination, numStops, language);

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
      message: error.message
    });
  }
}

function formatAudioguideResponse(content, destination, stops, language) {
  // Create the header format that matches your CloudGuide output
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
