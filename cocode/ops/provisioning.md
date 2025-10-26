# CoCode Provisioning Guide

## Server Requirements

- **OS:** Ubuntu 22.04 LTS or later
- **CPU:** 2+ cores (4+ recommended for multiple concurrent users)
- **RAM:** 4GB minimum, 8GB+ recommended
- **Storage:** 20GB+ SSD
- **Network:** Public IP with ports 80, 443 open

## Installation Steps

### 1. Install Docker & Docker Compose

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
```

### 2. Clone CoCode Repository

```bash
git clone <repo-url> /opt/cocode
cd /opt/cocode
```

### 3. Configure OAuth

Edit `deploy/env`:

```bash
cp deploy/env.example deploy/env
nano deploy/env
```

Fill in:
- GitHub OAuth credentials
- Google OAuth credentials
- Generate a random `SESSION_SECRET` (64 characters)

### 4. Configure Domain (Optional)

For production deployments:

1. Point your domain to the server IP
2. Update `deploy/env`:
   ```
   CALLBACK_BASE_URL=https://yourdomain.com
   ```
3. Set up Traefik or nginx reverse proxy with SSL

### 5. Start Services

```bash
cd /opt/cocode/deploy
docker compose up -d
```

### 6. Verify

```bash
# Check all services are running
docker compose ps

# Check logs
docker compose logs -f
```

Access at `http://your-server-ip:8080/ide`

## Production Deployment

### Using Traefik (Recommended)

See `deploy/traefik.yml` for configuration.

1. Install Traefik
2. Configure SSL with Let's Encrypt
3. Route traffic through gateway

### Firewall Configuration

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to internal ports
sudo ufw deny 3000/tcp
sudo ufw deny 1234/tcp
sudo ufw deny 7070/tcp

sudo ufw enable
```

## Monitoring

### Health Checks

- Gateway: `http://localhost:8080/health`
- Builder: `http://localhost:7070/health` (internal)

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f gateway
```

## Backup & Recovery

### Backup Workspaces

```bash
# Backup
tar -czf cocode-workspaces-$(date +%F).tar.gz /opt/cocode/workspaces

# Restore
tar -xzf cocode-workspaces-YYYY-MM-DD.tar.gz -C /opt/cocode/
```

## Updates

```bash
cd /opt/cocode
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Troubleshooting

### Gateway won't start

- Check `deploy/env` has valid OAuth credentials
- Verify `SESSION_SECRET` is set

### OpenVSCode not loading

- Check workspace permissions: `chown -R 1000:1000 workspaces/`
- Check logs: `docker compose logs openvscode`

### Collaboration not working

- Verify Yjs-WS is running: `docker compose ps yjs-ws`
- Check WebSocket connection in browser dev tools

### Build/Run failures

- Ensure builder has workspace access
- Check resource limits: `docker stats cocode_builder`
