// early-list-notify — Netlify Function (site: incidentaxis)
//
// Triggered by the outgoing webhook on the "incidentaxis-early-list" form
// (event: submission_created). On each real signup it sends, via Resend,
// from marcel@firefighteradvocate.com:
//   1. a welcome email to the person who signed up
//   2. an alert email to Marcel
//
// Requires the RESEND_API_KEY environment variable on the site.
// The firefighteradvocate.com domain is verified in Resend (sending enabled).

const FROM = "Marcel Cafferata <marcel@firefighteradvocate.com>";
const ALERT_TO = "marcel@firefighteradvocate.com";
const FORM_ID = "6af87d7ce74cf2fd82d31f9e";
const FORM_NAME = "incidentaxis-early-list";

const WELCOME_SUBJECT = "You're on the IncidentAxis beta list";
const WELCOME_TEXT = `Hi,

Thanks for joining the IncidentAxis beta list. You're in.

I'm Marcel Cafferata, a California fire engineer with 25 years in the fire service. I built IncidentAxis so you can practice commanding an incident out loud, from the dispatch to the end of the call, in both Static and Dynamic scenarios, before the real call.

What happens next: I'll email you when your beta access is ready. It's free during the beta, and no card is needed.

Want to hear it now? The sample dispatch is on the site: https://incidentaxis.netlify.app

Questions or ideas? Just reply to this email. I read them.

Stay safe,
Marcel

To be removed from the list, reply "remove."`;

async function sendEmail(apiKey, { to, subject, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  const out = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${out.slice(0, 200)}`);
  return out;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // Netlify form webhooks nest the submitted fields under `data`;
  // accept the flatter shapes too so a payload change can't break this.
  const data = body.data || (body.payload && body.payload.data) || body || {};
  const formId = body.form_id || data.form_id || "";
  const formName = body.form_name || data.form_name || "";

  if (formId !== FORM_ID && formName !== FORM_NAME) {
    return new Response("ignored: not the early-list form", { status: 200 });
  }

  // Honeypot filled = bot. Accept quietly, send nothing.
  if (data["bot-field"]) {
    return new Response("ok", { status: 200 });
  }

  const email = String(data.email || "").trim();
  if (!email || !email.includes("@")) {
    return new Response("no signup email in payload", { status: 200 });
  }

  const apiKey =
    (typeof Netlify !== "undefined" && Netlify.env.get("RESEND_API_KEY")) ||
    process.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response("RESEND_API_KEY not set", { status: 500 });
  }

  const results = {};
  try {
    results.welcome = await sendEmail(apiKey, {
      to: email,
      subject: WELCOME_SUBJECT,
      text: WELCOME_TEXT,
    });
  } catch (e) {
    results.welcomeError = String(e.message || e);
  }
  try {
    results.alert = await sendEmail(apiKey, {
      to: ALERT_TO,
      subject: `New IncidentAxis early-list signup: ${email}`,
      text: `New signup on the IncidentAxis early list.\n\nEmail: ${email}\nSource: ${data.source || "(none)"}\nCampaign: ${data.campaign || "(none)"}\nTime: ${body.created_at || new Date().toISOString()}\n\nFull list: Netlify > Forms > incidentaxis-early-list.`,
    });
  } catch (e) {
    results.alertError = String(e.message || e);
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
