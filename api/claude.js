// api/claude.js - Updated for Claude 4 models
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
      websiteRefs = []
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

    console.log(`Generating ${numStops} stops for ${destination}`);

    // Build the prompt
    const prompt = `Create a professional ${numStops}-stop audioguide for ${destination}.

Guide Type: ${guideType}
Style: ${style}
Audience: ${audience}
Words per stop: approximately ${stopLength}
${includeCoordinates ? 'Include GPS coordinates [GPS: lat, long] for each stop' : ''}
${websiteRefs?.length > 0 ? `Reference these websites: ${websiteRefs.join(', ')}` : ''}
${customPrompt ? `Special requirements: ${customPrompt}` : ''}

Create exactly ${numStops} stops. Each stop should have:
- A clear, descriptive title
- Engaging, informative content of approximately ${stopLength} words
- Natural, conversational tone suitable for audio narration

Format each stop as:
STOP [number]: [Title]
[Content - approximately ${stopLength} words]

Generate all ${numStops} stops now:`;

    // Claude 4 models - Based on the migration guide you showed
    // Priority order: newest and most efficient first
    const modelOptions = [
      'claude-opus-4-1-20250805',      // Claude Opus 4.1 - Latest and most capable
      'claude-sonnet-4-20250514',      // Claude Sonnet 4 - Fast and efficient
      'claude-opus-4-20250805',        // Claude Opus 4 - Previous flagship
      // Fallback to Claude 3.5 if Claude 4 not available
      'claude-3-5-sonnet-20241022',    // Claude 3.5 Sonnet as fallback
    ];

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
    
    // Determine model display name for Claude 4
    let modelDisplayName = 'Claude';
    if (modelUsed.includes('opus-4-1')) {
      modelDisplayName = 'Claude Opus 4.1 (Latest & Most Capable)';
    } else if (modelUsed.includes('sonnet-4')) {
      modelDisplayName = 'Claude Sonnet 4 (Fast & Efficient)';
    } else if (modelUsed.includes('opus-4')) {
      modelDisplayName = 'Claude Opus 4';
    } else if (modelUsed.includes('3-5-sonnet')) {
      modelDisplayName = 'Claude 3.5 Sonnet (Fallback)';
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

    // Return success response
    return res.status(200).json({
      success: true,
      content: formattedContent,
      rawContent: generatedContent,
      destination: destination,
      stops: numStops,
      model: modelDisplayName,
      modelVersion: modelUsed,
      claudeVersion: modelUsed.includes('opus-4') || modelUsed.includes('sonnet-4') ? '4' : '3.5'
    });

  } catch (error) {
    console.error('Handler error:', error);
    
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
