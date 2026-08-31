const nodemailer = require('nodemailer');
const config = require('../config');

// Create reusable Nodemailer transporter instance
const createTransporter = () => {
  if (config.smtp.user && config.smtp.pass) {
    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass
      }
    });
  }
  
  // Return null if no SMTP credentials provided
  return null;
};

/**
 * Sends OTP Email for shop registration verification
 */
const sendOtpEmail = async (toEmail, otp, storeName = 'Valued Partner') => {
  const mailOptions = {
    from: config.smtp.from,
    to: toEmail,
    subject: 'GoGrocery - Verification OTP Code',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2c3e50; text-align: center;">Welcome to GoGrocery!</h2>
        <p>Hello <strong>${storeName}</strong>,</p>
        <p>Thank you for registering your shop with GoGrocery. Please use the following OTP code to verify your account:</p>
        <div style="background-color: #f8f9fa; text-align: center; padding: 15px; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #27ae60; margin: 20px 0; border-radius: 6px;">
          ${otp}
        </div>
        <p style="color: #7f8c8d; font-size: 14px;">This OTP is valid for 15 minutes. Please do not share this code with anyone.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="text-align: center; color: #95a5a6; font-size: 12px;">© GoGrocery Team. All rights reserved.</p>
      </div>
    `
  };

  try {
    const transporter = createTransporter();
    if (transporter) {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[EmailService] OTP email sent to ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      console.log(`[EmailService] SMTP credentials not set. [DEV OTP for ${toEmail}]: ${otp}`);
      return { success: true, devMode: true, otp };
    }
  } catch (error) {
    console.error(`[EmailService Error] Failed to send OTP email to ${toEmail}:`, error.message);
    console.log(`[DEV FALLBACK OTP for ${toEmail}]: ${otp}`);
    return { success: false, error: error.message, devOtp: otp };
  }
};

/**
 * Sends Confirmation Email with assigned Shop Code after successful verification
 */
const sendRegistrationSuccessEmail = async (toEmail, storeName, shopCode) => {
  const mailOptions = {
    from: config.smtp.from,
    to: toEmail,
    subject: 'GoGrocery - Registration Successful & Your Unique Shop Code',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #27ae60; text-align: center;">Registration Confirmed! 🎉</h2>
        <p>Congratulations <strong>${storeName}</strong>,</p>
        <p>Your shop registration has been successfully verified on GoGrocery!</p>
        
        <div style="background-color: #eef9f1; border-left: 4px solid #27ae60; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #2c3e50;">Your Unique Shop Code:</p>
          <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: #27ae60;">${shopCode}</p>
        </div>

        <p style="color: #34495e;">Keep this shop code safe as it will be required for managing your store dashboard, inventory, and customer orders.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="text-align: center; color: #95a5a6; font-size: 12px;">© GoGrocery Team. All rights reserved.</p>
      </div>
    `
  };

  try {
    const transporter = createTransporter();
    if (transporter) {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[EmailService] Success email sent to ${toEmail}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      console.log(`[EmailService] SMTP credentials not set. [DEV SUCCESS EMAIL to ${toEmail} - ShopCode: ${shopCode}]`);
      return { success: true, devMode: true };
    }
  } catch (error) {
    console.error(`[EmailService Error] Failed to send success email to ${toEmail}:`, error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendOtpEmail,
  sendRegistrationSuccessEmail
};
