const queue: Array<{ to: string; subject: string; body: string }> = [];
let processing = false;

export function sendEmail(to: string, subject: string, body: string) {
  queue.push({ to, subject, body });
  processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const msg = queue.shift()!;
    await deliver(msg.to, msg.subject, msg.body);
  }
  processing = false;
}

async function deliver(to: string, subject: string, body: string) {
  await new Promise((r) => setTimeout(r, 100));
  console.log(`[email] ${to}: ${subject}`);
}

export function getQueueLength() {
  return queue.length;
}

export function sendSMS(phone: string, message: string) {
  console.log(`[sms] ${phone}: ${message}`);
}
