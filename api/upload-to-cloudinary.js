// api/upload-to-cloudinary.js
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
    const { audioData, fileName } = req.body;

    // Get Cloudinary credentials from environment variables
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    console.log('Cloudinary config:', {
      cloudName: cloudName ? 'Set' : 'Not set',
      apiKey: apiKey ? 'Set' : 'Not set',
      apiSecret: apiSecret ? 'Set' : 'Not set'
    });

    if (!cloudName || !apiKey || !apiSecret) {
      console.log('Cloudinary not configured, returning mock URL');
      // Return mock URL if Cloudinary not configured
      return res.status(200).json({
        success: true,
        url: `https://mock-cloudinary.com/audio/${fileName}`,
        mock: true
      });
    }

    // For JSON data (guides), store as raw URL
    if (fileName.endsWith('.json')) {
      try {
        // Create a data URL for JSON
        const timestamp = Date.now();
        const publicId = `cloudguide/guides/${fileName.replace('.json', '')}_${timestamp}`;
        
        // Use unsigned upload preset or signed upload
        const formData = new URLSearchParams();
        formData.append('file', audioData);
        formData.append('public_id', publicId);
        formData.append('api_key', apiKey);
        formData.append('folder', 'cloudguide/guides');
        formData.append('resource_type', 'raw');
        
        // Generate signature for signed upload
        const crypto = require('crypto');
        const timestampSeconds = Math.round(timestamp / 1000);
        const signatureString = `folder=cloudguide/guides&public_id=${publicId}&resource_type=raw&timestamp=${timestampSeconds}${apiSecret}`;
        const signature = crypto.createHash('sha256').update(signatureString).digest('hex');
        
        formData.append('timestamp', timestampSeconds);
        formData.append('signature', signature);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
          {
            method: 'POST',
            body: formData
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Cloudinary upload failed:', errorText);
          throw new Error(`Cloudinary error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Cloudinary upload success:', data.secure_url);
        
        return res.status(200).json({
          success: true,
          url: data.secure_url,
          publicId: data.public_id
        });
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Return mock URL on error
        return res.status(200).json({
          success: true,
          url: `https://mock-cloudinary.com/guides/${fileName}`,
          mock: true,
          error: uploadError.message
        });
      }
    }

    // For audio files (MP3)
    if (fileName.endsWith('.mp3') || audioData.startsWith('data:audio')) {
      try {
        const timestamp = Date.now();
        const publicId = `cloudguide/audio/${fileName.replace('.mp3', '')}_${timestamp}`;
        
        const formData = new URLSearchParams();
        formData.append('file', audioData);
        formData.append('public_id', publicId);
        formData.append('api_key', apiKey);
        formData.append('folder', 'cloudguide/audio');
        formData.append('resource_type', 'video'); // Audio files use video resource type in Cloudinary
        
        // Generate signature
        const crypto = require('crypto');
        const timestampSeconds = Math.round(timestamp / 1000);
        const signatureString = `folder=cloudguide/audio&public_id=${publicId}&resource_type=video&timestamp=${timestampSeconds}${apiSecret}`;
        const signature = crypto.createHash('sha256').update(signatureString).digest('hex');
        
        formData.append('timestamp', timestampSeconds);
        formData.append('signature', signature);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
          {
            method: 'POST',
            body: formData
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Cloudinary audio upload failed:', errorText);
          throw new Error(`Cloudinary error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Cloudinary audio upload success:', data.secure_url);
        
        return res.status(200).json({
          success: true,
          url: data.secure_url,
          publicId: data.public_id
        });
      } catch (uploadError) {
        console.error('Cloudinary audio upload error:', uploadError);
        // Return mock URL on error
        return res.status(200).json({
          success: true,
          url: `https://mock-cloudinary.com/audio/${fileName}`,
          mock: true,
          error: uploadError.message
        });
      }
    }

    // For other data types, store as raw
    const timestamp = Date.now();
    const publicId = `cloudguide/data/${fileName}_${timestamp}`;
    
    const formData = new URLSearchParams();
    formData.append('file', audioData);
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('folder', 'cloudguide/data');
    formData.append('resource_type', 'raw');
    
    const crypto = require('crypto');
    const timestampSeconds = Math.round(timestamp / 1000);
    const signatureString = `folder=cloudguide/data&public_id=${publicId}&resource_type=raw&timestamp=${timestampSeconds}${apiSecret}`;
    const signature = crypto.createHash('sha256').update(signatureString).digest('hex');
    
    formData.append('timestamp', timestampSeconds);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      url: data.secure_url || `https://mock-cloudinary.com/data/${fileName}`,
      publicId: data.public_id
    });

  } catch (error) {
    console.error('Cloudinary handler error:', error);
    // Always return success with mock URL to prevent breaking the app
    return res.status(200).json({
      success: true,
      url: `https://mock-cloudinary.com/fallback/${req.body.fileName}`,
      mock: true,
      error: error.message
    });
  }
}
