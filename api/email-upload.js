export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Handle GET request (for testing)
  if (req.method === 'GET') {
    res.status(200).json({ 
      message: 'Email upload endpoint is working!',
      method: 'Please use POST to submit data'
    });
    return;
  }
  
  // Handle POST request
  if (req.method === 'POST') {
    console.log('Upload received:', req.body);
    
    res.status(200).json({ 
      success: true,
      message: 'Upload request submitted successfully'
    });
    return;
  }
  
  // Method not allowed
  res.status(405).json({ error: 'Method not allowed' });
}
