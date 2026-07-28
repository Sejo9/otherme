/**
 * Prints a fresh VAPID keypair for web push.
 *
 *   npm run gen:vapid
 *
 * Paste the output into .env.local (and into your Vercel project settings).
 * Regenerating the keys invalidates every existing push subscription, so do it
 * once and keep them.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:you@example.com
`);
