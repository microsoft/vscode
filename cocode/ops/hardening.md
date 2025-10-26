# CoCode Security Hardening

## Authentication

### OAuth Configuration

- **Never commit** OAuth secrets to git
- Use environment variables only
- Rotate secrets quarterly
- Enable 2FA on OAuth provider accounts

### Session Management

- **SESSION_SECRET:** Generate cryptographically random 64-char string
- **Cookie settings:**
  - `httpOnly: true` (prevent XSS)
  - `secure: true` (production only, requires HTTPS)
  - `sameSite: 'lax'` (CSRF protection)
  - Max age: 24 hours

## Network Isolation

### Docker Networks

All services communicate on internal `cocode` network. Only Gateway exposes port 8080.

### Firewall Rules

```bash
# Public-facing
ufw allow 80/tcp
ufw allow 443/tcp

# Block internal services
ufw deny 3000/tcp  # OpenVSCode
ufw deny 1234/tcp  # Yjs-WS
ufw deny 7070/tcp  # Builder
```

## Resource Limits

### Builder Container

Prevent resource exhaustion:

```yaml
# docker-compose.yml
builder:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '0.5'
        memory: 512M
```

### Process Timeouts

- Compilation: 30 seconds max
- Execution: 30 seconds max
- Enforced in builder service (`TIMEOUT_MS`)

### Output Size Limits

- Max buffer: 1MB per job
- Prevents memory attacks via infinite output

## Workspace Isolation

### User Namespacing

Each user gets isolated workspace:

```
/workspaces/<user_id>/default/
```

Prevents cross-user file access.

### File Permissions

```bash
# Set restrictive permissions
chmod 700 /workspaces/*
chown -R openvscode:openvscode /workspaces/
```

## Code Execution Safety

### Builder Sandbox

- **No network access** by default
- **ulimit** constraints on CPU/memory
- **Isolated filesystem** (no access outside `/workspaces`)

### Disable Dangerous Operations

In builder container:

```dockerfile
# Remove package managers to prevent runtime installs
RUN apt-get remove -y apt apt-get

# Restrict sudo
RUN rm /usr/bin/sudo
```

## Telemetry & Data Collection

### Disabled Everywhere

- OpenVSCode: `--disable-telemetry`, `DISABLE_TELEMETRY=true`
- VS Code settings: `"telemetry.telemetryLevel": "off"`
- No analytics, no tracking

## HTTPS/TLS

### Production Deployment

Use Traefik with Let's Encrypt:

```yaml
# traefik.yml
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@yourdomain.com
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web
```

## Extension Security

### Marketplace Disabled

```json
// .vscode/settings.json
{
  "extensions.gallery.enabled": false,
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false
}
```

### Allowed Extensions Only

- Hardcoded list in `.vscode/extensions.json`
- Audit script: `scripts/audit-extensions.sh`
- Fail CI if unauthorized extensions found

## Input Validation

### API Endpoints

All endpoints validate:
- Language (`cpp`, `c`, `python` only)
- Workspace path (must be within `/workspaces/<user_id>/`)
- Command injection prevention (no shell interpolation)

### Path Traversal Prevention

```typescript
// Validate workspace path
if (!workspace.startsWith(`/workspaces/${userId}/`)) {
  throw new Error('Invalid workspace path');
}
```

## Logging & Monitoring

### Security Events

Log:
- Failed authentication attempts
- Unauthorized workspace access
- Resource limit violations
- Builder timeouts

### Log Rotation

```bash
# Configure Docker logging
# docker-compose.yml
services:
  gateway:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Regular Updates

### Dependencies

```bash
# Update npm packages
npm audit fix

# Update Docker base images
docker pull ghcr.io/gitpod-io/openvscode-server:latest
docker pull ubuntu:24.04
docker pull node:20-alpine
```

### Security Scanning

```bash
# Scan Docker images
docker scan cocode_gateway
docker scan cocode_builder
```

## Incident Response

### Compromised Session

1. Revoke all sessions: Delete session store
2. Rotate `SESSION_SECRET`
3. Force re-authentication

### Malicious Code Execution

1. Kill builder container: `docker stop cocode_builder`
2. Inspect workspace: `/workspaces/<user_id>/`
3. Review logs: `docker logs cocode_builder`
4. Rebuild container with clean image

## Compliance

### Data Retention

- Workspaces: Persistent (user-managed)
- Sessions: 24 hours max
- Logs: 7 days rotation

### Privacy

- No user data collected beyond OAuth profile
- No tracking or analytics
- Workspace data never leaves server

## Checklist

- [ ] OAuth secrets in environment variables only
- [ ] `SESSION_SECRET` is cryptographically random
- [ ] Firewall blocks internal ports (3000, 1234, 7070)
- [ ] Builder resource limits configured
- [ ] HTTPS enabled (production)
- [ ] Extension marketplace disabled
- [ ] Telemetry disabled everywhere
- [ ] Regular security updates scheduled
- [ ] Log rotation configured
- [ ] Backup strategy implemented
