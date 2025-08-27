// api/upload-audio.js - Vercel Blob Storage for audio files
const { put, list, del } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET: List all audio files
    if (req.method === 'GET') {
      const { guideId } = req.query;
      
      try {
        const { blobs } = await list({
          prefix: guideId ? `audioguides/${guideId}/` : 'audioguides/',
          limit: 100,
        });
        
        return res.status(200).json({
          success: true,
          files: blobs.map(blob => ({
            url: blob.url,
            pathname: blob.pathname,
            size: blob.size,
            uploadedAt: blob.uploadedAt
          }))
        });
      } catch (listError) {
        console.log('List error (might be empty):', listError.message);
        return res.status(200).json({
          success: true,
          files: []
        });
      }
    }

    // POST: Upload audio file
    if (req.method === 'POST') {
      const { audioData, fileName, guideId, metadata } = req.body;

      if (!audioData || !fileName) {
        return res.status(400).json({ 
          error: 'Missing required fields: audioData and fileName' 
        });
      }

      // Remove data URL prefix if present
      let base64Data = audioData;
      if (audioData.includes('base64,')) {
        base64Data = audioData.split('base64,')[1];
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Create path: audioguides/[guideId]/[fileName]
      const path = `audioguides/${guideId || 'general'}/${fileName}`;
      
      console.log(`Uploading to Vercel Blob: ${path}`);
      
      try {
        // Upload to Vercel Blob
        const blob = await put(path, buffer, {
          access: 'public',
          contentType: 'audio/mpeg',
          cacheControlMaxAge: 31536000, // 1 year cache
        });

        console.log('Upload successful:', blob.url);

        // Also save metadata if provided
        if (metadata) {
          try {
            const metaPath = `audioguides/${guideId || 'general'}/metadata.json`;
            await put(metaPath, JSON.stringify(metadata), {
              access: 'public',
              contentType: 'application/json',
            });
          } catch (metaError) {
            console.log('Metadata save error (non-critical):', metaError.message);
          }
        }

        return res.status(200).json({
          success: true,
          url: blob.url,
          pathname: blob.pathname,
          size: blob.size,
          downloadUrl: blob.downloadUrl
        });
        
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        
        // Check if it's a configuration error
        if (uploadError.message && uploadError.message.includes('BLOB_READ_WRITE_TOKEN')) {
          return res.status(500).json({
            error: 'Blob storage not configured',
            message: 'BLOB_READ_WRITE_TOKEN not found. Check Vercel Storage settings.',
            instructions: 'Go to Vercel Dashboard → Storage → Create Blob Store'
          });
        }
        
        throw uploadError;
      }
    }

    // DELETE: Remove audio file
    if (req.method === 'DELETE') {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL required for deletion' });
      }

      try {
        await del(url);
        
        return res.status(200).json({
          success: true,
          message: 'File deleted successfully'
        });
      } catch (delError) {
        console.log('Delete error:', delError.message);
        return res.status(200).json({
          success: true,
          message: 'Delete attempted'
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Vercel Blob Error:', error);
    
    // Return a proper JSON error response
    return res.status(500).json({
      error: 'Storage operation failed',
      message: error.message || 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
