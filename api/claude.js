// api/claude.js - Claude Sonnet 4 as Primary Model
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
      numStops = 10, 
      stopLength = 900,  // 900 words per stop
      includeCoordinates = false,
      websiteRefs = [],
      preferredModel = 'claude-sonnet-4-20250514' // SONNET 4 AS DEFAULT
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

    console.log(`Generating ${numStops} stops for ${destination} with model: ${preferredModel}`);

    // Build comprehensive prompt
    let prompt = `Create a professional ${numStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}
Words per stop: approximately ${stopLength} words (THIS IS CRITICAL - EACH STOP MUST BE ${stopLength} WORDS)
${includeCoordinates ? 'Include GPS coordinates [GPS: lat, long] for each stop' : ''}`;

    // Add city-specific requirements
    if (guideType === 'city') {
      prompt += `

CITY GUIDE REQUIREMENTS:
🏛️ INTRODUCTION: Overview of the city's character, significance, and what makes it special
📚 HISTORY: Key historical periods, events, and figures that shaped the city
💡 LOCAL TIPS: Practical visitor advice (transport, customs, best times to visit, local etiquette)
🍽️ MUST EATS: Essential local foods, signature dishes, and where to find authentic versions
🎭 CULTURE: Local traditions, festivals, and cultural insights`;
    }

    prompt += `
${customPrompt ? `Special requirements: ${customPrompt}` : ''}`;

    // Add website references if provided
    if (websiteRefs && websiteRefs.length > 0) {
      prompt += `

REFERENCE SOURCES: ${websiteRefs.join(', ')}`;
    }

    prompt += `

CRITICAL REQUIREMENTS:
1. Create EXACTLY ${numStops} stops
2. Each stop MUST be approximately ${stopLength} words (not shorter!)
3. Use engaging, professional audioguide language
4. Include specific details, stories, and interesting facts
5. Natural, conversational tone suitable for audio narration

Format each stop EXACTLY as:
STOP [number]: [Descriptive Title]
------------------------------
[${stopLength} words of detailed, engaging content]

Begin generating all ${numStops} stops now:`;

    // CLAUDE MODELS - SONNET 4 FIRST FOR BEST VALUE
    const modelOptions = [
      'claude-sonnet-4-20250514',      // Claude Sonnet 4 - BEST cost/quality balance
      'claude-3-5-sonnet-20241022',    // Claude 3.5 Sonnet (good fallback)
      'claude-opus-4-20250805',        // Claude Opus 4 (highest quality, more expensive)
      'claude-3-opus-20240229',        // Claude 3 Opus (older high quality)
      'claude-3-sonnet-20240229',      // Claude 3 Sonnet (older balanced)
    ];

    let successfulResponse = null;
    let lastError = null;
    let modelUsed = '';

    // Try the preferred model first, then fallback to others
    const modelsToTry = preferredModel ? 
      [preferredModel, ...modelOptions.filter(m => m !== preferredModel)] : 
      modelOptions;

    for (const model of modelsToTry) {
      try {
        console.log(`Attempting with Claude model: ${model}`);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 8192,
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
            successfulResponse = data;
            modelUsed = model;
            console.log(`Success with Claude model: ${model}`);
            break;
          } catch (parseError) {
            console.error(`Failed to parse response for ${model}:`, parseError);
            lastError = {
              status: response.status,
              message: 'Invalid JSON response from Claude API'
            };
          }
        } else {
          console.log(`Model ${model} failed:`, responseText.substring(0, 200));
          
          try {
            const errorData = JSON.parse(responseText);
            lastError = {
              status: response.status,
              message: errorData.error?.message || errorData.message || responseText
            };
            
            // If it's an auth error, stop trying other models
            if (response.status === 401) {
              console.error('Authentication failed - check your CLAUDE_API_KEY');
              break;
            }
            
            // If rate limited, stop trying
            if (response.status === 429) {
              console.error('Rate limited - wait before trying again');
              break;
            }
          } catch (e) {
            lastError = {
              status: response.status,
              message: responseText
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
      
      let errorMessage = 'Failed to generate content with Claude API';
      let errorDetails = {};
      
      if (lastError) {
        errorMessage = lastError.message || errorMessage;
        
        if (lastError.status === 401) {
          errorDetails.suggestion = 'Check your CLAUDE_API_KEY in Vercel environment variables';
        } else if (lastError.status === 429) {
          errorDetails.suggestion = 'Rate limit exceeded. Please wait a moment and try again';
        } else if (errorMessage.includes('model_not_found')) {
          errorDetails.suggestion = 'Model not found. Try: claude-sonnet-4-20250514 or claude-3-5-sonnet-20241022';
        }
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        ...errorDetails,
        availableModels: modelOptions
      });
    }

    // Extract the generated content
    const generatedContent = successfulResponse.content[0].text;
    
    // Determine model display name
    let modelDisplayName = 'Claude';
    if (modelUsed.includes('sonnet-4')) {
      modelDisplayName = 'Claude Sonnet 4 (Best Value - Recommended)';
    } else if (modelUsed.includes('opus-4')) {
      modelDisplayName = 'Claude Opus 4 (Highest Quality)';
    } else if (modelUsed.includes('sonnet-20241022')) {
      modelDisplayName = 'Claude 3.5 Sonnet';
    } else if (modelUsed.includes('opus-20240229')) {
      modelDisplayName = 'Claude 3 Opus';
    } else if (modelUsed.includes('sonnet-20240229')) {
      modelDisplayName = 'Claude 3 Sonnet';
    } else if (modelUsed.includes('haiku')) {
      modelDisplayName = 'Claude 3 Haiku (Fast)';
    }
    
    // Format the response
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: ${modelDisplayName}
Model: ${modelUsed}
Guide Type: ${guideType}
Style: ${style}
Total Stops: ${numStops}
Words per Stop: ${stopLength}

===================================================

${generatedContent}

===================================================
© CloudGuide Premium - www.cloudguide.me`;

    const wordCount = generatedContent.split(/\s+/).length;

    // Return success response
    return res.status(200).json({
      success: true,
      content: formattedContent,
      rawContent: generatedContent,
      destination: destination,
      stops: numStops,
      model: modelDisplayName,
      modelVersion: modelUsed,
      wordCount: wordCount
    });

  } catch (error) {
    console.error('Claude API Handler error:', error);
    
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
