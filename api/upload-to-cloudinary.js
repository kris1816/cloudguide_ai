// api/upload-to-cloudinary.js
// COMPLETE FIX with proper Cloudinary upload and fallback

const crypto = require('crypto');

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
    const { audioData, fileName, type = 'audio' } = req.body;

    // Get Cloudinary credentials
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    console.log('=== Cloudinary Upload Debug ===');
    console.log('File:', fileName);
    console.log('Type:', type);
    console.log('Config:', {
      cloudName: cloudName || 'NOT SET',
      apiKey: apiKey ? 'SET' : 'NOT SET',
      apiSecret: apiSecret ? 'SET' : 'NOT SET'
    });

    // CHECK IF CLOUDINARY IS CONFIGURED
    if (!cloudName || !apiKey || !apiSecret) {
      console.error('ERROR: Cloudinary environment variables not configured!');
      console.log('Please set in Vercel dashboard:');
      console.log('- CLOUDINARY_CLOUD_NAME');
      console.log('- CLOUDINARY_API_KEY');
      console.log('- CLOUDINARY_API_SECRET');
      
      // CRITICAL: Return data URL directly if Cloudinary not configured
      // This ensures files are still accessible
      return res.status(200).json({
        success: true,
        url: audioData, // Return the data URL directly
        storage: 'dataUrl',
        warning: 'Cloudinary not configured - returning data URL'
      });
    }

    // CLOUDINARY IS CONFIGURED - PROCEED WITH UPLOAD
    const timestamp = Math.round(Date.now() / 1000);
    let folder, resourceType, uploadUrl;
    
    // Determine upload parameters based on file type
    if (type === 'audio' || fileName.includes('audio')) {
      folder = 'cloudguide/audio';
      resourceType = 'video'; // Cloudinary uses 'video' for audio files
      uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
    } else if (type === 'json' || fileName.endsWith('.json')) {
      folder = 'cloudguide/guides';
      resourceType = 'raw';
      uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
    } else {
      folder = 'cloudguide/files';
      resourceType = 'auto';
      uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
    }

    // Generate unique public ID
    const publicId = `${folder}/${fileName.replace(/\.[^/.]+$/, "")}_${timestamp}`;
    
    // Create signature for secure upload
    const paramsToSign = {
      folder: folder,
      public_id: publicId,
      resource_type: resourceType,
      timestamp: timestamp
    };
    
    // Sort parameters alphabetically for signature
    const sortedParams = Object.keys(paramsToSign)
      .sort()
      .map(key => `${key}=${paramsToSign[key]}`)
      .join('&');
    
    const signatureString = `${sortedParams}${apiSecret}`;
    const signature = crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');

    console.log('Upload params:', {
      folder,
      resourceType,
      publicId,
      timestamp
    });

    // Prepare form data for upload
    const formData = new URLSearchParams();
    formData.append('file', audioData);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', folder);
    formData.append('public_id', publicId);
    formData.append('resource_type', resourceType);

    // Upload to Cloudinary
    console.log('Uploading to Cloudinary...');
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    const responseText = await response.text();
    console.log('Cloudinary response status:', response.status);
    
    if (!response.ok) {
      console.error('Cloudinary upload failed:', responseText);
      
      // FALLBACK: Return data URL on upload failure
      return res.status(200).json({
        success: true,
        url: audioData, // Return original data URL
        storage: 'dataUrl',
        error: `Cloudinary upload failed: ${response.status}`,
        details: responseText
      });
    }

    // Parse successful response
    const data = JSON.parse(responseText);
    console.log('Upload successful! URL:', data.secure_url);
    
    return res.status(200).json({
      success: true,
      url: data.secure_url,
      publicId: data.public_id,
      storage: 'cloudinary',
      format: data.format,
      size: data.bytes
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // FINAL FALLBACK: Return data URL on any error
    const { audioData } = req.body;
    return res.status(200).json({
      success: true,
      url: audioData || '', // Return original data if available
      storage: 'dataUrl',
      error: error.message
    });
  }
}
