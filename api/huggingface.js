// api/huggingface.js
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Call Hugging Face Inference API (using a free model)
    const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-large', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optional: Add API key for better performance
        ...(process.env.HUGGINGFACE_API_KEY && {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`
        })
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 800,
          temperature: 0.7,
          do_sample: true,
          top_p: 0.9
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Hugging Face API error:', errorData);
      
      // Handle rate limiting
      if (response.status === 503) {
        return res.status(503).json({ 
          error: 'Model is loading, please try again in a few seconds',
          retry_after: 20
        });
      }
      
      return res.status(response.status).json({ 
        error: 'Hugging Face API request failed',
        details: errorData
      });
    }

    const data = await response.json();
    
    // Handle different response formats
    let generatedText = '';
    
    if (Array.isArray(data) && data[0] && data[0].generated_text) {
      generatedText = data[0].generated_text;
    } else if (data.generated_text) {
      generatedText = data.generated_text;
    } else {
      // Fallback: generate content using template
      generatedText = generateFallbackContent(prompt);
    }

    return res.status(200).json({
      content: generatedText,
      generated_text: generatedText,
      model: 'microsoft/DialoGPT-large',
      source: 'huggingface'
    });

  } catch (error) {
    console.error('Hugging Face API handler error:', error);
    
    // Return fallback content on error
    const fallbackContent = generateFallbackContent(req.body.prompt || '');
    
    return res.status(200).json({
      content: fallbackContent,
      generated_text: fallbackContent,
      model: 'fallback-generator',
      source: 'fallback',
      note: 'Generated using fallback content due to API unavailability'
    });
  }
}

// Fallback content generator
function generateFallbackContent(prompt) {
  const location = extractLocationFromPrompt(prompt);
  const stopName = extractStopFromPrompt(prompt);
  
  return `Welcome to ${stopName} at ${location}.

You're standing at one of the most significant locations in ${location}, where history, culture, and human achievement converge in remarkable ways. This space tells a compelling story of ${location}'s evolution through the centuries.

The architecture surrounding you represents exceptional craftsmanship from its era. Notice the careful attention to proportion, the quality of materials, and the masterful way natural light has been incorporated into the design. These elements work harmoniously to create an environment that enhances every visitor's experience.

Historically, ${stopName} has played a crucial role in the development of ${location}. The events that unfolded here shaped not only the local community but influenced broader cultural and social movements that continue to resonate today. The preservation of this remarkable space allows us to forge meaningful connections with the experiences of those who came before us.

Take a moment to observe the intricate details that might be easily overlooked. The distinctive wear patterns on surfaces, the subtle variations in materials, and the thoughtful way different architectural elements frame your view all contribute to the larger narrative of this extraordinary place.

The significance of ${stopName} extends far beyond its historical importance. Today, it continues to serve as a vibrant gathering place, a source of inspiration, and a powerful reminder of the enduring value of cultural heritage. Its careful preservation ensures that future generations can experience the same sense of wonder and connection that you're experiencing at this very moment.

As you continue your exploration of ${location}, carry with you the stories, impressions, and insights you've gathered here. Each location you visit adds another rich layer to your understanding of this truly extraordinary destination.`;
}

function extractLocationFromPrompt(prompt) {
  const matches = prompt.match(/(?:in|at|for)\s+"([^"]+)"/i) || 
                 prompt.match(/(?:in|at|for)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|\n)/);
  return matches ? matches[1] : 'this remarkable destination';
}

function extractStopFromPrompt(prompt) {
  const matches = prompt.match(/script for\s+"([^"]+)"/i) ||
                 prompt.match(/script for\s+([A-Z][a-zA-Z\s]+?)(?:\s+in|\s+at)/i);
  return matches ? matches[1] : 'this significant location';
}
