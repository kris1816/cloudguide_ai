// api/claude.js - Working version with proper token limits
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
      stopLength = 900,  // 900 words per stop
      preferredModel = 'claude-3-5-sonnet-20241022'
    } = req.body;

    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    
    if (!CLAUDE_API_KEY) {
      console.error('No Claude API key found');
      return res.status(500).json({ 
        error: 'Claude API key not configured',
        solution: 'Add CLAUDE_API_KEY to your Vercel environment variables'
      });
    }

    // Check if this is a batch request
    const isBatchRequest = customPrompt && customPrompt.includes('This is part');
    
    // For single requests, limit to 5 stops to avoid timeout
    const maxStops = isBatchRequest ? numStops : Math.min(numStops, 5);
    
    console.log(`Generating ${maxStops} stops for ${destination}`);

    // Build prompt based on request type
    let prompt = '';
    
    if (isBatchRequest) {
      prompt = `Create audioguide content for ${destination}.

${customPrompt}

Requirements:
- Generate EXACTLY ${maxStops} stops with the numbering specified above
- Each stop MUST be approximately ${stopLength} words (900 words)
- Professional audioguide language
- Include specific dates, facts, and details

Format each stop with clear title and 900 words of content.`;
    } else {
      prompt = `Create a ${maxStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}

Requirements:
- Generate EXACTLY ${maxStops} stops
- Each stop MUST be approximately ${stopLength} words (900 words is essential)
- Professional audioguide language
- Include dates, facts, stories

Format:
STOP 1: [Descriptive Title]
------------------------------
[900 words of detailed content]

STOP 2: [Descriptive Title]
------------------------------
[900 words of detailed content]

Continue for all ${maxStops} stops.`;
    }

    // Try models in order (with correct token limits)
    const models = [
      { name: 'claude-3-5-sonnet-20241022', maxTokens: 4096 },
      { name: 'claude-3-opus-20240229', maxTokens: 4096 },
      { name: 'claude-3-sonnet-20240229', maxTokens: 4096 },
      { name: 'claude-3-haiku-20240307', maxTokens: 4096 }
    ];

    let successfulResponse = null;
    let lastError = null;
    let modelUsed = '';

    for (const modelConfig of models) {
      try {
        console.log(`Trying ${modelConfig.name} with ${modelConfig.maxTokens} tokens`);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: modelConfig.name,
            max_tokens: modelConfig.maxTokens,  // Use model-specific limit
            temperature: 0.7,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        const responseText = await response.text();
        console.log(`Response status: ${response.status}`);

        if (response.ok) {
          const data = JSON.parse(responseText);
          if (data.content && data.content[0] && data.content[0].text) {
            successfulResponse = data;
            modelUsed = modelConfig.name;
            console.log(`Success with ${modelConfig.name}`);
            break;
          }
        } else {
          console.error(`${modelConfig.name} failed:`, response.status);
          
          try {
            const errorData = JSON.parse(responseText);
            lastError = errorData.error || errorData;
            
            // Stop on auth errors
            if (response.status === 401) {
              return res.status(401).json({ 
                error: 'Invalid Claude API key',
                solution: 'Check CLAUDE_API_KEY in Vercel'
              });
            }
            
            // Stop on rate limit
            if (response.status === 429) {
              return res.status(429).json({ 
                error: 'Rate limited',
                solution: 'Wait and try again'
              });
            }
          } catch (e) {
            lastError = { message: responseText.substring(0, 100) };
          }
        }
      } catch (error) {
        console.error(`Error with ${modelConfig.name}:`, error);
        lastError = { message: error.message };
      }
    }

    if (!successfulResponse) {
      console.error('All models failed');
      return res.status(500).json({ 
        error: 'Failed to generate content',
        details: lastError?.message || 'All Claude models failed',
        tried: models.map(m => m.name)
      });
    }

    // Extract content
    const generatedContent = successfulResponse.content[0].text;
    
    // For batch requests, return raw content
    if (isBatchRequest) {
      return res.status(200).json({
        success: true,
        content: generatedContent,
        rawContent: generatedContent,
        stops: maxStops,
        model: modelUsed
      });
    }
    
    // For single requests, format the response
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: Claude (${modelUsed})
Guide Type: ${guideType}
Total Stops: ${maxStops}
Words per Stop: ${stopLength}

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
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
