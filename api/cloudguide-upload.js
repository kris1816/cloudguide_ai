// api/cloudguide-upload.js
// CloudGuide CMS Upload Integration for Vercel

const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const multiparty = require('multiparty');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Test endpoint
  if (req.method === 'POST' && req.body.test) {
    const username = process.env.CLOUDGUIDE_USERNAME;
    const password = process.env.CLOUDGUIDE_PASSWORD;
    const uuid = process.env.CLOUDGUIDE_INSTITUTION_UUID;
    
    return res.status(200).json({
      success: true,
      configured: !!(username && password && uuid),
      message: 'CloudGuide upload endpoint is ready'
    });
  }

  try {
    // Parse multipart form data
    const form = new multiparty.Form();
    
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // Extract form data
    const title = fields.title ? fields.title[0] : 'Untitled';
    const description = fields.description ? fields.description[0] : '';
    const language = fields.language ? fields.language[0] : 'en';
    const exhibitId = fields.exhibitId ? fields.exhibitId[0] : '';
    const audioFile = files.audio ? files.audio[0] : null;

    if (!audioFile) {
      return res.status(400).json({ 
        error: 'No audio file provided' 
      });
    }

    // Get CloudGuide credentials from environment
    const username = process.env.CLOUDGUIDE_USERNAME;
    const password = process.env.CLOUDGUIDE_PASSWORD;
    const institutionUuid = process.env.CLOUDGUIDE_INSTITUTION_UUID;

    if (!username || !password || !institutionUuid) {
      return res.status(500).json({ 
        error: 'CloudGuide credentials not configured',
        message: 'Please set CLOUDGUIDE_USERNAME, CLOUDGUIDE_PASSWORD, and CLOUDGUIDE_INSTITUTION_UUID in environment variables'
      });
    }

    // CloudGuide API endpoints
    const baseUrl = 'https://app.cloudguide.me';
    const loginUrl = `${baseUrl}/login`;
    const uploadUrl = `${baseUrl}/api/audio/upload`;

    // Step 1: Login to CloudGuide
    console.log('Logging into CloudGuide...');
    
    const loginResponse = await axios.post(loginUrl, {
      username: username,
      password: password
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      withCredentials: true
    });

    // Extract session token/cookie
    const cookies = loginResponse.headers['set-cookie'];
    const sessionToken = cookies ? cookies[0].split(';')[0] : '';

    if (!sessionToken) {
      throw new Error('Failed to obtain CloudGuide session');
    }

    console.log('Login successful, uploading audio...');

    // Step 2: Prepare upload
    const uploadForm = new FormData();
    uploadForm.append('title', title);
    uploadForm.append('description', description);
    uploadForm.append('language', language);
    uploadForm.append('institution_uuid', institutionUuid);
    uploadForm.append('exhibit_id', exhibitId);
    uploadForm.append('audio', audioFile.buffer, {
      filename: audioFile.originalFilename || 'audio.mp3',
      contentType: audioFile.headers['content-type'] || 'audio/mpeg'
    });

    // Step 3: Upload to CloudGuide
    const uploadResponse = await axios.post(uploadUrl, uploadForm, {
      headers: {
        ...uploadForm.getHeaders(),
        'Cookie': sessionToken
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log('Upload successful!');

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Audio uploaded to CloudGuide successfully',
      data: {
        title: title,
        language: language,
        uploadId: uploadResponse.data.id || 'unknown',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('CloudGuide upload error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
}
