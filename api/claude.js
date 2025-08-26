// api/claude.js - Simplified for Vercel timeout limits
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
    const { 
      destination, 
      guideType = 'museum', 
      audience = 'general', 
      style = 'storytelling', 
      customPrompt = '',
      numStops = 8, 
      stopLength = 900,  // Default to 900 words per stop
      preferredModel = 'claude-3-5-sonnet-20241022' // Use 3.5 for speed
    } = req.body;

    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ 
        error: 'Claude API key not configured',
        solution: 'Add CLAUDE_API_KEY to your Vercel environment variables'
      });
    }

    // Limit stops to avoid timeout (unless it's a batch request)
    const isBatchRequest = customPrompt && customPrompt.includes('This is part');
    const maxStops = isBatchRequest ? numStops : Math.min(numStops, 5);
    
    console.log(`Generating ${maxStops} stops for ${destination}`);

// Build prompt based on whether it's a batch request
    const isBatchRequest = customPrompt && customPrompt.includes('This is part');
    let prompt = '';
    
    if (isBatchRequest) {
      // For batch requests, use custom numbering
      prompt = `Create a ${maxStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}

${customPrompt}

REQUIREMENTS:
- Create exactly ${maxStops} stops
- Each stop MUST be approximately ${stopLength} words (this is critical)
- Professional audioguide language
- Include specific details, dates, facts, and stories

Format each stop EXACTLY as shown in the custom prompt above.
Each stop must be ${stopLength} words of detailed, engaging content.`;
    } else {
      // For single requests, use standard numbering
      prompt = `Create a ${maxStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}

REQUIREMENTS:
- Create exactly ${maxStops} stops
- Each stop MUST be approximately ${stopLength} words (this is critical)
- Professional audioguide language
- Include specific details, dates, facts, and stories

Format each stop EXACTLY as:
STOP 1: [Descriptive Title]
------------------------------
[${stopLength} words of detailed, engaging content]

STOP 2: [Descriptive Title]  
------------------------------
[${stopLength} words of detailed, engaging content]

Continue for all ${maxStops} stops. Each stop must be ${stopLength} words.`;
    }

    if (guideType === 'city') {
      prompt += '\n\nFor city guides include: Overview, History, Local Tips, Food, Culture';
    }

    if (customPrompt) {
      prompt += '\n\n' + customPrompt;
    }

    // Models to try
    const models = [
      'claude-3-5-sonnet-20241022',  // Fast and good
      'claude-3-sonnet-20240229',    // Older but reliable
      'claude-3-haiku-20240307'      // Fastest
    ];

    let successfulResponse = null;
    let lastError = null;
    let modelUsed = '';

    // Try each model
    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 4096,
            temperature: 0.7,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          successfulResponse = data;
          modelUsed = model;
          console.log(`Success with model: ${model}`);
          break;
        } else {
          const errorText = await response.text();
          console.log(`Model ${model} failed:`, response.status);
          
          if (response.status === 401) {
            return res.status(401).json({ 
              error: 'Invalid API key. Check CLAUDE_API_KEY in Vercel'
            });
          }
          
          if (response.status === 429) {
            return res.status(429).json({ 
              error: 'Rate limited. Please wait and try again'
            });
          }
          
          lastError = { status: response.status, message: errorText };
        }
      } catch (error) {
        console.error(`Error with model ${model}:`, error);
        lastError = { message: error.message };
      }
    }

    if (!successfulResponse) {
      console.error('All Claude models failed');
      return res.status(500).json({ 
        error: 'Failed to generate content',
        details: lastError?.message || 'Unknown error'
      });
    }

    // Extract content
    const generatedContent = successfulResponse.content[0].text;
    
    // Add note if we limited stops
    let note = '';
    if (numStops > maxStops) {
      note = `\nNote: Generated ${maxStops} of ${numStops} requested stops (timeout limit)\n`;
    }
    
    // Format response (for batch requests, return raw content)
    const isBatch = customPrompt && customPrompt.includes('This is part');
    
    if (isBatch) {
      // For batch requests, return the raw content without headers
      return res.status(200).json({
        success: true,
        content: generatedContent,
        rawContent: generatedContent,
        destination: destination,
        stops: maxStops,
        model: modelUsed,
        wordCount: generatedContent.split(/\s+/).length
      });
    }
    
    // For single requests, add full formatting
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: Claude (${modelUsed})
Guide Type: ${guideType}
Style: ${style}
Total Stops: ${maxStops}${note}
===================================================

${generatedContent}

===================================================
© CloudGuide - www.cloudguide.me`;

    return res.status(200).json({
      success: true,
      content: formattedContent,
      rawContent: generatedContent,
      destination: destination,
      stops: maxStops,
      model: modelUsed,
      wordCount: generatedContent.split(/\s+/).length
    });

  } catch (error) {
    console.error('Claude API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
