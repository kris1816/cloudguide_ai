// api/claude.js - Claude API endpoint with Claude 4 models
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
      console.error('Claude API key not found in environment variables');
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

    // Claude 4 models (as of January 2025)
    // Priority order: most efficient for content generation first
    const modelOptions = [
      'claude-sonnet-4-20250514',      // Claude Sonnet 4 - Best balance for content generation
      'claude-opus-4-1-20250805',       // Claude Opus 4.1 - Most capable but slower
      'claude-opus-4-20250805',         // Claude Opus 4 - Previous flagship
      // Fallback to Claude 3.7 if needed
      'claude-3-7-sonnet-20250219',    // Claude 3.7 Sonnet as fallback
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

        if (response.ok) {
          const data = await response.json();
          
          // Check for refusal stop reason (new in Claude 4)
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
        } else {
          const errorText = await response.text();
          console.log(`Model ${model} failed:`, errorText);
          
          // If it's not a model error, stop trying other models
          if (!errorText.includes('model') && response.status !== 404) {
            lastError = {
              status: response.status,
              message: errorText
            };
            break;
          }
          
          lastError = {
            status: response.status,
            message: errorText
          };
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
        try {
          const errorData = typeof lastError.message === 'string' 
            ? JSON.parse(lastError.message) 
            : lastError.message;
          
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (typeof lastError.message === 'string') {
            errorMessage = lastError.message;
          }
          
          // Provide helpful context
          if (lastError.status === 401) {
            errorMessage = 'Invalid Claude API key';
            errorDetails.suggestion = 'Check your CLAUDE_API_KEY in Vercel environment variables';
          } else if (lastError.status === 429) {
            errorMessage = 'Rate limit exceeded';
            errorDetails.suggestion = 'Please wait a moment and try again';
          } else if (lastError.status === 400 && errorMessage.includes('refusal')) {
            errorDetails.suggestion = 'Try modifying your request or using different parameters';
          } else if (errorMessage.includes('model')) {
            errorDetails.suggestion = 'The model name may be incorrect. Trying fallback models.';
            errorDetails.triedModels = modelOptions;
          }
        } catch (e) {
          errorMessage = lastError.message || errorMessage;
        }
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        ...errorDetails
      });
    }

    // Extract the generated content
    const generatedContent = successfulResponse.content[0].text;
    
    // Determine model family for display
    let modelFamily = 'Claude';
    if (modelUsed.includes('opus-4-1')) {
      modelFamily = 'Claude Opus 4.1 (Latest & Most Capable)';
    } else if (modelUsed.includes('opus-4')) {
      modelFamily = 'Claude Opus 4';
    } else if (modelUsed.includes('sonnet-4')) {
      modelFamily = 'Claude Sonnet 4 (Fast & Efficient)';
    } else if (modelUsed.includes('3-7')) {
      modelFamily = 'Claude 3.7 Sonnet (Fallback)';
    }
    
    // Format the response
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: ${modelFamily}
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
      rawContent: generatedContent, // For audio generation without formatting
      destination: destination,
      stops: numStops,
      model: modelFamily,
      modelVersion: modelUsed
    });

  } catch (error) {
    console.error('Claude handler error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Internal server error';
    let errorDetails = {};
    
    if (error.message) {
      errorMessage = error.message;
      
      // Add helpful context based on error type
      if (error.message.includes('fetch')) {
        errorDetails.suggestion = 'Network error connecting to Claude API';
      } else if (error.message.includes('JSON')) {
        errorDetails.suggestion = 'Invalid response format from Claude API';
      }
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      ...errorDetails,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
