// api/claude.js - Robust version with proper error handling
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
      preferredModel = 'claude-3-5-sonnet-20241022' // Default to 3.5 Sonnet
    } = req.body;

    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    
    if (!CLAUDE_API_KEY) {
      console.error('Claude API key not found in environment variables');
      return res.status(500).json({ 
        error: 'Claude API key not configured',
        solution: 'Add CLAUDE_API_KEY to your Vercel environment variables'
      });
    }

    // Determine if this is a batch request
    const isBatchRequest = customPrompt && customPrompt.includes('This is part');
    
    // Limit stops for single requests to avoid timeout
    const maxStops = isBatchRequest ? numStops : Math.min(numStops, 5);
    
    console.log(`Generating ${maxStops} stops for ${destination} (batch: ${isBatchRequest})`);

    // Build prompt
    let prompt = '';
    
    if (isBatchRequest) {
      // Extract stop numbers from custom prompt
      prompt = `Create an audioguide for ${destination}.

${customPrompt}

CRITICAL REQUIREMENTS:
- Generate EXACTLY ${maxStops} stops
- Each stop MUST be approximately ${stopLength} words (900 words is essential)
- Use professional audioguide language
- Include specific dates, facts, stories, and details
- Format with clear stop numbers and titles as specified above`;
    } else {
      prompt = `Create a ${maxStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}

CRITICAL REQUIREMENTS:
- Generate EXACTLY ${maxStops} stops
- Each stop MUST be approximately ${stopLength} words (900 words is essential)
- Professional audioguide language suitable for audio narration
- Include specific historical dates, architectural details, cultural facts, and engaging stories

Format each stop as:
STOP 1: [Descriptive Title]
------------------------------
[900 words of detailed, engaging content about this specific aspect]

STOP 2: [Another Descriptive Title]
------------------------------
[900 words of detailed, engaging content about this specific aspect]

Continue this format for all ${maxStops} stops. Each stop must be comprehensive and exactly ${stopLength} words.`;
    }

    // Models to try in order (Claude Sonnet 4 doesn't exist yet, using 3.5)
    const modelOptions = [
      'claude-3-5-sonnet-20241022',  // Latest Claude 3.5 Sonnet
      'claude-3-opus-20240229',      // Claude 3 Opus (high quality)
      'claude-3-sonnet-20240229',    // Claude 3 Sonnet
      'claude-3-haiku-20240307'      // Claude 3 Haiku (fastest)
    ];

    let successfulResponse = null;
    let lastError = null;
    let modelUsed = '';

    // Try the preferred model first if specified
    const modelsToTry = preferredModel ? 
      [preferredModel, ...modelOptions.filter(m => m !== preferredModel)] : 
      modelOptions;

    console.log('Models to try:', modelsToTry);

    for (const model of modelsToTry) {
      try {
        console.log(`Attempting with model: ${model}`);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 6000,  // Increased for longer content
            temperature: 0.7,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        const responseText = await response.text();
        console.log(`Response status for ${model}: ${response.status}`);

        if (response.ok) {
          try {
            const data = JSON.parse(responseText);
            if (data.content && data.content[0] && data.content[0].text) {
              successfulResponse = data;
              modelUsed = model;
              console.log(`✅ Success with model: ${model}`);
              break;
            }
          } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            lastError = { message: 'Invalid response format' };
          }
        } else {
          console.error(`Model ${model} failed:`, response.status);
          
          // Parse error response
          try {
            const errorData = JSON.parse(responseText);
            lastError = {
              status: response.status,
              message: errorData.error?.message || errorData.message || 'API Error'
            };
            
            // Stop trying if authentication fails
            if (response.status === 401) {
              console.error('Authentication failed - invalid API key');
              return res.status(401).json({ 
                error: 'Invalid Claude API key',
                solution: 'Check your CLAUDE_API_KEY in Vercel environment variables'
              });
            }
            
            // Stop trying if rate limited
            if (response.status === 429) {
              console.error('Rate limited');
              return res.status(429).json({ 
                error: 'Rate limited by Claude API',
                solution: 'Please wait a moment and try again'
              });
            }
          } catch (e) {
            lastError = {
              status: response.status,
              message: responseText.substring(0, 100)
            };
          }
        }
      } catch (error) {
        console.error(`Error with model ${model}:`, error);
        lastError = {
          status: 500,
          message: error.message
        };
      }
    }

    // Check if we got a successful response
    if (!successfulResponse) {
      console.error('All Claude models failed. Last error:', lastError);
      
      return res.status(500).json({ 
        error: 'Failed to generate content with Claude',
        details: lastError?.message || 'Unknown error',
        triedModels: modelsToTry,
        solution: 'Check your Claude API key and try again'
      });
    }

    // Extract the generated content
    const generatedContent = successfulResponse.content[0].text;
    
    console.log(`Generated ${generatedContent.length} characters with ${modelUsed}`);
    
    // Format response based on request type
    if (isBatchRequest) {
      // For batch requests, return raw content
      return res.status(200).json({
        success: true,
        content: generatedContent,
        rawContent: generatedContent,
        destination: destination,
        stops: maxStops,
        model: modelUsed,
        wordCount: generatedContent.split(/\s+/).length
      });
    } else {
      // For single requests, add full formatting
      const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: Claude (${modelUsed})
Guide Type: ${guideType}
Style: ${style}
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
    }

  } catch (error) {
    console.error('Claude API Handler Error:', error);
    
    // Return a proper error response
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
