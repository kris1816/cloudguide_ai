// api/upload-to-cloudinary.js
// FIXED VERSION with proper fallback and file accessibility

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

    console.log('Cloudinary config check:', {
      cloudName: cloudName ? `Set (${cloudName})` : 'Not set',
      apiKey: apiKey ? 'Set' : 'Not set',
      apiSecret: apiSecret ? 'Set' : 'Not set'
    });

    // If Cloudinary is not configured, return the data URL directly
    // This ensures files are always accessible
    if (!cloudName || !apiKey || !apiSecret) {
      console.log('Cloudinary not configured, returning data URL directly');
      
      // For JSON files, return the data as-is
      if (fileName.endsWith('.json')) {
        return res.status(200).json({
          success: true,
          url: audioData, // Return the actual data
          isDataUrl: true,
          mock: false,
          message: 'Cloudinary not configured - using direct data storage'
        });
      }
      
      // For audio files, ensure it's a proper data URL
      if (fileName.endsWith('.mp3') || audioData.startsWith('data:audio')) {
        return res.status(200).json({
          success: true,
          url: audioData, // Keep the base64 data URL
          isDataUrl: true,
          mock: false,
          message: 'Cloudinary not configured - audio stored as data URL'
        });
      }
      
      // For other files
      return res.status(200).json({
        success: true,
        url: audioData,
        isDataUrl: true,
        mock: false,
        message: 'Cloudinary not configured - using direct data storage'
      });
    }

    // If we have Cloudinary credentials, try to upload
    try {
      const timestamp = Date.now();
      let publicId, folder, resourceType, uploadUrl;
      
      // Determine upload parameters based on file type
      if (fileName.endsWith('.json')) {
        publicId = `cloudguide/guides/${fileName.replace('.json', '')}_${timestamp}`;
        folder = 'cloudguide/guides';
        resourceType = 'raw';
        uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
      } else if (fileName.endsWith('.mp3') || audioData.startsWith('data:audio')) {
        publicId = `cloudguide/audio/${fileName.replace('.mp3', '')}_${timestamp}`;
        folder = 'cloudguide/audio';
        resourceType = 'video'; // Cloudinary uses 'video' for audio files
        uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
      } else {
        publicId = `cloudguide/data/${fileName}_${timestamp}`;
        folder = 'cloudguide/data';
        resourceType = 'raw';
        uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
      }
      
      // Create form data
      const formData = new URLSearchParams();
      formData.append('file', audioData);
      formData.append('public_id', publicId);
      formData.append('api_key', apiKey);
      formData.append('folder', folder);
      formData.append('resource_type', resourceType);
      
      // Generate signature for authenticated upload
      const crypto = require('crypto');
      const timestampSeconds = Math.round(timestamp / 1000);
      const paramsToSign = `folder=${folder}&public_id=${publicId}&resource_type=${resourceType}&timestamp=${timestampSeconds}`;
      const signature = crypto
        .createHash('sha256')
        .update(paramsToSign + apiSecret)
        .digest('hex');
      
      formData.append('timestamp', timestampSeconds);
      formData.append('signature', signature);

      console.log('Uploading to Cloudinary:', {
        url: uploadUrl,
        publicId: publicId,
        folder: folder,
        resourceType: resourceType
      });

      // Make the upload request
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Cloudinary upload failed:', response.status, errorText);
        
        // Return data URL as fallback
        return res.status(200).json({
          success: true,
          url: audioData,
          isDataUrl: true,
          error: 'Cloudinary upload failed, using data URL fallback',
          cloudinaryError: errorText
        });
      }

      const data = await response.json();
      console.log('Cloudinary upload success:', data.secure_url);
      
      return res.status(200).json({
        success: true,
        url: data.secure_url,
        publicId: data.public_id,
        isCloudinary: true,
        mock: false
      });
      
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      
      // Return data URL as fallback
      return res.status(200).json({
        success: true,
        url: audioData,
        isDataUrl: true,
        error: uploadError.message,
        message: 'Upload failed, using data URL fallback'
      });
    }

  } catch (error) {
    console.error('Handler error:', error);
    
    // Always return success with data URL to prevent breaking the app
    return res.status(200).json({
      success: true,
      url: req.body.audioData || '',
      isDataUrl: true,
      error: error.message
    });
  }
}
