// api/claude.js - Updated with Model Selection and Cost Optimization
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
      stopLength = 750, 
      includeCoordinates = false,
      websiteRefs = [],
      preferredModel = 'claude-sonnet-4-20250514' // Default to Sonnet 4 (good balance)
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

    // Build the prompt with website references and city requirements
    let prompt = `Create a professional ${numStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}
Words per stop: approximately ${stopLength}
${includeCoordinates ? 'Include GPS coordinates [GPS: lat, long] for each stop' : ''}`;

    // Add city-specific requirements
    if (guideType === 'city') {
      prompt += `

CITY GUIDE REQUIREMENTS - Always include these elements:
🏛️ INTRODUCTION: Overview of the city's character, significance, and what makes it special
📚 HISTORY: Key historical periods, events, and figures that shaped the city
💡 LOCAL TIPS: Practical visitor advice (transport, customs, best times to visit, local etiquette)
🍽️ MUST EATS: Essential local foods, signature dishes, and where to find authentic versions
🎭 CULTURE: Local traditions, festivals, and cultural insights that enhance the experience`;
    }

    prompt += `
${customPrompt ? `Special requirements: ${customPrompt}` : ''}`;

    // Add website references to prompt if provided
    if (websiteRefs && websiteRefs.length > 0) {
      prompt += `

IMPORTANT INFORMATION SOURCES:
Please reference and include key information from these official sources: ${websiteRefs.join(', ')}
Use these sources to ensure accuracy and include must-have facts, opening hours, ticket prices, historical details, and official information.`;
    }

    prompt += `

Create exactly ${numStops} stops. Each stop should have:
- A clear, descriptive title
- Engaging, informative content of approximately ${stopLength} words
- Natural, conversational tone suitable for audio narration
- Accurate information ${websiteRefs.length > 0 ? 'from the provided sources' : ''}

Format each stop as:
STOP [number]: [Title]
[Content - approximately ${stopLength} words]

Generate all ${numStops} stops now:`;

    // Model selection with Sonnet 4 as default
    let modelOptions = [];
    
    if (preferredModel.includes('sonnet-4')) {
      // Sonnet 4 option - good balance (DEFAULT)
      modelOptions = [
        'claude-sonnet-4-20250514',      // Primary choice - good balance
        'claude-opus-4-20250805',        // Upgrade option
        'claude-3-5-sonnet-20241022',    // Budget fallback
      ];
    } else if (preferredModel.includes('3-5-sonnet')) {
      // Budget option - Claude 3.5 Sonnet first
      modelOptions = [
        'claude-3-5-sonnet-20241022',    // Budget choice
        'claude-3-5-sonnet-20240620',    // Backup Claude 3.5
        'claude-sonnet-4-20250514',      // Upgrade fallback
      ];
    } else if (preferredModel.includes('opus-4')) {
      // Premium option - Claude Opus 4 first
      modelOptions = [
        'claude-opus-4-20250805',        // Maximum quality choice
        'claude-sonnet-4-20250514',      // Good fallback
        'claude-3-5-sonnet-20241022',    // Budget fallback
      ];
    } else {
      // Default fallback order (Sonnet 4 preferred)
      modelOptions = [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250805',
        'claude-3-5-sonnet-20241022'
      ];
    }

    let successfulResponse = null;
    let lastError = null;
    let modelUsed = '';

    // Try each model until one works
    for (const model of modelOptions) {
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
            
            // Check for Claude 4's new refusal stop reason
            if (data.stop_reason === 'refusal') {
              console.log(`Model ${model} refused to generate content`);
              lastError = {
                status: 400,
                message: 'Claude refused to generate this content for safety reasons. Please modify your request.'
              };
              continue;
            }
            
            successfulResponse = data;
            modelUsed = model;
            console.log(`Success with model: ${model}`);
            break;
          } catch (parseError) {
            console.error(`Failed to parse response for ${model}:`, parseError);
            lastError = {
              status: response.status,
              message: 'Invalid JSON response from API'
            };
          }
        } else {
          console.log(`Model ${model} failed:`, responseText.substring(0, 200));
          
          // Parse error response
          try {
            const errorData = JSON.parse(responseText);
            lastError = {
              status: response.status,
              message: errorData.error?.message || errorData.message || responseText
            };
            
            // If it's not a model-specific error, don't try other models
            if (response.status === 401 || response.status === 429) {
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
        
        // Provide helpful context based on error
        if (lastError.status === 401) {
          errorDetails.suggestion = 'Check your CLAUDE_API_KEY in Vercel environment variables';
        } else if (lastError.status === 429) {
          errorDetails.suggestion = 'Rate limit exceeded. Please wait a moment and try again';
        } else if (errorMessage.includes('model')) {
          errorDetails.suggestion = 'Model not found. Tried: ' + modelOptions.join(', ');
        } else if (lastError.status === 400 && errorMessage.includes('refusal')) {
          errorDetails.suggestion = 'Try modifying your request or using different parameters';
        }
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        ...errorDetails
      });
    }

    // Extract the generated content
    const generatedContent = successfulResponse.content[0].text;
    
    // Determine model display name and cost info
    let modelDisplayName = 'Claude';
    let costInfo = '';
    
    if (modelUsed.includes('sonnet-4')) {
      modelDisplayName = 'Claude Sonnet 4 (Recommended)';
      costInfo = '💎 Optimal Balance';
    } else if (modelUsed.includes('3-5-sonnet')) {
      modelDisplayName = 'Claude 3.5 Sonnet (Budget)';
      costInfo = '💰 Cost-Optimized';
    } else if (modelUsed.includes('opus-4-1')) {
      modelDisplayName = 'Claude Opus 4.1 (Latest & Most Capable)';
      costInfo = '⭐ Maximum Quality';
    } else if (modelUsed.includes('opus-4')) {
      modelDisplayName = 'Claude Opus 4 (Maximum Quality)';
      costInfo = '⭐ Premium Choice';
    }
    
    // Format the response
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: ${modelDisplayName}
Model: ${modelUsed}
${costInfo}
Guide Type: ${guideType}
Style: ${style}
Total Stops: ${numStops}
Words per Stop: ${stopLength}
${websiteRefs.length > 0 ? `Information Sources: ${websiteRefs.length} websites` : ''}

===================================================

${generatedContent}

===================================================
© CloudGuide Premium - www.cloudguide.me`;

    // Calculate cost estimate (rough approximation)
    const wordCount = generatedContent.split(/\s+/).length;
    let costEstimate = '';
    
    if (modelUsed.includes('3-5-sonnet')) {
      costEstimate = 'Budget (~$0.01-0.05)';
    } else if (modelUsed.includes('sonnet-4')) {
      costEstimate = 'Reasonable (~$0.15-0.75)';
    } else if (modelUsed.includes('opus-4')) {
      costEstimate = 'Premium (~$0.75-3.75)';
    }

    // Return success response
    return res.status(200).json({
      success: true,
      content: formattedContent,
      rawContent: generatedContent,
      destination: destination,
      stops: numStops,
      model: modelDisplayName,
      modelVersion: modelUsed,
      claudeVersion: modelUsed.includes('opus-4') || modelUsed.includes('sonnet-4') ? '4' : '3.5',
      costInfo: costInfo,
      costEstimate: costEstimate,
      wordCount: wordCount,
      websiteRefsUsed: websiteRefs.length
    });

  } catch (error) {
    console.error('Handler error:', error);
    
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
