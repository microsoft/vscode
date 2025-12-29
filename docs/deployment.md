# Deployment Guide

## Overview

This guide covers deploying Logos to production using Kubernetes and Helm, as well as local development with Docker Compose.

## Prerequisites

- Kubernetes 1.28+
- Helm 3.12+
- kubectl configured
- Docker (for local dev)
- Access to D3N, ARIA, PERSONA services

## Production Deployment

### 1. Create Namespace

```bash
kubectl create namespace logos
```

### 2. Create Secrets

```bash
kubectl create secret generic logos-secrets \
  --namespace logos \
  --from-literal=POSTGRES_PASSWORD=<password> \
  --from-literal=REDIS_PASSWORD=<password> \
  --from-literal=D3N_API_KEY=<key> \
  --from-literal=PERSONA_JWT_SECRET=<secret>
```

### 3. Install with Helm

```bash
helm install logos ./infrastructure/helm/logos \
  --namespace logos \
  --values values-production.yaml
```

### Production Values

```yaml
# values-production.yaml
global:
  imagePullSecrets:
    - name: registry-secret

web:
  replicaCount: 3
  resources:
    limits:
      cpu: 2000m
      memory: 4Gi
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20

chat:
  replicaCount: 5
  autoscaling:
    enabled: true
    minReplicas: 5
    maxReplicas: 50

completion:
  replicaCount: 10
  gpu:
    enabled: true
    type: nvidia-a100
  autoscaling:
    enabled: true
    minReplicas: 10
    maxReplicas: 100

d3n:
  apiEndpoint: "https://d3n.deepcreative.io"
  maxTier: 3

aria:
  conductorEndpoint: "https://aria.deepcreative.io"

persona:
  serviceEndpoint: "https://persona.deepcreative.io"
  pqcEnabled: true

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: logos.deepcreative.io
      paths:
        - path: /
          pathType: Prefix
          service: web
  tls:
    - secretName: logos-tls
      hosts:
        - logos.deepcreative.io

postgresql:
  enabled: false

externalPostgresql:
  host: logos-db.rds.amazonaws.com
  existingSecret: logos-secrets

monitoring:
  serviceMonitor:
    enabled: true
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n logos

# Check services
kubectl get svc -n logos

# View logs
kubectl logs -n logos -l app.kubernetes.io/component=web -f
```

## Local Development

### Docker Compose

```bash
cd infrastructure/docker
docker-compose up -d
```

### Services

| Service | URL |
|---------|-----|
| Web IDE | http://localhost:8080 |
| Chat API | http://localhost:8081 |
| Completion API | http://localhost:8082 |
| CA API | http://localhost:8083 |

### Environment

Create `.env`:

```bash
POSTGRES_PASSWORD=dev-password
REDIS_PASSWORD=dev-password
D3N_ENDPOINT=http://localhost:8080
D3N_API_KEY=dev-key
```

## GPU Configuration

### NVIDIA Support

```yaml
completion:
  gpu:
    enabled: true
    type: nvidia-tesla-t4
  resources:
    limits:
      nvidia.com/gpu: 1
```

Required:
- NVIDIA device plugin installed
- GPU node labels
- GPU tolerations

## Scaling

### HPA Configuration

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
```

### Manual Scaling

```bash
kubectl scale deployment logos-completion \
  --replicas=20 -n logos
```

## Upgrades

### Rolling Update

```bash
helm upgrade logos ./infrastructure/helm/logos \
  --namespace logos \
  --values values-production.yaml
```

### Rollback

```bash
helm rollback logos 1 -n logos
```

## Monitoring

### Prometheus Metrics

ServiceMonitor enabled:

```yaml
monitoring:
  serviceMonitor:
    enabled: true
    namespace: monitoring
```

### Key Metrics

- `logos_completion_latency_seconds`
- `logos_chat_messages_total`
- `logos_tier_usage_total`
- `logos_flash_app_cache_hit_rate`

### Grafana Dashboard

Import from `monitoring/grafana-dashboard.json`.

## Health Checks

| Service | Liveness | Readiness |
|---------|----------|-----------|
| Web | `/health` | `/ready` |
| Chat | `/health` | `/ready` |
| Completion | `/health` | `/ready` |

## Troubleshooting

### Pods Not Starting

```bash
kubectl describe pod <pod> -n logos
kubectl logs <pod> -n logos --previous
```

### Connection Refused

```bash
kubectl port-forward svc/logos-web 8080:8080 -n logos
```

### High Latency

1. Check pod resources
2. Verify GPU availability
3. Check D3N endpoint latency

