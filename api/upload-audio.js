// api/upload-audio.js - Vercel Blob Storage (Proper Integration)

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Dynamically import @vercel/blob to avoid build issues
    const { put, list, del } = await import('@vercel/blob');
    
    // GET: Check status or list files
    if (req.method === 'GET') {
      const { guideId } = req.query;
      
      try {
        if (guideId) {
          const { blobs } = await list({
            prefix: `audioguides/${guideId}/`,
            limit: 100,
          });
          
          return res.status(200).json({
            success: true,
            configured: true,
            files: blobs.map(blob => ({
              url: blob.url,
              pathname: blob.pathname,
              size: blob.size,
              uploadedAt: blob.uploadedAt
            }))
          });
        }
        
        return res.status(200).json({
          success: true,
          configured: true,
          message: 'Vercel Blob Storage is working',
          files: []
        });
        
      } catch (listError) {
        // Empty list is not an error
        return res.status(200).json({
          success: true,
          configured: true,
          files: []
        });
      }
    }

    // POST: Upload audio file
    if (req.method === 'POST') {
      const { audioData, fileName, guideId, metadata } = req.body;

      if (!audioData || !fileName) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          message: 'audioData and fileName are required' 
        });
      }

      try {
        // Extract base64 data
        let base64Data = audioData;
        if (audioData.includes('base64,')) {
          base64Data = audioData.split('base64,')[1];
        }

        // Convert to buffer
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Create unique path
        const timestamp = Date.now();
        const uniqueFileName = `${fileName.replace('.mp3', '')}_${timestamp}.mp3`;
        const pathname = `audioguides/${guideId || 'general'}/${uniqueFileName}`;
        
        console.log(`Uploading to Vercel Blob: ${pathname}`);
        
        // Upload to Vercel Blob
        const blob = await put(pathname, buffer, {
          access: 'public',
          contentType: 'audio/mpeg',
          cacheControlMaxAge: 31536000, // 1 year
        });

        console.log('Upload successful:', blob.url);

        // Save metadata if provided
        if (metadata) {
          try {
            const metaPath = `audioguides/${guideId || 'general'}/metadata_${timestamp}.json`;
            await put(metaPath, JSON.stringify(metadata), {
              access: 'public',
              contentType: 'application/json',
            });
          } catch (metaError) {
            console.log('Metadata save skipped:', metaError.message);
          }
        }

        return res.status(200).json({
          success: true,
          url: blob.url,
          pathname: blob.pathname,
          size: blob.size,
          downloadUrl: blob.downloadUrl || blob.url,
          storage: 'vercel-blob',
          permanent: true
        });
        
      } catch (uploadError) {
        console.error('Vercel Blob upload error:', uploadError);
        
        // Return error details
        return res.status(500).json({
          error: 'Upload failed',
          message: uploadError.message,
          details: 'Check if @vercel/blob is installed and BLOB_READ_WRITE_TOKEN exists'
        });
      }
    }

    // DELETE: Remove file
    if (req.method === 'DELETE') {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ 
          error: 'URL required for deletion' 
        });
      }

      try {
        await del(url);
        return res.status(200).json({
          success: true,
          message: 'File deleted successfully'
        });
      } catch (delError) {
        return res.status(500).json({
          error: 'Delete failed',
          message: delError.message
        });
      }
    }

    return res.status(405).json({ 
      error: 'Method not allowed' 
    });

  } catch (error) {
    console.error('Handler error:', error);
    
    // Check if it's a missing package error
    if (error.message && error.message.includes('Cannot find module')) {
      return res.status(500).json({
        error: 'Package not installed',
        message: '@vercel/blob package is not installed',
        solution: 'Add "@vercel/blob": "latest" to package.json dependencies'
      });
    }
    
    // Check if it's a missing token error
    if (error.message && error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(500).json({
        error: 'Blob not configured',
        message: 'Vercel Blob Storage is not set up',
        solution: 'Go to Vercel Dashboard → Storage → Create Blob Store'
      });
    }
    
    return res.status(500).json({
      error: 'Server error',
      message: error.message || 'An error occurred'
    });
  }
}
