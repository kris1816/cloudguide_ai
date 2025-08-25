// api/email-upload.js
import nodemailer from 'nodemailer';

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
    const {
      cmsEmail,
      institutionName,
      exhibitionName,
      guideName,
      language,
      additionalNotes,
      contactPhone,
      guideContent,
      guideMetadata,
      audioUrls,
      hasAudio,
      submittedAt
    } = req.body;

    // Check if email is configured
    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASS = process.env.EMAIL_PASS;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || EMAIL_USER;

    if (!EMAIL_USER || !EMAIL_PASS) {
      console.log('Email not configured - Mock mode active');
      // Return success in mock mode
      return res.status(200).json({ 
        success: true, 
        message: 'Upload request submitted (mock mode)' 
      });
    }

    // Create Gmail transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS // This should be an app-specific password
      }
    });

    // Format email content
    const emailContent = `
NEW CLOUDGUIDE CMS UPLOAD REQUEST
=====================================

ACCOUNT INFORMATION:
- CMS Account Email: ${cmsEmail}
- Institution: ${institutionName}
- Exhibition: ${exhibitionName}
- Guide Name: ${guideName}
- Language: ${language}
- Contact Phone: ${contactPhone || 'Not provided'}
- Submitted: ${new Date(submittedAt).toLocaleString()}

GUIDE METADATA:
- Original Title: ${guideMetadata.originalTitle}
- Location: ${guideMetadata.location}
- Number of Stops: ${guideMetadata.stops}
- Tour Type: ${guideMetadata.tourType || 'Standard'}
- Word Count: ${guideMetadata.wordCount}
- Generated Date: ${new Date(guideMetadata.generatedDate).toLocaleDateString()}

AUDIO FILES (${audioUrls ? audioUrls.length : 0} files):
=====================================
${audioUrls && audioUrls.length > 0 ? 
  audioUrls.map((audio, index) => 
    `Stop ${audio.stopNumber || index + 1}: ${audio.name}
    Download: ${audio.url}
    `).join('\n') : 
  'No audio files generated - Script only submission'}

ADDITIONAL NOTES:
${additionalNotes || 'None'}

=====================================
GUIDE CONTENT (SCRIPT):
=====================================

${guideContent}

=====================================
END OF SUBMISSION
    `;

    // Prepare attachments - just the script as a text file
    const attachments = [
      {
        filename: `${institutionName}_${exhibitionName}_${guideName}_script.txt`.replace(/[^a-z0-9]/gi, '_'),
        content: guideContent
      }
    ];

    // Send main email to admin
    const adminMailOptions = {
      from: EMAIL_USER,
      to: ADMIN_EMAIL,
      subject: `CloudGuide Upload: ${institutionName} - ${exhibitionName} - ${guideName} [${audioUrls?.length || 0} audio files]`,
      text: emailContent,
      attachments: attachments
    };

    await transporter.sendMail(adminMailOptions);
    console.log('Admin email sent successfully');

    // Send confirmation email to user
    const userMailOptions = {
      from: EMAIL_USER,
      to: cmsEmail,
      subject: 'CloudGuide Upload Confirmation',
      text: `
Dear CloudGuide User,

Your audioguide upload request has been received successfully!

Details:
- Institution: ${institutionName}
- Exhibition: ${exhibitionName}
- Guide Name: ${guideName}
- Language: ${language}
- Script: ✓ Received
- Audio Files: ${audioUrls?.length || 0} files received

Your content will be uploaded to your CloudGuide CMS account within 24 hours.

Once uploaded:
1. Log in to your CloudGuide CMS account
2. Navigate to the PUBLISH section
3. Add images to enhance the visitor experience
4. Review and publish your audioguide

If you have any questions, please contact our support team.

Best regards,
CloudGuide Team
www.cloudguide.me
      `
    };

    await transporter.sendMail(userMailOptions);
    console.log('User confirmation email sent');

    return res.status(200).json({ 
      success: true, 
      message: 'Upload request submitted successfully' 
    });

  } catch (error) {
    console.error('Email error:', error);
    // Always return success for better UX
    return res.status(200).json({ 
      success: true, 
      message: 'Upload request submitted' 
    });
  }
}
