const nodemailer = require('nodemailer');

// function send mail
async function sendEmail(to, subject, text) {
  try {
    // create transporter with access email and application password
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: 'webenterpriseproject@gmail.com',
        pass: 'feyfghsmerfhqacy'
      }
    });

    // Set contruct for email
    const mailOptions = {
      from: 'webenterpriseproject@gmail.com',
      to:to,
      subject: subject,
      text: text
    };

    // Send email
    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + result.response);
  } catch (error) {
    console.error(error);
  }
}

module.exports = { sendEmail };
