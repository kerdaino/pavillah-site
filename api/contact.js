import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { name, email, phone, message } = req.body;

  // Transporter (use your test email here)
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_USER,  // Gmail or domain email
      pass: process.env.MAIL_PASS   // App password
    },
  });

  try {
    await transporter.sendMail({
      from: `"Pavillah Site" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_TO, // ← YOUR receiving email
      subject: "New Contact Form Message",
      html: `
        <h3>New Contact Message</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Message:</strong><br>${message}</p>
      `,
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Mail error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
