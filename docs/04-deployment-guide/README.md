# Deployment Guide

This guide provides instructions and best practices for deploying the Autonomous Coding Agent platform to various environments. It focuses on container-based deployments using Docker, managed by CI/CD pipelines, and considerations for cloud hosting.

## Prerequisites

Before deploying the platform, ensure you have:
*   A stable, tested version of the application from your Git repository (e.g., a release branch or tag like `v1.0.0`).
*   Access to the target deployment environment (e.g., cloud provider account, Kubernetes cluster, PaaS).
*   All necessary configuration values (environment variables, secrets) for the target environment. Refer to the [Configuration Guide](./03-configuration-guide/README.md).
*   Docker images for the frontend and backend services built and pushed to a container registry (this is typically handled by the CI/CD pipeline).

## General Deployment Strategy: Automated with CI/CD

The recommended approach for deploying to staging and production environments is through an automated CI/CD pipeline (e.g., using GitHub Actions). Manual deployments are error-prone and not suitable for production.

**Typical CI/CD Deployment Workflow (after build & test stages):**
1.  **Tag Release:** A Git tag (e.g., `v1.2.0`) is pushed, or code is merged to a deployment branch (e.g., `main` for production, `staging` for staging).
2.  **Build Docker Images:** The CI pipeline builds production-ready Docker images for the backend (Node.js/Express) and frontend (React app, often served by Nginx or a simple static server). (This step might have already occurred in an earlier CI stage).
3.  **Push Images to Registry:** Tagged Docker images are pushed to a container registry (e.g., Docker Hub, AWS ECR, Google GCR, GitHub Container Registry).
4.  **Prepare Environment Configuration:** Ensure all required environment variables and secrets are securely available to the target deployment environment.
5.  **Deploy to Target Environment:**
    *   The CI/CD pipeline triggers a deployment job.
    *   This job instructs the hosting environment (PaaS, Kubernetes, etc.) to pull the new Docker images and update the running services.
    *   Common deployment strategies like Rolling Updates, Blue/Green, or Canary might be used (see below).
6.  **Run Database Migrations:**
    *   Crucially, database migrations (e.g., using Prisma Migrate for our hypothetical stack) must be run *before* the new application code that depends on schema changes is fully live, or in a way that maintains compatibility.
    *   This is often a separate step in the deployment script or pipeline, executed against the target database.
    *   Example: `npx prisma migrate deploy` (run in the context of the backend service).
7.  **Health Checks & Smoke Tests:** After deployment, automated health checks and smoke tests verify that the application is running correctly.
8.  **Rollback Plan:** Have a documented (and preferably automated) way to roll back to the previous stable version if the deployment fails or introduces critical issues.

### Deployment Checklist
*   [ ] **Backup Database:** Crucial before deploying significant schema changes or data migrations, especially in production.
*   [ ] **Environment Variables:** Verify all required environment variables and secrets are correctly set in the target environment.
*   [ ] **Build & Push Images:** Ensure correctly tagged Docker images are available in the registry.
*   [ ] **Run Database Migrations:** Execute `npx prisma migrate deploy` (or equivalent) against the target database.
*   [ ] **Deploy Application Containers:** Update services to use the new Docker images.
*   [ ] **Service Restart/Rollout:** Ensure services restart gracefully (zero-downtime deployment strategies are preferred).
*   [ ] **Health Checks:** Perform automated health checks on critical endpoints.
*   [ ] **Monitor:** Closely monitor application logs, error rates, and performance metrics immediately after deployment.
*   [ ] **Rollback Readiness:** Be prepared to execute the rollback plan if needed.

## Containerization with Docker

Our hypothetical platform uses Docker for packaging the Node.js backend and React frontend.

### `Dockerfile` Examples

**1. Backend Dockerfile (Node.js/Express with Prisma):**
   Located at `server/Dockerfile` (assuming backend code is in a `/server` directory).
   ```dockerfile
   # Stage 1: Build dependencies and Prisma client
   FROM node:18-alpine AS builder
   WORKDIR /usr/src/app
   COPY server/package*.json ./
   # Install all dependencies including devDependencies for Prisma client generation
   RUN npm install
   COPY server/. ./
   # Generate Prisma Client based on your schema
   RUN npx prisma generate
   # Optional: If you have a build step for TypeScript -> JavaScript
   # RUN npm run build # This would output to a 'dist' folder

   # Stage 2: Production image
   FROM node:18-alpine
   WORKDIR /usr/src/app

   ENV NODE_ENV=production
   # Set PORT if your app listens to it, otherwise it's often set by the hosting platform
   # ENV PORT=8080

   # Copy only necessary production dependencies from builder stage
   COPY --from=builder /usr/src/app/node_modules ./node_modules
   # Copy Prisma client, schema, and migrations
   COPY --from=builder /usr/src/app/prisma ./prisma
   # Copy application code (e.g., built JS files or source if running directly)
   COPY --from=builder /usr/src/app/src ./src # If source is in src
   # Or if you have a build step:
   # COPY --from=builder /usr/src/app/dist ./dist
   COPY server/package.json . # For runtime reference if needed, or to run npm start

   EXPOSE 8080 # Expose the port the app runs on (should match SERVER_PORT env var)

   # Command to run the application
   # Ensure this script handles `prisma migrate deploy` or it's done before starting
   CMD [ "npm", "start" ] # Assuming 'start' script in package.json runs 'node src/index.js' or 'node dist/index.js'
   ```

**2. Frontend Dockerfile (React App served by Nginx):**
   Located at `client/Dockerfile` (assuming frontend code is in a `/client` directory).
   ```dockerfile
   # Stage 1: Build the React application
   FROM node:18-alpine AS builder
   WORKDIR /usr/src/app
   COPY client/package*.json ./
   RUN npm install
   COPY client/. ./
   # Pass API URL during build time (can also be configured at runtime via JS config file)
   ARG REACT_APP_API_BASE_URL
   ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}
   RUN npm run build # Outputs to /build folder by default for Create React App

   # Stage 2: Serve static files with Nginx
   FROM nginx:1.25-alpine
   # Copy built static files from the builder stage
   COPY --from=builder /usr/src/app/build /usr/share/nginx/html
   # Optional: Copy a custom Nginx configuration if needed (e.g., for client-side routing)
   # COPY client/nginx.conf /etc/nginx/conf.d/default.conf
   EXPOSE 80
   CMD ["nginx", "-g", "daemon off;"]
   ```
   *Note: For `client/nginx.conf`, you'd typically configure it to serve `index.html` for any path to support client-side routing.*

### `docker-compose.yml` (Primarily for Local Development)
The `docker-compose.yml` in the project root is mainly for local development. For deployments, you typically deploy individual service images to a PaaS or container orchestrator, not the entire Compose stack directly (though some simpler setups might).

### Building and Pushing Docker Images (CI/CD Responsibility)
1.  **Build:** The CI/CD pipeline will run `docker build` for each service.
    ```bash
    # In CI/CD pipeline script
    docker build -t your-registry/agent-backend:v1.2.0 -f server/Dockerfile .
    docker build --build-arg REACT_APP_API_BASE_URL=${STAGING_OR_PROD_API_URL} \
                 -t your-registry/agent-frontend:v1.2.0 -f client/Dockerfile .
    ```
2.  **Login to Registry:**
    ```bash
    echo "$REGISTRY_PASSWORD" | docker login your-registry.com -u "$REGISTRY_USERNAME" --password-stdin
    ```
3.  **Push:**
    ```bash
    docker push your-registry/agent-backend:v1.2.0
    docker push your-registry/agent-frontend:v1.2.0
    ```
    (Replace `your-registry`, image names, and tags as appropriate).

## Cloud Deployment Options

Our hypothetical stack is well-suited for various cloud deployment models:

1.  **Platform as a Service (PaaS) - Simplified Deployments:**
    *   **Services:** Railway, Render, Heroku (Docker deploys), AWS Elastic Beanstalk, Google App Engine (Flexible Environment).
    *   **Process:** Connect your Git repository or point to your Docker images in a registry. The PaaS handles infrastructure, scaling (often auto-scaling), load balancing, and deployments.
    *   **Pros:** Easiest to manage, fast time-to-market.
    *   **Considerations:** Configure environment variables, database connection strings (often uses managed DB services from the PaaS), and run migration commands as part of deployment scripts/hooks.

2.  **Containers as a Service (CaaS) / Orchestration - More Control & Scalability:**
    *   **Services:** AWS ECS (Elastic Container Service), Google Cloud Run, Azure Container Apps, or managed Kubernetes (AWS EKS, Google GKE, Azure AKS).
    *   **Process:**
        *   Define task/service definitions (for ECS, Cloud Run) or Kubernetes manifests (Deployments, Services, Ingress).
        *   Store these configurations in Git.
        *   CI/CD updates these definitions to point to new image versions and applies them to the cluster/service.
    *   **Pros:** Greater control over scaling, networking, and resource allocation. Kubernetes offers powerful orchestration.
    *   **Considerations:** Steeper learning curve, especially for Kubernetes. Requires managing cluster configurations or relying on managed services.

3.  **Managed Database:**
    *   Regardless of compute choice, use a managed PostgreSQL service (e.g., AWS RDS for PostgreSQL, Google Cloud SQL for PostgreSQL, Azure Database for PostgreSQL, or services provided by Railway/Render/Heroku). This handles backups, patching, and scaling for your database.

### General Cloud Deployment Considerations:
*   **IAM/Permissions:** Ensure your deployed services have the correct IAM roles/permissions to access other cloud resources (like managed databases, secret managers, AI service APIs if proxied through cloud infra).
*   **Networking:** Configure VPCs, subnets, security groups/firewalls, load balancers, and DNS correctly.
*   **Secrets Management:** Use dedicated secrets management services (AWS Secrets Manager, Google Secret Manager, Azure Key Vault) to store sensitive environment variables like database credentials and API keys, and inject them securely into your application containers.
*   **Logging & Monitoring:** Integrate with cloud-native logging (CloudWatch, Google Cloud Logging) and monitoring (CloudWatch Metrics, Google Cloud Monitoring, Prometheus/Grafana if self-managed) services.

## Zero-Downtime Deployments

Strategies to minimize or eliminate downtime during deployments:
*   **Rolling Updates:** (Default in Kubernetes, common in PaaS) Gradually replace old application instances/pods with new ones. The load balancer directs traffic only to healthy instances.
*   **Blue/Green Deployment:** Deploy the new version ("green") alongside the old version ("blue"). Once the green environment is tested and healthy, switch traffic (e.g., DNS or load balancer update) from blue to green. Easy rollback by switching back. Requires more infrastructure temporarily.
*   **Canary Releases:** Route a small percentage of traffic to the new version. Monitor closely. If stable, gradually increase traffic to the new version and phase out the old.

## Database Migrations (`prisma migrate deploy`)

*   **Critical Step:** Database schema changes using Prisma Migrate must be applied carefully.
*   **Timing:**
    *   For non-breaking changes (e.g., adding nullable columns, new tables): Can often be applied just before or during application deployment.
    *   For breaking changes (e.g., renaming/dropping columns, changing data types): Requires careful planning.
        1.  Make schema change backward compatible (e.g., add new column, keep old).
        2.  Deploy code that can work with both old and new schema (writes to both, reads from new preferring old if new is null).
        3.  Run data migration script to move data from old column to new.
        4.  Deploy code that only uses the new schema.
        5.  Run migration to drop the old column.
*   **Execution:**
    *   The `npx prisma migrate deploy` command is non-interactive and designed for production.
    *   Run this from a job in your CI/CD pipeline that has secure access to the target database, or from an init container/task in your deployment environment before the main application starts.
*   **Rollback:** Prisma Migrate does not automatically generate rollback scripts for `migrate deploy`. Database backups are your primary rollback mechanism for schema changes. Test migrations thoroughly in staging.

## Post-Deployment
*   **Health Checks:** Implement `/health` or similar HTTP endpoints in your backend service. Load balancers and orchestration systems use these to verify application health. A basic health check might just return `200 OK`. A deeper one might check database connectivity.
*   **Automated Smoke Tests:** After a deployment, run a small suite of automated tests that verify critical end-to-end functionalities.
*   **Monitoring:** Closely monitor application logs (for errors), error rates (e.g., Sentry, APM tools), performance metrics (CPU, memory, response times), and key business metrics.
*   **Alerting:** Set up alerts for critical errors, performance degradation, or security events.

This deployment guide provides a robust foundation for deploying the Autonomous Coding Agent. The specifics will depend on your chosen cloud provider and tools, but the principles of containerization, CI/CD automation, and careful migration management remain key.
