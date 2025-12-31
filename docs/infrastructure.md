# Logos Infrastructure Guide

This document describes the infrastructure setup and deployment for the Logos IDE.

## Overview

Logos is deployed on Kubernetes using Helm charts. The infrastructure includes:

- **Web Frontend** - React-based IDE interface
- **Chat Service** - WebSocket-based chat for Aria interactions
- **Completion Service** - D3N-powered code completion
- **CA Service** - Workspace Cognitive Architecture
- **PostgreSQL** - Persistent data storage
- **Redis** - Session cache and pub/sub

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐        │
│  │  logos-web  │  │ logos-chat  │  │ logos-completion │        │
│  │  (3 pods)   │  │  (3 pods)   │  │    (4 pods)      │        │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘        │
│         │                │                   │                  │
│         └────────┬───────┴───────────────────┘                  │
│                  │                                               │
│          ┌───────▼───────┐                                      │
│          │    Ingress    │                                      │
│          │ (nginx + TLS) │                                      │
│          └───────────────┘                                      │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │   PostgreSQL    │  │      Redis      │                       │
│  │ (StatefulSet)   │  │  (StatefulSet)  │                       │
│  └─────────────────┘  └─────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Storage Configuration

### Storage Classes

Logos uses custom storage classes for persistent volumes:

**`ssd-premium`** - High-performance SSD storage for databases

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ssd-premium
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

### Creating the Storage Class

The storage class is defined in Helm templates and created automatically during deployment:

```bash
# Verify storage class exists
kubectl get storageclass ssd-premium

# If missing, create manually
kubectl apply -f infrastructure/helm/logos/templates/storageclass.yaml
```

### Persistent Volume Claims

| Service    | PVC Name                    | Size   | Storage Class |
|------------|----------------------------|--------|---------------|
| PostgreSQL | data-logos-postgresql-0    | 200Gi  | ssd-premium   |
| Redis      | redis-data-logos-redis-*   | 50Gi   | ssd-premium   |

## Helm Deployment

### Prerequisites

1. Kubernetes cluster (EKS recommended)
2. Helm 3.x installed
3. kubectl configured
4. Required secrets created

### Creating Secrets

```bash
# Database credentials
kubectl create secret generic logos-db-credentials \
  --from-literal=password=<db-password> \
  --from-literal=postgres-password=<postgres-password> \
  -n logos

# Redis credentials
kubectl create secret generic logos-redis-credentials \
  --from-literal=redis-password=<redis-password> \
  -n logos

# TLS certificate (managed by cert-manager)
# Automatically provisioned by letsencrypt-prod ClusterIssuer
```

### Deployment

```bash
# Create namespace
kubectl create namespace logos

# Deploy with production values
helm upgrade --install logos infrastructure/helm/logos \
  -f infrastructure/helm/logos/values-production.yaml \
  -n logos

# Verify deployment
kubectl get pods -n logos
kubectl get pvc -n logos
kubectl get ingress -n logos
```

### Values Configuration

Key configuration in `values-production.yaml`:

```yaml
# Replica counts
web:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20

chat:
  replicaCount: 3

completion:
  replicaCount: 4
  gpu:
    enabled: true
    type: nvidia-a100

# Storage class
storageClass:
  create: true
  name: ssd-premium
  provisioner: ebs.csi.aws.com
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"

# Database
postgresql:
  primary:
    persistence:
      size: 200Gi
      storageClass: ssd-premium

# Redis
redis:
  master:
    persistence:
      size: 50Gi
      storageClass: ssd-premium
```

## Troubleshooting

### Pending PVCs

If PVCs are stuck in `Pending` state:

1. Check if storage class exists:
   ```bash
   kubectl get storageclass
   ```

2. Create missing storage class:
   ```bash
   kubectl apply -f - <<EOF
   apiVersion: storage.k8s.io/v1
   kind: StorageClass
   metadata:
     name: ssd-premium
   provisioner: ebs.csi.aws.com
   parameters:
     type: gp3
     iops: "3000"
     throughput: "125"
     encrypted: "true"
   reclaimPolicy: Delete
   volumeBindingMode: WaitForFirstConsumer
   allowVolumeExpansion: true
   EOF
   ```

3. Delete and recreate PVCs if needed:
   ```bash
   # Delete StatefulSet keeping pods
   kubectl delete statefulset logos-postgresql --cascade=orphan -n logos
   
   # Delete PVC
   kubectl delete pvc data-logos-postgresql-0 -n logos
   
   # Recreate StatefulSet
   helm upgrade logos infrastructure/helm/logos -n logos
   ```

### ImagePullBackOff

If pods are stuck in `ImagePullBackOff`:

1. Check image registry access:
   ```bash
   kubectl describe pod <pod-name> -n logos
   ```

2. Verify image pull secret:
   ```bash
   kubectl get secret regcred -n logos
   ```

3. Check network connectivity to registry

### Service Connectivity

Verify services are accessible:

```bash
# Port forward to test locally
kubectl port-forward svc/logos-web 8080:80 -n logos
kubectl port-forward svc/logos-chat 8081:80 -n logos

# Check service endpoints
kubectl get endpoints -n logos
```

## Monitoring

### Prometheus ServiceMonitor

Logos exposes metrics for Prometheus scraping:

```yaml
monitoring:
  serviceMonitor:
    enabled: true
    namespace: monitoring
    interval: 15s
```

### Key Metrics

- `logos_chat_messages_total` - Total chat messages processed
- `logos_completion_requests_total` - Completion API requests
- `logos_mode_switches_total` - Aria mode switches
- `logos_tool_invocations_total` - Tool invocations by category

### Grafana Dashboards

Pre-built dashboards are available in `monitoring/dashboards/`:

- Logos Overview
- Chat Performance
- Completion Latency
- Mode Usage Analytics

## Scaling

### Horizontal Pod Autoscaler

HPA is enabled for all services:

```bash
kubectl get hpa -n logos
```

### Manual Scaling

```bash
# Scale replicas
kubectl scale deployment logos-web --replicas=5 -n logos
```

### GPU Nodes

For completion service, ensure GPU nodes are available:

```bash
kubectl get nodes -l nvidia.com/gpu=true
```

## Backup and Recovery

### PostgreSQL Backup

```bash
# Create backup
kubectl exec logos-postgresql-0 -n logos -- \
  pg_dump -U logos logos > backup.sql

# Restore
kubectl exec -i logos-postgresql-0 -n logos -- \
  psql -U logos logos < backup.sql
```

### Redis Backup

Redis persistence is enabled by default. Manual snapshot:

```bash
kubectl exec logos-redis-master-0 -n logos -- redis-cli BGSAVE
```

## External Services

### D3N Integration

```yaml
d3n:
  apiEndpoint: "https://d3n.bravozero.ai"
  defaultTier: 2
  maxTier: 3
```

### ARIA Integration

```yaml
aria:
  conductorEndpoint: "https://aria.bravozero.ai"
  agentTimeoutMs: 45000
```

### PERSONA Integration

```yaml
persona:
  serviceEndpoint: "https://persona.bravozero.ai"
  pqcEnabled: true
  sessionTimeoutHours: 12
```

