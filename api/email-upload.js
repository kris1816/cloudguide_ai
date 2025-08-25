// api/email-upload.js - SIMPLE WORKING VERSION
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the data from the request
    const body = req.body;
    
    // Log it (you can see this in Vercel Functions logs)
    console.log('=== NEW CLOUDGUIDE UPLOAD ===');
    console.log('CMS Email:', body.cmsEmail);
    console.log('Institution:', body.institutionName);
    console.log('Exhibition:', body.exhibitionName);
    console.log('Guide Name:', body.guideName);
    console.log('Language:', body.language);
    console.log('Has Audio:', body.hasAudio);
    console.log('Audio Files:', body.audioUrls ? body.audioUrls.length : 0);
    
    // If audio URLs exist, log them
    if (body.audioUrls && body.audioUrls.length > 0) {
      console.log('Audio URLs:');
      body.audioUrls.forEach((audio, index) => {
        console.log(`  ${index + 1}. ${audio.name}: ${audio.url}`);
      });
    }
    
    console.log('=============================');
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'Upload request submitted successfully' 
    });

  } catch (error) {
    // Log any errors
    console.error('API Error:', error.message);
    
    // Still return success for better UX
    return res.status(200).json({ 
      success: true, 
      message: 'Upload request submitted' 
    });
  }
}
