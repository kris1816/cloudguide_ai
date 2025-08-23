// api/claude.js - Claude API endpoint for Vercel
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      destination, 
      guideType, 
      audience, 
      style, 
      customPrompt,
      numStops, 
      stopLength, 
      includeCoordinates,
      websiteRefs 
    } = req.body;

    // Validate required fields
    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    // Get API key from environment variable
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ 
        error: 'Claude API key not configured in environment variables',
        solution: 'Add CLAUDE_API_KEY to your Vercel environment variables'
      });
    }

    console.log(`Generating ${numStops} stops for ${destination} using Claude`);

    // Build the prompt based on guide type
    let mandatoryStops = '';
    
    if (guideType === 'museum') {
      mandatoryStops = `
MANDATORY STOPS:
1. INTRODUCTION - Welcome and overview
2. HISTORY - Museum and building history
3-${numStops-1}. KEY COLLECTIONS - Major exhibitions
${numStops}. PRACTICAL TIPS - Visitor information`;
    } else if (guideType === 'city') {
      mandatoryStops = `
MANDATORY STOPS:
1. INTRODUCTION - Welcome to ${destination}
2. HISTORY - Historical overview
3-7. TOP ATTRACTIONS - Must-see landmarks
8. LOCAL CUISINE & FOOD - Traditional dishes and restaurants
9-12. HIDDEN GEMS - Lesser-known spots
13-14. DAY TRIPS - Nearby destinations
${numStops}. PRACTICAL TIPS - Transportation and customs`;
    } else if (guideType === 'trail') {
      mandatoryStops = `
MANDATORY STOPS:
1. TRAILHEAD - Starting point overview
2. NATURAL HISTORY - Geology and ecology
3-${numStops-1}. VIEWPOINTS - Scenic spots
${numStops}. SAFETY TIPS - Preparation and gear`;
    }

    const prompt = `Create a professional ${numStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}
Words per stop: ${stopLength}
${includeCoordinates ? 'Include GPS coordinates [GPS: lat, long] for each stop' : ''}
${websiteRefs?.length > 0 ? `Reference these websites: ${websiteRefs.join(', ')}` : ''}
${customPrompt ? `Special requirements: ${customPrompt}` : ''}

${mandatoryStops}

Format each stop as:
STOP [number]: [Descriptive Title] ${includeCoordinates ? '[GPS: latitude, longitude]' : ''}
[Exactly ${stopLength} words of engaging content]

Generate all ${numStops} stops now:`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20241022', // Using Sonnet for balance of quality and cost
        max_tokens: 8192,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      
      let errorMessage = 'Claude API error';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        status: response.status
      });
    }

    const data = await response.json();
    
    // Extract the generated content
    const generatedContent = data.content[0].text;
    
    // Format the response
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: Claude AI (Premium)
Guide Type: ${guideType}
Style: ${style}
Total Stops: ${numStops}
Words per Stop: ${stopLength}

===================================================

${generatedContent}

===================================================
© CloudGuide Premium - www.cloudguide.me`;

    // Return success response
    return res.status(200).json({
      success: true,
      content: formattedContent,
      rawContent: generatedContent, // For audio generation without formatting
      destination: destination,
      stops: numStops,
      model: 'Claude Sonnet'
    });

  } catch (error) {
    console.error('Claude handler error:', error);
    
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
