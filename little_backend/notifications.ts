const emailQueue: Array<{ to: string; subj: string; body: string }> = [];
let emailProcessing = false;
const failedEmails: Array<{ to: string; subj: string; body: string; error: string }> = [];

export function sendMail(to: string, subj: string, body: string) {
  emailQueue.push({ to, subj, body });
  processEmails();
}

async function processEmails() {
  if (emailProcessing) return;
  emailProcessing = true;
  while (emailQueue.length > 0) {
    const msg = emailQueue.shift()!;
    try {
      await new Promise((r) => setTimeout(r, 100));
      console.log(`[email] ${msg.to}: ${msg.subj}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[email-error] ${msg.to}: ${msg.subj} — ${error}`);
      failedEmails.push({ ...msg, error });
    }
  }
  emailProcessing = false;
}

export function getFailedEmails() {
  return [...failedEmails];
}

export function retryFailedEmails() {
  const toRetry = failedEmails.splice(0);
  for (const { to, subj, body } of toRetry) {
    sendMail(to, subj, body);
  }
  return toRetry.length;
}

export function sendText(phone: string, msg: string) {
  console.log(`[sms] ${phone}: ${msg}`);
}

export function queueLen() {
  return emailQueue.length;
}