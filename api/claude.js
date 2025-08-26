// api/claude.js - With Batch Processing for Timeout Prevention
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
      batchStart = 1,    // For batch processing - which stop to start from
      batchSize = 4,     // How many stops to generate in this batch
      includeCoordinates = false,
      websiteRefs = [],
      preferredModel = 'claude-sonnet-4-20250514' // Sonnet 4 for best quality
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

    // Calculate actual stops to generate in this batch
    const stopsToGenerate = Math.min(batchSize, numStops - batchStart + 1);
    const batchEnd = batchStart + stopsToGenerate - 1;
    
    console.log(`Generating stops ${batchStart}-${batchEnd} of ${numStops} for ${destination}`);

    // Build prompt for this specific batch
    let prompt = `You are creating part of a larger audioguide for ${destination}.
This batch should contain stops ${batchStart} through ${batchEnd} (${stopsToGenerate} stops total).

CONTEXT:
- Total audioguide will have ${numStops} stops
- Guide Type: ${guideType}
- Style: ${style}
- Audience: ${audience}
- Words per stop: EXACTLY ${stopLength} words (THIS IS CRITICAL)`;

    // Add specific content guidance based on stop numbers
    if (batchStart === 1) {
      prompt += `

FIRST BATCH - Include these essential stops:
- STOP 1: Introduction/Overview of ${destination}
- STOP 2: Historical Background
- STOP 3-${batchEnd}: Main attractions/exhibits`;
    } else if (batchEnd === numStops) {
      prompt += `

FINAL BATCH - Include concluding elements:
- Continue with attractions/exhibits
- Final stop should include: practical tips, closing thoughts, and farewell`;
    } else {
      prompt += `

MIDDLE BATCH - Continue with:
- Main attractions, exhibits, or points of interest
- Maintain consistent style with previous sections`;
    }

    // Add city-specific requirements if needed
    if (guideType === 'city' && batchStart <= 5) {
      prompt += `

CITY GUIDE ELEMENTS to include where appropriate:
🏛️ Architecture and landmarks
📚 Historical events and figures
💡 Local tips and customs
🍽️ Food and dining recommendations
🎭 Cultural insights and traditions`;
    }

    prompt += `
${customPrompt ? `\nAdditional requirements: ${customPrompt}` : ''}

CRITICAL FORMAT REQUIREMENTS:
1. Generate EXACTLY ${stopsToGenerate} stops
2. Number them as STOP ${batchStart}, STOP ${batchStart + 1}, etc.
3. Each stop MUST be EXACTLY ${stopLength} words
4. Use professional audioguide language
5. Include specific details, dates, facts, and stories

FORMAT:
STOP ${batchStart}: [Descriptive Title]
------------------------------
[EXACTLY ${stopLength} words of detailed, engaging content]

${stopsToGenerate > 1 ? `STOP ${batchStart + 1}: [Descriptive Title]
------------------------------
[EXACTLY ${stopLength} words of detailed, engaging content]` : ''}

Generate the ${stopsToGenerate} stops now:`;

    // Model selection - try Sonnet 4 first, then fallbacks
    const modelOptions = [
      'claude-sonnet-4-20250514',      // Best value
      'claude-3-5-sonnet-20241022',    // Fast and good
      'claude-3-opus-20240229',        // High quality
      'claude-3-sonnet-20240229',      // Balanced fallback
    ];

    let successfulResponse = null;
    let lastError = null;
    let modelUsed = '';

    // Set timeout for API call (9 seconds to be safe with Vercel's 10s limit)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    // Try models in order
    const modelsToTry = preferredModel ? 
      [preferredModel, ...modelOptions.filter(m => m !== preferredModel)] : 
      modelOptions;

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
            max_tokens: 4096,
            temperature: 0.7,
            messages: [{
              role: 'user',
              content: prompt
            }]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();
        console.log(`Response status for ${model}: ${response.status}`);

        if (response.ok) {
          try {
            const data = JSON.parse(responseText);
            successfulResponse = data;
            modelUsed = model;
            console.log(`Success with model: ${model}`);
            break;
          } catch (parseError) {
            console.error(`Failed to parse response:`, parseError);
            lastError = {
              status: response.status,
              message: 'Invalid JSON response'
            };
          }
        } else {
          console.log(`Model ${model} failed`);
          
          // Check for auth errors
          if (response.status === 401) {
            return res.status(401).json({ 
              error: 'Invalid API key',
              solution: 'Check your CLAUDE_API_KEY in Vercel environment variables'
            });
          }
          
          // Check for rate limiting
          if (response.status === 429) {
            return res.status(429).json({ 
              error: 'Rate limited',
              solution: 'Please wait a moment and try again'
            });
          }
          
          try {
            const errorData = JSON.parse(responseText);
            lastError = {
              status: response.status,
              message: errorData.error?.message || errorData.message || 'API Error'
            };
          } catch (e) {
            lastError = {
              status: response.status,
              message: responseText.substring(0, 200)
            };
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Request timeout - trying next model');
          lastError = { message: 'Request timeout - try fewer stops' };
          continue;
        }
        console.error(`Error with model ${model}:`, error);
        lastError = {
          status: 500,
          message: error.message
        };
      }
    }

    // Check if we got a successful response
    if (!successfulResponse) {
      console.error('All models failed. Last error:', lastError);
      
      return res.status(500).json({ 
        error: 'Failed to generate content',
        details: lastError?.message || 'Unknown error',
        suggestion: 'Try generating fewer stops or wait a moment'
      });
    }

    // Extract the generated content
    const generatedContent = successfulResponse.content[0].text;
    
    // Determine model display name
    let modelDisplayName = 'Claude';
    if (modelUsed.includes('sonnet-4')) {
      modelDisplayName = 'Claude Sonnet 4 (Best Value)';
    } else if (modelUsed.includes('opus-4')) {
      modelDisplayName = 'Claude Opus 4 (Premium)';
    } else if (modelUsed.includes('3-5-sonnet')) {
      modelDisplayName = 'Claude 3.5 Sonnet';
    } else if (modelUsed.includes('opus')) {
      modelDisplayName = 'Claude 3 Opus';
    } else if (modelUsed.includes('sonnet')) {
      modelDisplayName = 'Claude 3 Sonnet';
    }
    
    // Format the response for this batch
    const batchInfo = `Batch: Stops ${batchStart}-${batchEnd} of ${numStops}`;
    
    const formattedContent = `AUDIOGUIDE: ${destination.toUpperCase()}
===================================================

Generated with: ${modelDisplayName}
${batchInfo}
Guide Type: ${guideType}
Style: ${style}
Words per Stop: ${stopLength}

===================================================

${generatedContent}

===================================================
© CloudGuide - www.cloudguide.me`;

    const wordCount = generatedContent.split(/\s+/).length;

    // Return success response with batch info
    return res.status(200).json({
      success: true,
      content: formattedContent,
      rawContent: generatedContent,
      destination: destination,
      batch: {
        start: batchStart,
        end: batchEnd,
        size: stopsToGenerate,
        total: numStops
      },
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
