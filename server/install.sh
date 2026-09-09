#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-lambda.scenicrouteservers.com}"
APP=/opt/lambda-clock
REPO=https://github.com/caden4314/LambdaClock.git

command -v node >/dev/null || { echo 'Node.js 18+ is required'; exit 1; }
command -v git >/dev/null || { echo 'git is required'; exit 1; }
command -v nginx >/dev/null || { echo 'nginx is required'; exit 1; }

if [ -d "$APP/.git" ]; then
  sudo git -C "$APP" fetch --all --prune
  sudo git -C "$APP" checkout main
  sudo git -C "$APP" reset --hard origin/main
else
  sudo git clone "$REPO" "$APP"
fi

sudo tee /etc/systemd/system/lambda-backend.service >/dev/null <<EOF
[Unit]
Description=Pure Lambda Clock/Cube Evaluator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP
ExecStart=/usr/bin/node $APP/server/server.mjs
Restart=always
RestartSec=2
Environment=NODE_ENV=production
Environment=PORT=8789
User=www-data
Group=www-data
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo chown -R www-data:www-data "$APP"
sudo systemctl daemon-reload
sudo systemctl enable --now lambda-backend.service

sudo tee /etc/nginx/sites-available/lambda-backend >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8789;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        add_header Cache-Control no-cache always;
    }
}
EOF

sudo ln -sfn /etc/nginx/sites-available/lambda-backend /etc/nginx/sites-enabled/lambda-backend
sudo nginx -t
sudo systemctl reload nginx

echo
echo "Backend installed at http://$DOMAIN"
echo "Health: http://$DOMAIN/health"
echo "For GitHub Pages, enable HTTPS with your existing Cloudflare/Certbot setup before switching the frontend."
