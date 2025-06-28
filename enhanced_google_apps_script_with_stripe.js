// Enhanced Google Apps Script with Stripe Integration
// This script handles both waitlist signups and Stripe payment processing

// TODO: Add your Stripe secret key to Google Apps Script Project Settings > Script Properties
// Key: STRIPE_SECRET_KEY, Value: sk_live_51Rf4lUIoskyBmVof...
const STRIPE_SECRET_KEY = PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY');

function doGet(e) {
  console.log('=== doGet started ===');
  console.log('Parameters:', e.parameter);
  
  try {
    // Handle payment success callback
    if (e.parameter && e.parameter.action === 'payment_success') {
      return handlePaymentSuccess(e.parameter);
    }
    
    // Handle waitlist signup
    if (e.parameter && e.parameter.action === 'signup') {
      const email = e.parameter.email;
      const referralCode = e.parameter.referral_code || '';
      
      if (!email) {
        return ContentService
          .createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Email is required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      const sheet = SpreadsheetApp.getActiveSheet();
      const existingEmails = sheet.getRange('A:A').getValues().flat();
      if (existingEmails.includes(email)) {
        return ContentService
          .createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Email already registered'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      const lastRow = sheet.getLastRow();
      const nextReferralCode = 1234 + (lastRow - 1);
      const timestamp = new Date();
      
      const rowData = [
        email,                    // Column A: Email
        timestamp,               // Column B: Signup_date  
        referralCode,            // Column C: Referral_Code_Used
        nextReferralCode,        // Column D: Personal_Referral_Code
        0,                       // Column E: Total_Referrals
        0,                       // Column F: Current_Tier
        timestamp,               // Column G: Timestamp
        'WAITLIST',              // Column H: Payment_Status
        '',                      // Column I: Payment_Intent_ID
        '',                      // Column J: Stripe_Customer_ID
        ''                       // Column K: Payment_Date
      ];
      
      sheet.appendRow(rowData);
      
      if (referralCode) {
        updateReferrerCount(referralCode, sheet);
      }
      
      try {
        sendWelcomeEmail(email, nextReferralCode, referralCode);
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }
      
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'success', 
          referral_code: nextReferralCode,
          message: 'Successfully added to waitlist'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService
        .createTextOutput("Publify Waitlist & Payment API is running!")
        .setMimeType(ContentService.MimeType.TEXT);
    }
      
  } catch (error) {
    console.error('=== ERROR in doGet ===');
    console.error('Error message:', error.message);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error', 
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  console.log('=== doPost started ===');
  
  try {
    const requestBody = JSON.parse(e.postData.contents);
    console.log('Request body:', requestBody);
    
    if (requestBody.action === 'create_payment_intent') {
      return createPaymentIntent(requestBody);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Unknown action'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('=== ERROR in doPost ===');
    console.error('Error message:', error.message);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function createPaymentIntent(requestData) {
  console.log('=== createPaymentIntent started ===');
  
  try {
    const { email, amount, currency } = requestData;
    
    const paymentIntentData = {
      amount: amount,
      currency: currency,
      receipt_email: email,
      'metadata[email]': email,
      'metadata[product]': 'publify_mvp_early_access'
    };
    
    const payload = Object.keys(paymentIntentData)
      .map(key => `${key}=${encodeURIComponent(paymentIntentData[key])}`)
      .join('&');
    
    const response = UrlFetchApp.fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload
    });
    
    const paymentIntent = JSON.parse(response.getContentText());
    console.log('Payment intent created:', paymentIntent.id);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        client_secret: paymentIntent.client_secret
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Failed to create payment intent'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handlePaymentSuccess(params) {
  console.log('=== handlePaymentSuccess started ===');
  
  try {
    const email = params.email;
    const paymentIntentId = params.payment_intent;
    const status = params.status;
    
    if (!email || !paymentIntentId) {
      throw new Error('Missing required payment parameters');
    }
    
    const sheet = SpreadsheetApp.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) {
        console.log('Found user, updating payment status');
        
        sheet.getRange(i + 1, 8).setValue('PAID');
        sheet.getRange(i + 1, 9).setValue(paymentIntentId);
        sheet.getRange(i + 1, 11).setValue(new Date());
        
        try {
          sendMVPAccessEmail(email, paymentIntentId);
          console.log('MVP access email sent');
        } catch (emailError) {
          console.error('Failed to send MVP access email:', emailError);
        }
        
        break;
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Payment recorded successfully'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error handling payment success:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function sendMVPAccessEmail(email, paymentIntentId) {
  const subject = "🚀 Your Publify MVP Access is Confirmed!";
  
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #667eea; font-size: 2.5rem; margin: 0;">Publify</h1>
        <p style="color: #666; font-size: 1.1rem; margin: 10px 0 0 0;">MVP Early Access</p>
      </div>
      
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0 0 15px 0;">🎉 Payment Confirmed!</h2>
        <div style="font-size: 2rem; margin: 15px 0;">🚀</div>
        <h3 style="margin: 10px 0;">Welcome to Publify MVP Early Access!</h3>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">You're now locked in at $7.99/month for life</p>
      </div>
      
      <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin-bottom: 25px;">
        <h3 style="color: #1e293b; margin: 0 0 15px 0;">📧 MVP Access Coming Soon</h3>
        <p style="color: #475569; line-height: 1.6;">
          Your MVP credentials will arrive within <strong>48 hours</strong> via email.
          You'll receive a separate email with your unique login URL, username, and password.
        </p>
      </div>
      
      <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
        <h3 style="color: #92400e; margin: 0 0 10px 0;">🎯 What You've Secured</h3>
        <div style="color: #78350f; line-height: 1.6;">
          <p><strong>✅ $7.99/month locked in for life</strong></p>
          <p><strong>✅ MVP access within 48 hours</strong></p>
          <p><strong>✅ Your 30% waitlist discount still active</strong></p>
          <p><strong>✅ Cancel anytime after month 1</strong></p>
          <p><strong>🛡️ Full refund available upon request</strong></p>
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 0.9rem; margin-top: 30px;">
        <p><strong>Questions or need support?</strong></p>
        <p>Email <strong>support@publi.fi</strong> - we respond within 24 hours</p>
        <p>Payment ID: ${paymentIntentId}</p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
}

// Keep existing functions
function updateReferrerCount(referralCode, sheet) {
  try {
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][3] == referralCode) {
        const currentCount = data[i][4] || 0;
        const newCount = currentCount + 1;
        
        sheet.getRange(i + 1, 5).setValue(newCount);
        
        const newTier = calculateTier(newCount);
        sheet.getRange(i + 1, 6).setValue(newTier);
        
        const oldTier = calculateTier(currentCount);
        if (newTier > oldTier) {
          try {
            sendTierUpgradeEmail(data[i][0], newTier, newCount);
          } catch (emailError) {
            console.error('Failed to send tier upgrade email:', emailError);
          }
        }
        
        return newTier;
      }
    }
  } catch (error) {
    console.error('Error in updateReferrerCount:', error);
  }
  return 0;
}

function calculateTier(referralCount) {
  if (referralCount >= 30) return 5;
  if (referralCount >= 15) return 4;
  if (referralCount >= 5) return 3;
  if (referralCount >= 2) return 2;
  if (referralCount >= 1) return 1;
  return 0;
}

function getTierInfo(tier) {
  const tiers = {
    0: { name: "Onboard", discount: "30%", reward: "Early access invite" },
    1: { name: "Friend Spark", discount: "35%", reward: "Founder's Club badge" },
    2: { name: "Social Connector", discount: "40%", reward: "Behind-the-scenes email updates" },
    3: { name: "Momentum Builder", discount: "50%", reward: "Private Slack community" },
    4: { name: "High Achiever", discount: "70%", reward: "Limited swag pack" },
    5: { name: "Legend", discount: "100%", reward: "VIP support + Public shout-out" }
  };
  return tiers[tier] || tiers[0];
}

function sendWelcomeEmail(email, referralCode, usedReferralCode) {
  const tierInfo = getTierInfo(0);
  const referralUrl = `https://publi.fi/?ref=${referralCode}`;
  
  const subject = "🎉 Welcome to Publify - Your Build-in-Public Assistant!";
  
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #667eea; font-size: 2.5rem; margin: 0;">Publify</h1>
        <p style="color: #666; font-size: 1.1rem; margin: 10px 0 0 0;">Build in Public, Effortlessly</p>
      </div>
      
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0 0 15px 0;">🎉 Welcome to the Future of Building in Public!</h2>
        <p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">You're now part of an exclusive community of indie developers who are about to transform how they share their journey.</p>
      </div>
      
      <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin-bottom: 25px;">
        <h3 style="color: #1e293b; margin: 0 0 15px 0;">🎯 Your Exclusive Benefits:</h3>
        <ul style="color: #475569; line-height: 1.6; margin: 0; padding-left: 20px;">
          <li><strong>${tierInfo.discount} lifetime discount</strong> on all Publify services</li>
          <li><strong>Early access</strong> to the beta when we launch</li>
          <li><strong>Behind-the-scenes updates</strong> as we build Publify</li>
          ${usedReferralCode ? '<li><strong>Bonus:</strong> You were referred by a friend - extra perks coming!</li>' : ''}
        </ul>
      </div>
      
      <div style="background: #10b981; color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 25px;">
        <h3 style="margin: 0 0 10px 0;">🚀 Your Personal Referral Code</h3>
        <div style="font-size: 1.5rem; font-weight: bold; margin: 10px 0;">${referralCode}</div>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Share this with friends to unlock amazing rewards!</p>
      </div>
      
      <div style="text-align: center; margin-bottom: 25px;">
        <a href="${referralUrl}" style="display: inline-block; background: #1e293b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; font-size: 1.1rem;">Share Your Referral Link</a>
      </div>
      
      <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
        <h3 style="color: #92400e; margin: 0 0 10px 0;">📈 Pyramid Rewards System</h3>
        <div style="color: #78350f; line-height: 1.6;">
          <p><strong>1 referral:</strong> 35% off + Founder's Club badge</p>
          <p><strong>2 referrals:</strong> 40% off + Behind-the-scenes updates</p>
          <p><strong>5 referrals:</strong> 50% off + Private Slack community</p>
          <p><strong>15 referrals:</strong> 70% off + Limited swag pack</p>
          <p style="margin-bottom: 0;"><strong>30 referrals:</strong> 100% FREE + VIP support!</p>
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 0.9rem; margin-top: 30px;">
        <p>Questions? Just reply to this email - we read every message!</p>
        <p style="margin: 20px 0 0 0;">
          <a href="https://publi.fi/" style="color: #667eea;">Visit Publify</a> | 
          <a href="${referralUrl}" style="color: #667eea;">Your Referral Link</a>
        </p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
}

function sendTierUpgradeEmail(email, newTier, referralCount) {
  const tierInfo = getTierInfo(newTier);
  const subject = `🎊 Tier Upgrade! You're now a ${tierInfo.name}!`;
  
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #667eea; font-size: 2.5rem; margin: 0;">Publify</h1>
      </div>
      
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0 0 15px 0;">🎊 Congratulations! Tier Upgrade!</h2>
        <div style="font-size: 2rem; margin: 15px 0;">🏆</div>
        <h3 style="margin: 10px 0;">You're now a ${tierInfo.name}!</h3>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">You've successfully referred ${referralCount} ${referralCount === 1 ? 'person' : 'people'}!</p>
      </div>
      
      <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin-bottom: 25px;">
        <h3 style="color: #1e293b; margin: 0 0 15px 0;">🎁 Your New Benefits:</h3>
        <ul style="color: #475569; line-height: 1.6; margin: 0; padding-left: 20px;">
          <li><strong>${tierInfo.discount} lifetime discount</strong> on all Publify services</li>
          <li><strong>${tierInfo.reward}</strong></li>
          <li><strong>All previous tier benefits</strong></li>
        </ul>
      </div>
      
      <div style="text-align: center; margin-bottom: 25px;">
        <a href="https://publi.fi/?ref=YOUR_CODE" style="display: inline-block; background: #1e293b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 600;">Keep Sharing!</a>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 0.9rem;">
        <p>Keep up the amazing work! Every referral brings you closer to the ultimate Legend status (100% FREE)!</p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
} 