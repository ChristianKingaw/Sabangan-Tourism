import nodemailer from "nodemailer";

const DEFAULT_SUBJECT = String(process.env.ACCEPTANCE_EMAIL_SUBJECT || "GAGAYAM TRAIL RUN 2026 Registration Confirmed").trim();
const DEFAULT_REJECTION_SUBJECT = String(
  process.env.REJECTION_EMAIL_SUBJECT || "GAGAYAM TRAIL RUN 2026 Registration Update"
).trim();
const DEFAULT_CATEGORY_LABEL = "15KM Regular Run";
const DEFAULT_REGISTRATION_FEE = Number(process.env.FIXED_REGISTRATION_AMOUNT || "1500");

let cachedTransporter = null;

function parsePort(value) {
  const parsed = Number(value || "587");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 587;
  }
  return parsed;
}

function isSecurePort(port) {
  return port === 465;
}

function parseSecureFlag(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getEmailConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const port = parsePort(process.env.SMTP_PORT);
  const secure = parseSecureFlag(process.env.SMTP_SECURE, isSecurePort(port));
  const from = String(process.env.SMTP_FROM || user).trim();

  return {
    host,
    port,
    secure,
    user,
    pass,
    from
  };
}

export function isAcceptanceEmailConfigured() {
  const config = getEmailConfig();
  return Boolean(config.host && config.user && config.pass && config.from);
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const config = getEmailConfig();
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
  return cachedTransporter;
}

function formatShirtSize(value) {
  const size = String(value || "").trim();
  return size ? size.toUpperCase() : "NOT SPECIFIED";
}

function formatRegistrationFee(amount) {
  const parsed = Number(amount);
  const safeAmount = Number.isFinite(parsed) ? parsed : DEFAULT_REGISTRATION_FEE;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(safeAmount);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAcceptanceEmailBody({ shirtSize, categoryLabel, registrationFee }) {
  const safeCategoryLabel = String(categoryLabel || "").trim() || DEFAULT_CATEGORY_LABEL;
  const safeShirtSize = formatShirtSize(shirtSize);
  const safeRegistrationFee = formatRegistrationFee(registrationFee);

  return `Dear Trail Runner,

Ayehay! 🌄

Your adventure begins now!

This message confirms your successful registration for the GAGAYAM TRAIL RUN 2026 — where mountains rise, trails challenge, and runners discover their strongest selves.

Get ready to experience breathtaking landscapes, cultural celebration, and the thrill of the trail as we gather for one unforgettable run.

━━━━━━━━━━━━━━━━━━
REGISTRATION DETAILS
• Category: ${safeCategoryLabel}
• Registration Payment Total: ${safeRegistrationFee}
• Shirt Size: ${safeShirtSize}

━━━━━━━━━━━━━━━━━━
The mountains of Gagayam are calling — and your spot at the starting line is officially secured. Prepare for rugged paths, scenic views, and a community united by passion for trail running.

Please arrive early on event day for race kit verification and final announcements.

If you have any questions or need assistance, please do not reply to this email.

Instead, message us through our official
Facebook page:
https://www.facebook.com/123007249102256/

Thank you for being part of this journey. Train well, stay safe, and we’ll see you at the trail!

Run wild. Run free. Run GAGAYAM.

— GAGAYAM TRAIL RUN 2026 Organizing Team`;
}

function buildAcceptanceEmailHtml({ shirtSize, categoryLabel, registrationFee }) {
  const safeCategoryLabel = escapeHtml(String(categoryLabel || "").trim() || DEFAULT_CATEGORY_LABEL);
  const safeShirtSize = escapeHtml(formatShirtSize(shirtSize));
  const safeRegistrationFee = escapeHtml(formatRegistrationFee(registrationFee));

  return `
<!doctype html>
<html lang="en">
  <body style="margin:0; padding:0; background-color:#f4f7f4;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f7f4; padding:24px 12px; font-family:Arial, Helvetica, sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px; background-color:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #d8e3db;">
            <tr>
              <td style="padding:28px 28px 20px; background:linear-gradient(145deg, #0a4c2b 0%, #16703f 100%); color:#ffffff;">
                <p style="margin:0; font-size:12px; letter-spacing:1.4px; text-transform:uppercase; font-weight:700; opacity:0.9;">Gagayam Trail Run 2026</p>
                <h1 style="margin:10px 0 0; font-size:28px; line-height:1.2; font-weight:800;">Registration Confirmed</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px; color:#173b29;">
                <p style="margin:0 0 14px; font-size:15px; line-height:1.6;">Dear Trail Runner,</p>
                <p style="margin:0 0 14px; font-size:15px; line-height:1.6;"><strong>Ayehay!</strong> Your adventure begins now.</p>
                <p style="margin:0; font-size:15px; line-height:1.6;">This confirms your successful registration for the GAGAYAM TRAIL RUN 2026. Get ready for the trail.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #d5e7db; border-radius:10px; background:#f8fcf9;">
                  <tr>
                    <td style="padding:14px 16px; border-bottom:1px solid #d5e7db; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#1d5c3d;">
                      Registration Details
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px 2px;">
                      <p style="margin:0 0 10px; font-size:14px; color:#103925;"><strong>Category:</strong> ${safeCategoryLabel}</p>
                      <p style="margin:0 0 10px; font-size:14px; color:#103925;"><strong>Registration Payment Total:</strong> ${safeRegistrationFee}</p>
                      <p style="margin:0 0 12px; font-size:14px; color:#103925;"><strong>Shirt Size:</strong> ${safeShirtSize}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 28px 6px; color:#173b29;">
                <p style="margin:0 0 14px; font-size:14px; line-height:1.7;">
                  The mountains of Gagayam are calling and your spot at the starting line is officially secured.
                  Please arrive early on event day for race kit verification and final announcements.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 20px; color:#173b29;">
                <p style="margin:0 0 6px; font-size:14px; line-height:1.6;">For assistance, message our official Facebook page:</p>
                <p style="margin:0;"><a href="https://www.facebook.com/123007249102256/" style="color:#0f6d3b; font-weight:700; text-decoration:none;">facebook.com/123007249102256</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px; border-top:1px solid #e5eee8; color:#315843;">
                <p style="margin:0 0 6px; font-size:13px; line-height:1.6;">Run wild. Run free. Run GAGAYAM.</p>
                <p style="margin:0; font-size:13px; line-height:1.6;">GAGAYAM TRAIL RUN 2026 Organizing Team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildRejectionEmailBody({ categoryLabel }) {
  const safeCategoryLabel = String(categoryLabel || "").trim() || DEFAULT_CATEGORY_LABEL;

  return `Dear Trail Runner,

Thank you for registering for GAGAYAM TRAIL RUN 2026.

After review, your registration for the following category was not accepted:

• Category: ${safeCategoryLabel}

This update may be due to incomplete or invalid registration details or payment records.

If you believe this was made in error or if you need clarification, please contact us through our official Facebook page:
https://www.facebook.com/123007249102256/

Thank you for your interest and understanding.

— GAGAYAM TRAIL RUN 2026 Organizing Team`;
}

function buildRejectionEmailHtml({ categoryLabel }) {
  const safeCategoryLabel = escapeHtml(String(categoryLabel || "").trim() || DEFAULT_CATEGORY_LABEL);

  return `
<!doctype html>
<html lang="en">
  <body style="margin:0; padding:0; background-color:#f4f7f4;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f7f4; padding:24px 12px; font-family:Arial, Helvetica, sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px; background-color:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #ead3d3;">
            <tr>
              <td style="padding:28px 28px 20px; background:linear-gradient(145deg, #7a1d1d 0%, #a73535 100%); color:#ffffff;">
                <p style="margin:0; font-size:12px; letter-spacing:1.4px; text-transform:uppercase; font-weight:700; opacity:0.9;">Gagayam Trail Run 2026</p>
                <h1 style="margin:10px 0 0; font-size:28px; line-height:1.2; font-weight:800;">Registration Update</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px; color:#4f1d1d;">
                <p style="margin:0 0 14px; font-size:15px; line-height:1.6;">Dear Trail Runner,</p>
                <p style="margin:0 0 14px; font-size:15px; line-height:1.6;">Thank you for registering for GAGAYAM TRAIL RUN 2026.</p>
                <p style="margin:0; font-size:15px; line-height:1.6;">After review, your registration was not accepted.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #f0d7d7; border-radius:10px; background:#fff8f8;">
                  <tr>
                    <td style="padding:14px 16px; border-bottom:1px solid #f0d7d7; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#8f2f2f;">
                      Registration Details
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px 2px;">
                      <p style="margin:0 0 12px; font-size:14px; color:#4f1d1d;"><strong>Category:</strong> ${safeCategoryLabel}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 28px 6px; color:#4f1d1d;">
                <p style="margin:0 0 14px; font-size:14px; line-height:1.7;">
                  This may be due to incomplete or invalid registration details or payment records.
                  If you believe this was made in error, please contact our team.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 20px; color:#4f1d1d;">
                <p style="margin:0 0 6px; font-size:14px; line-height:1.6;">For assistance, message our official Facebook page:</p>
                <p style="margin:0;"><a href="https://www.facebook.com/123007249102256/" style="color:#a73535; font-weight:700; text-decoration:none;">facebook.com/123007249102256</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px; border-top:1px solid #f4e4e4; color:#7a2c2c;">
                <p style="margin:0; font-size:13px; line-height:1.6;">GAGAYAM TRAIL RUN 2026 Organizing Team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendAcceptanceEmail({
  to,
  shirtSize,
  categoryLabel = DEFAULT_CATEGORY_LABEL,
  registrationFee = DEFAULT_REGISTRATION_FEE,
  subject = DEFAULT_SUBJECT
}) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("Missing recipient email.");
  }

  if (!isAcceptanceEmailConfigured()) {
    throw new Error("Acceptance email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.");
  }

  const config = getEmailConfig();
  const transporter = getTransporter();
  const text = buildAcceptanceEmailBody({
    shirtSize,
    categoryLabel,
    registrationFee
  });
  const html = buildAcceptanceEmailHtml({
    shirtSize,
    categoryLabel,
    registrationFee
  });

  await transporter.sendMail({
    from: config.from,
    to: recipient,
    subject,
    text,
    html
  });
}

export async function sendRejectionEmail({
  to,
  categoryLabel = DEFAULT_CATEGORY_LABEL,
  subject = DEFAULT_REJECTION_SUBJECT
}) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("Missing recipient email.");
  }

  if (!isAcceptanceEmailConfigured()) {
    throw new Error("Rejection email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.");
  }

  const config = getEmailConfig();
  const transporter = getTransporter();
  const text = buildRejectionEmailBody({
    categoryLabel
  });
  const html = buildRejectionEmailHtml({
    categoryLabel
  });

  await transporter.sendMail({
    from: config.from,
    to: recipient,
    subject,
    text,
    html
  });
}
