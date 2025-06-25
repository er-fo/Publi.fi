function doGet(e) {
  console.log('=== doGet started ===');
  console.log('Parameters:', e.parameter);
  
  try {
    // Check if this is a signup request
    if (e.parameter && e.parameter.action === 'signup') {
      const email = e.parameter.email;
      const referralCode = e.parameter.referral_code || '';
      
      console.log('Email:', email);
      console.log('Referral code:', referralCode);
      
      if (!email) {
        return ContentService
          .createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Email is required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // Get the spreadsheet
      console.log('Getting spreadsheet...');
      const sheet = SpreadsheetApp.getActiveSheet();
      console.log('Sheet name:', sheet.getName());
      
      // Check if email already exists
      const existingEmails = sheet.getRange('A:A').getValues().flat();
      if (existingEmails.includes(email)) {
        console.log('Email already exists:', email);
        return ContentService
          .createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Email already registered'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // Get current row count to generate next referral code
      const lastRow = sheet.getLastRow();
      console.log('Last row:', lastRow);
      
      const nextReferralCode = 1234 + (lastRow - 1);
      console.log('Next referral code:', nextReferralCode);
      
      // Add new signup to sheet
      const timestamp = new Date();
      console.log('Adding row to sheet...');
      
      const rowData = [
        email,                    // Column A: Email
        timestamp,               // Column B: Signup_date  
        referralCode,            // Column C: Referral_Code_Used
        nextReferralCode,        // Column D: Personal_Referral_Code
        0,                       // Column E: Total_Referrals
        0,                       // Column F: Current_Tier
        timestamp                // Column G: Timestamp
      ];
      console.log('Row data to add:', rowData);
      
      sheet.appendRow(rowData);
      console.log('Row added successfully');
      
      // If they used a referral code, find the referrer and increment their count
      let referrerTier = 0;
      if (referralCode) {
        console.log('Processing referral code:', referralCode);
        referrerTier = updateReferrerCount(referralCode, sheet);
      }
      
      // Send welcome email to new signup
      try {
        sendWelcomeEmail(email, nextReferralCode, referralCode);
        console.log('Welcome email sent successfully');
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail the whole process if email fails
      }
      
      console.log('Returning success response');
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'success', 
          referral_code: nextReferralCode,
          message: 'Successfully added to waitlist'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      // Default response
      return ContentService
        .createTextOutput("Publify Waitlist API is running!")
        .setMimeType(ContentService.MimeType.TEXT);
    }
      
  } catch (error) {
    console.error('=== ERROR in doGet ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error', 
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateReferrerCount(referralCode, sheet) {
  console.log('=== updateReferrerCount started ===');
  console.log('Looking for referral code:', referralCode);
  
  try {
    const data = sheet.getDataRange().getValues();
    console.log('Sheet data rows:', data.length);
    
    // Find the referrer (skip header row)
    for (let i = 1; i < data.length; i++) {
      console.log(`Row ${i}: Personal_Referral_Code =`, data[i][3]);
      
      if (data[i][3] == referralCode) {
        console.log('Found matching referrer at row:', i + 1);
        
        // Increment their referral count (Column E)
        const currentCount = data[i][4] || 0;
        const newCount = currentCount + 1;
        console.log('Current count:', currentCount, '-> New count:', newCount);
        
        sheet.getRange(i + 1, 5).setValue(newCount);
        
        // Update their tier (Column F)
        const newTier = calculateTier(newCount);
        console.log('New tier:', newTier);
        sheet.getRange(i + 1, 6).setValue(newTier);
        
        // Send tier upgrade email if tier changed
        const oldTier = calculateTier(currentCount);
        if (newTier > oldTier) {
          try {
            sendTierUpgradeEmail(data[i][0], newTier, newCount);
            console.log('Tier upgrade email sent');
          } catch (emailError) {
            console.error('Failed to send tier upgrade email:', emailError);
          }
        }
        
        console.log('Referrer count updated successfully');
        return newTier;
      }
    }
  } catch (error) {
    console.error('Error in updateReferrerCount:', error);
  }
  return 0;
}

function calculateTier(referralCount) {
  if (referralCount >= 30) return 5; // Legend
  if (referralCount >= 15) return 4; // High Achiever
  if (referralCount >= 5) return 3;  // Momentum Builder
  if (referralCount >= 2) return 2;  // Social Connector
  if (referralCount >= 1) return 1;  // Friend Spark
  return 0; // Onboard
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
  const tierInfo = getTierInfo(0); // New signups start at tier 0
  const referralUrl = `https://er-fo.github.io/Publi.fi/?ref=${referralCode}`;
  
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
          <a href="https://er-fo.github.io/Publi.fi/" style="color: #667eea;">Visit Publify</a> | 
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
        <a href="https://er-fo.github.io/Publi.fi/?ref=YOUR_CODE" style="display: inline-block; background: #1e293b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 600;">Keep Sharing!</a>
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