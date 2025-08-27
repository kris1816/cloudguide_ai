// api/upload-audio.js - Vercel Blob Storage for audio files
import { put, list, del } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
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
      
      // Upload to Vercel Blob
      const blob = await put(path, buffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        cacheControlMaxAge: 31536000, // 1 year cache
      });

      console.log('Upload successful:', blob.url);

      // Also save metadata if provided
      if (metadata) {
        const metaPath = `audioguides/${guideId || 'general'}/metadata.json`;
        await put(metaPath, JSON.stringify(metadata), {
          access: 'public',
          contentType: 'application/json',
        });
      }

      return res.status(200).json({
        success: true,
        url: blob.url,
        pathname: blob.pathname,
        size: blob.size,
        downloadUrl: blob.downloadUrl
      });
    }

    // DELETE: Remove audio file
    if (req.method === 'DELETE') {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL required for deletion' });
      }

      await del(url);
      
      return res.status(200).json({
        success: true,
        message: 'File deleted successfully'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Vercel Blob Error:', error);
    
    // Check if it's a configuration error
    if (error.message && error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      return res.status(500).json({
        error: 'Blob storage not configured',
        message: 'Please add BLOB_READ_WRITE_TOKEN to your environment variables',
        instructions: 'Go to Vercel Dashboard → Storage → Create Blob Store → Copy token → Add to Environment Variables'
      });
    }
    
    return res.status(500).json({
      error: 'Storage operation failed',
      message: error.message
    });
  }
}
