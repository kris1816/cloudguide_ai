// api/upload-to-cloudinary.js
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { audioData, fileName } = req.body;

    // Get Cloudinary credentials from environment variables
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.log('Cloudinary not configured, returning mock URL');
      // Return mock URL if Cloudinary not configured
      return res.status(200).json({
        success: true,
        url: `https://mock-cloudinary.com/audio/${fileName}`
      });
    }

    // Upload to Cloudinary using their REST API
    const timestamp = Math.round(Date.now() / 1000);
    const signature = require('crypto')
      .createHash('sha1')
      .update(`timestamp=${timestamp}${apiSecret}`)
      .digest('hex');

    const formData = new FormData();
    formData.append('file', audioData);
    formData.append('timestamp', timestamp);
    formData.append('api_key', apiKey);
    formData.append('signature', signature);
    formData.append('folder', 'cloudguide-audioguides');
    formData.append('resource_type', 'auto');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    const data = await response.json();

    return res.status(200).json({
      success: true,
      url: data.secure_url
    });

  } catch (error) {
    console.error('Cloudinary upload error:', error);
    // Return mock URL on error
    return res.status(200).json({
      success: true,
      url: `https://mock-cloudinary.com/audio/${req.body.fileName}`
    });
  }
}
