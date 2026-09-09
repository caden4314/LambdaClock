# VPS Lambda Backend

This service moves the expensive lambda evaluator off the browser and onto the VPS while keeping the computation authentic.

## What runs on the VPS

- The existing call-by-need cube evaluator from `lambda-core.js` / `lambda-machine.js`.
- A raw lambda clock evaluator that rebuilds from the current `America/Chicago` `HH:MM:SS` each second.
- Uncapped evaluator slices while at least one browser is connected.
- Server-Sent Events for lightweight browser updates.

## Stream design

`GET /events` sends two event types:

- `state` about 8 times/second: compact lambda wire geometry, evaluator stats, current clock text, and the last completed cube geometry.
- `raw` about once/second: raw De Bruijn control-term text plus real environment, stack, and thunk/value cell summaries.

This prevents the browser from rebuilding giant ASTs continuously while the VPS still runs the real evaluator as fast as it can.

`GET /health` returns a small JSON health snapshot.

## Deployment target

Recommended hostname: `lambda.scenicrouteservers.com`

Create an `A` record for `lambda` pointing to `85.239.247.116`. HTTPS is required for the GitHub Pages frontend. Use the existing Cloudflare SSL setup or run Certbot after DNS resolves.

## Install

From the VPS:

```bash
git clone https://github.com/caden4314/LambdaClock.git ~/LambdaClock || true
cd ~/LambdaClock
git pull --ff-only
sudo bash server/install.sh lambda.scenicrouteservers.com
```

Then verify:

```bash
systemctl status lambda-backend --no-pager
curl http://127.0.0.1:8789/health
curl http://lambda.scenicrouteservers.com/health
```

For a direct Certbot setup after DNS resolves:

```bash
sudo certbot --nginx -d lambda.scenicrouteservers.com
```

The frontend should only be switched to the VPS stream after `https://lambda.scenicrouteservers.com/health` works from the public internet.
