import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limit = rateLimit(clientKey(request, "forgot-password"), 5, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many reset requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ message: "If the email exists, a reset code has been sent." });
    }

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const resetTokenExp = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { email },
      data: { resetToken, resetTokenExp },
    });

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || user.email; // Fallback to user or verified sender

    console.log(`[DEV] Password reset code for ${email}: ${resetToken}`);

    if (apiKey && apiKey !== "your-brevo-api-key-here") {
      try {
        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify({
            sender: { email: senderEmail, name: "Online Evaluation System" },
            to: [{ email: user.email, name: user.name }],
            subject: "Password Reset Code",
            htmlContent: `<p>Hello ${user.name},</p><p>Your password reset code is: <strong>${resetToken}</strong></p><p>This code expires in 15 minutes.</p>`,
          }),
        });
        const brevoData = await brevoRes.json();
        if (!brevoRes.ok) {
          console.error("Brevo API error:", brevoData);
        } else {
          console.log("Brevo email sent successfully via API!");
        }
      } catch (mailErr) {
        console.error("Mail send exception:", mailErr);
      }
    }

    return NextResponse.json({ message: "If the email exists, a reset code has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
