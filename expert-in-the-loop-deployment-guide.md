# Expert-in-the-Loop: Replit to AWS Lightsail Migration Guide

## Overview

This guide migrates the `expert-in-the-loop` app from Replit to AWS Lightsail, including:
- PostgreSQL database
- GitHub CLI for repo management
- Systemd service for auto-restart
- Nginx reverse proxy

**Repository:** https://github.com/trentleslie/expert-in-the-loop.git

---

## Phase 1: Create and Configure Lightsail Instance (Local Machine)

### 1.1 Verify AWS CLI is working

```bash
aws lightsail get-regions --query 'regions[*].name' --output table
```

### 1.2 Create the Lightsail instance

```bash
aws lightsail create-instances \
  --instance-names expert-in-the-loop \
  --availability-zone us-west-2a \
  --blueprint-id ubuntu_22_04 \
  --bundle-id small_3_0
```

### 1.3 Wait for instance to be running

```bash
# Check status (repeat until it returns "running", usually 1-2 minutes)
aws lightsail get-instance --instance-name expert-in-the-loop --query 'instance.state.name' --output text
```

### 1.4 Open required ports

```bash
# HTTP
aws lightsail open-instance-public-ports \
  --instance-name expert-in-the-loop \
  --port-info fromPort=80,toPort=80,protocol=tcp

# HTTPS
aws lightsail open-instance-public-ports \
  --instance-name expert-in-the-loop \
  --port-info fromPort=443,toPort=443,protocol=tcp

# App port (adjust if your app uses a different port)
aws lightsail open-instance-public-ports \
  --instance-name expert-in-the-loop \
  --port-info fromPort=8000,toPort=8000,protocol=tcp
```

### 1.5 Get SSH key and save it

```bash
# Download SSH key
aws lightsail download-default-key-pair \
  --output text \
  --query privateKeyBase64 | base64 --decode > ~/.ssh/lightsail-expert.pem

chmod 600 ~/.ssh/lightsail-expert.pem
```

### 1.6 Allocate and attach a static IP

```bash
aws lightsail allocate-static-ip --static-ip-name expert-in-the-loop-ip

aws lightsail attach-static-ip \
  --static-ip-name expert-in-the-loop-ip \
  --instance-name expert-in-the-loop
```

### 1.7 Get the static IP address

```bash
aws lightsail get-static-ip --static-ip-name expert-in-the-loop-ip \
  --query 'staticIp.ipAddress' --output text
```

**Save this IP address** — you'll use it for SSH and accessing the app.

### 1.8 SSH into the instance

```bash
ssh -i ~/.ssh/lightsail-expert.pem ubuntu@<STATIC_IP>
```

---

## Phase 2: Server Setup (On Lightsail Instance)

### 2.1 Update system and install essentials

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential
```

### 2.2 Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.3 Install GitHub CLI

```bash
type -p curl >/dev/null || sudo apt install curl -y
curl -fsSL https://cli.github.com/gh/gpg.key | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh -y
```

### 2.4 Authenticate with GitHub

```bash
gh auth login
```

Select these options:
- **GitHub.com**
- **HTTPS**
- **Login with a web browser**

You'll get a one-time code and URL. Open the URL on your local machine, paste the code, and authorize.

### 2.5 Clone the repository

```bash
cd ~
gh repo clone trentleslie/expert-in-the-loop
cd expert-in-the-loop
```

### 2.6 Identify the app stack

```bash
# Check what files exist to determine the framework
ls -la
cat requirements.txt 2>/dev/null || cat pyproject.toml 2>/dev/null || cat package.json 2>/dev/null
```

### 2.7 Install runtime dependencies

**If Python (requirements.txt or pyproject.toml exists):**

```bash
sudo apt install -y python3-pip python3-venv python3-dev libpq-dev

cd ~/expert-in-the-loop
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip

# If requirements.txt exists:
pip install -r requirements.txt

# If pyproject.toml with poetry:
pip install poetry
poetry install

# If pyproject.toml without poetry:
pip install .
```

**If Node.js (package.json exists):**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

cd ~/expert-in-the-loop
npm install
```

---

## Phase 3: PostgreSQL Database Setup (On Lightsail Instance)

### 3.1 Create database and user

```bash
sudo -u postgres psql
```

In the PostgreSQL prompt, run:

```sql
CREATE USER expertuser WITH PASSWORD 'your-secure-password-here';
CREATE DATABASE expertloop OWNER expertuser;
GRANT ALL PRIVILEGES ON DATABASE expertloop TO expertuser;
\q
```

**Important:** Replace `your-secure-password-here` with an actual secure password and save it.

### 3.2 Configure PostgreSQL for password authentication

```bash
# Find and edit pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Find the line:
```
local   all             all                                     peer
```

Change `peer` to `md5`:
```
local   all             all                                     md5
```

Save and exit (Ctrl+X, Y, Enter).

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### 3.3 Test the database connection

```bash
psql -U expertuser -d expertloop -h localhost
# Enter password when prompted
# Type \q to exit
```

---

## Phase 4: Import Data from Replit

### 4.1 Export from Replit

In the **Replit shell**, run:

```bash
pg_dump $DATABASE_URL -F c -f backup.dump
```

Then download `backup.dump` from Replit's file browser.

### 4.2 Transfer to Lightsail

From your **local machine**:

```bash
scp -i ~/.ssh/lightsail-expert.pem /path/to/backup.dump ubuntu@<STATIC_IP>:~/
```

### 4.3 Import on Lightsail

```bash
pg_restore -U expertuser -d expertloop -h localhost ~/backup.dump
# Enter password when prompted
```

If you get role errors, you may need:
```bash
pg_restore -U expertuser -d expertloop -h localhost --no-owner --no-privileges ~/backup.dump
```

---

## Phase 5: Configure Environment and Run the App (On Lightsail Instance)

### 5.1 Create environment file

```bash
cd ~/expert-in-the-loop

cat > .env << 'EOF'
DATABASE_URL=postgresql://expertuser:your-secure-password-here@localhost:5432/expertloop
# Add other environment variables from Replit Secrets below:
# SECRET_KEY=xxx
# API_KEY=xxx
EOF
```

**Important:** 
- Replace `your-secure-password-here` with your actual database password
- Check Replit's **Secrets** tab and add all required variables

### 5.2 Run database migrations (if applicable)

```bash
source venv/bin/activate

# Flask-Migrate
flask db upgrade

# OR Django
python manage.py migrate

# OR Alembic
alembic upgrade head

# OR Prisma (Node.js)
npx prisma migrate deploy
```

### 5.3 Test the app

```bash
source venv/bin/activate

# Flask
flask run --host=0.0.0.0 --port=8000

# FastAPI
uvicorn main:app --host 0.0.0.0 --port 8000

# OR if app.py is the entrypoint
uvicorn app:app --host 0.0.0.0 --port 8000

# Django
python manage.py runserver 0.0.0.0:8000

# Node.js
npm start
```

Visit `http://<STATIC_IP>:8000` in your browser to verify it works.

Press Ctrl+C to stop the test server.

---

## Phase 6: Set Up Systemd Service (On Lightsail Instance)

### 6.1 Identify the correct entrypoint

Check these files to determine how to start the app:
```bash
cat Procfile 2>/dev/null
cat replit.toml 2>/dev/null
head -20 main.py 2>/dev/null || head -20 app.py 2>/dev/null
```

### 6.2 Create systemd service file

```bash
sudo nano /etc/systemd/system/expert-in-the-loop.service
```

**For FastAPI/Uvicorn (most common for Replit Python apps):**

```ini
[Unit]
Description=Expert in the Loop Web App
After=network.target postgresql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/expert-in-the-loop
Environment="PATH=/home/ubuntu/expert-in-the-loop/venv/bin"
EnvironmentFile=/home/ubuntu/expert-in-the-loop/.env
ExecStart=/home/ubuntu/expert-in-the-loop/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**For Flask:**

```ini
[Unit]
Description=Expert in the Loop Web App
After=network.target postgresql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/expert-in-the-loop
Environment="PATH=/home/ubuntu/expert-in-the-loop/venv/bin"
EnvironmentFile=/home/ubuntu/expert-in-the-loop/.env
ExecStart=/home/ubuntu/expert-in-the-loop/venv/bin/gunicorn --bind 0.0.0.0:8000 app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

(For Flask, also install gunicorn: `pip install gunicorn`)

**For Node.js:**

```ini
[Unit]
Description=Expert in the Loop Web App
After=network.target postgresql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/expert-in-the-loop
EnvironmentFile=/home/ubuntu/expert-in-the-loop/.env
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 6.3 Enable and start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable expert-in-the-loop
sudo systemctl start expert-in-the-loop
```

### 6.4 Check status and logs

```bash
# Check if running
sudo systemctl status expert-in-the-loop

# View logs (live)
sudo journalctl -u expert-in-the-loop -f

# View recent logs
sudo journalctl -u expert-in-the-loop --since "5 minutes ago"
```

---

## Phase 7: Set Up Nginx Reverse Proxy (On Lightsail Instance)

### 7.1 Install Nginx

```bash
sudo apt install -y nginx
```

### 7.2 Create Nginx configuration

```bash
sudo nano /etc/nginx/sites-available/expert-in-the-loop
```

Paste:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
```

### 7.3 Enable the site

```bash
sudo ln -s /etc/nginx/sites-available/expert-in-the-loop /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

The app is now accessible at: `http://<STATIC_IP>`

---

## Phase 8: Optional - Set Up SSL with Let's Encrypt

If you have a domain name pointed to your static IP:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Quick Reference Commands

### SSH Access
```bash
ssh -i ~/.ssh/lightsail-expert.pem ubuntu@<STATIC_IP>
```

### App Management
```bash
# Restart app
sudo systemctl restart expert-in-the-loop

# Stop app
sudo systemctl stop expert-in-the-loop

# Start app
sudo systemctl start expert-in-the-loop

# View status
sudo systemctl status expert-in-the-loop

# View logs (live)
sudo journalctl -u expert-in-the-loop -f
```

### Nginx Management
```bash
# Restart nginx
sudo systemctl restart nginx

# Test nginx config
sudo nginx -t

# View nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Database Access
```bash
psql -U expertuser -d expertloop -h localhost
```

### Update App from GitHub
```bash
cd ~/expert-in-the-loop
git pull
source venv/bin/activate
pip install -r requirements.txt  # if dependencies changed
sudo systemctl restart expert-in-the-loop
```

### Check What's Running
```bash
sudo lsof -i -P -n | grep LISTEN
```

---

## Troubleshooting

### App won't start
```bash
# Check logs for errors
sudo journalctl -u expert-in-the-loop --since "10 minutes ago"

# Try running manually to see errors
cd ~/expert-in-the-loop
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Database connection issues
```bash
# Test connection
psql -U expertuser -d expertloop -h localhost

# Check PostgreSQL is running
sudo systemctl status postgresql

# Check pg_hba.conf has md5 authentication
sudo cat /etc/postgresql/*/main/pg_hba.conf | grep -v "^#" | grep -v "^$"
```

### Port already in use
```bash
# Find what's using the port
sudo lsof -i :8000

# Kill if needed
sudo kill -9 <PID>
```

### Nginx 502 Bad Gateway
```bash
# App probably not running
sudo systemctl status expert-in-the-loop

# Check if app is listening on port 8000
curl http://localhost:8000
```

---

## Cost Estimate

| Resource | Monthly Cost |
|----------|-------------|
| Lightsail instance (small_3_0: 2GB RAM, 2 vCPU) | $10 |
| Static IP (attached to running instance) | Free |
| **Total** | ~$10/month |

This will be covered by your AWS credits.
