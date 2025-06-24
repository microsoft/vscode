# CI/CD and DevOps for Autonomous Coding Agent

This guide describes the Continuous Integration/Continuous Deployment (CI/CD) pipeline, versioning system, environment variable management, containerization strategies (Docker), and management of staging versus production environments for the Autonomous Coding Agent platform (Node.js/Express backend, React frontend, PostgreSQL).

## Overview

A robust DevOps culture and CI/CD pipeline are essential for delivering the Autonomous Coding Agent platform reliably and efficiently. This involves:
*   **Continuous Integration (CI):** Automatically building, testing (unit, integration), and linting code changes frequently upon commits and pull requests.
*   **Continuous Deployment/Delivery (CD):** Automatically deploying validated changes to staging and (with potential manual approval) production environments.
*   **Infrastructure as Code (IaC):** Where applicable (e.g., if managing cloud resources beyond simple PaaS deployments), defining infrastructure through code.
*   **Monitoring and Logging:** Continuously monitoring application performance, errors, and health, and collecting structured logs for troubleshooting and auditing (leveraging the `TelemetryLogger` module and external tools).

## Version Control System (Git)

*   **Primary VCS:** Git.
*   **Repository Hosting:** GitHub (assumed for GitHub Actions examples).
*   **Branching Strategy:** A variation of **GitHub Flow** is recommended for its simplicity and suitability for continuous deployment:
    *   `main`: This branch always reflects production-ready code. Deployments to production are made from this branch (often via tagged releases).
    *   `feature/<descriptive-name>` (e.g., `feature/new-ai-model-connector`): Developers create feature branches from `main`. All work happens here.
    *   `fix/<issue-number-or-description>`: For bug fixes.
    *   **Pull Requests (PRs):** All changes to `main` must go through a PR from a feature or fix branch. PRs require:
        *   Code review(s) from other team members.
        *   All CI checks (linting, tests, build) to pass.
    *   **Releases:** Create Git tags (e.g., `v1.0.0`, `v1.0.1`) on the `main` branch to signify a release. CI/CD can be configured to deploy tagged commits to production.
*   **Commit Messages:** Adhere to **Conventional Commits** ([https://www.conventionalcommits.org/](https://www.conventionalcommits.org/)) for clear, automated changelog generation and semantic versioning.
    *   Examples: `feat(api): add endpoint for workflow creation`, `fix(agent): resolve issue with prompt templating`, `docs: update deployment guide`.

## CI/CD Pipeline (Using GitHub Actions as Example)

The CI/CD pipeline automates the build, test, and deployment process. We'll use GitHub Actions as the example CI/CD tool. Workflows are defined in YAML files in the `.github/workflows/` directory.

### Pipeline Stages (Typical Flow):

1.  **Trigger:**
    *   On push to any `feature/*` or `fix/*` branch.
    *   On Pull Request creation/update targeting `main`.
    *   On push to `main` (e.g., after merging a PR, or for direct hotfixes - though PRs are preferred).
    *   On creation of a Git tag matching `v*.*.*`.

2.  **CI Workflow (runs on PRs and pushes to feature/fix branches):**
    *   **Checkout Code:** `actions/checkout@v3`
    *   **Setup Node.js:** `actions/setup-node@v3` (with specified Node.js version, e.g., 18.x or 20.x, and caching for `npm` dependencies).
    *   **Install Dependencies:**
        *   `npm ci` (for both `/server` and `/client` if they have separate `package-lock.json`, or at root if monorepo).
    *   **Lint & Format Check:**
        *   Run ESLint: `npm run lint` (in `/server` and `/client`).
        *   Run Prettier check: `npm run format:check`.
    *   **Run Tests:**
        *   Backend (Node.js/Express - `/server`): `npm test` (executes unit and integration tests using Jest or similar). Requires a test database if integration tests hit it (can be spun up using services in GitHub Actions).
        *   Frontend (React - `/client`): `npm test` (executes unit/component tests using Jest/React Testing Library).
    *   **Build Application (Check):**
        *   Backend: `npm run build` (if using TypeScript or a build step).
        *   Frontend: `npm run build` (creates static assets).
    *   **(Optional) Security Scans:**
        *   Dependency vulnerability scan: `npm audit --audit-level=high`.
        *   Static Application Security Testing (SAST) tools (e.g., CodeQL integrated with GitHub).

3.  **CD Workflow - Build & Push Docker Images (runs on merge to `main` or tag creation):**
    *   All CI steps above are repeated or artifacts are passed.
    *   **Login to Container Registry:** (e.g., GitHub Container Registry (GHCR), Docker Hub, AWS ECR).
        ```yaml
        - name: Log in to GitHub Container Registry
          uses: docker/login-action@v2
          with:
            registry: ghcr.io
            username: ${{ github.actor }}
            password: ${{ secrets.GITHUB_TOKEN }}
        ```
    *   **Build and Push Backend Docker Image:** (using `server/Dockerfile`)
        ```yaml
        - name: Build and push backend image
          uses: docker/build-push-action@v4
          with:
            context: ./server # Path to backend Dockerfile directory
            file: ./server/Dockerfile
            push: true
            tags: ghcr.io/${{ github.repository_owner }}/agent-backend:${{ github.sha }} # Example tag
            # For releases: ghcr.io/${{ github.repository_owner }}/agent-backend:${{ github.ref_name }} (tag name)
        ```
    *   **Build and Push Frontend Docker Image:** (using `client/Dockerfile`, potentially serving static assets with Nginx)
        ```yaml
        - name: Build and push frontend image
          uses: docker/build-push-action@v4
          with:
            context: ./client # Path to client Dockerfile directory
            file: ./client/Dockerfile
            build-args: | # Pass build-time env vars for React app
              REACT_APP_API_BASE_URL=${{ secrets.PROD_API_BASE_URL }} # Example
            push: true
            tags: ghcr.io/${{ github.repository_owner }}/agent-frontend:${{ github.sha }}
        ```

4.  **CD Workflow - Deploy to Staging (runs on merge to `main` or a `staging` branch):**
    *   Uses deployment tools/scripts specific to the staging hosting environment (e.g., Railway, Render, Heroku CLI, `kubectl` for K8s, AWS Copilot/CDK/SAM).
    *   Injects staging-specific environment variables (from GitHub Secrets or environment secrets).
    *   **Run Database Migrations:** `npx prisma migrate deploy` (executed in the context of the deployed backend service or as a pre-deployment step).
    *   **(Optional) Run E2E Tests:** Against the staging environment.

5.  **CD Workflow - Deploy to Production (runs on Git tag `v*.*.*` or manual trigger/approval):**
    *   Similar to staging deployment but targets the production environment.
    *   Injects production environment variables.
    *   **Run Database Migrations:** `npx prisma migrate deploy`.
    *   Uses deployment strategies like Blue/Green or Rolling Updates if supported by the hosting platform to minimize downtime.
    *   **Post-Deployment:** Health checks, smoke tests.

## Environment Variables Management

Refer to the [Configuration Guide](./03-configuration-guide/README.md) for a detailed list of environment variables.
*   **Local Development:** `.env` files at the project root (and potentially within `/server` or `/client` if they have separate concerns, though a root `.env` is common with Docker Compose). Loaded by `dotenv` in Node.js.
*   **CI/CD (GitHub Actions):**
    *   Store secrets (API keys, `DATABASE_URL` for test DBs, registry passwords) in GitHub Repository Secrets (`Settings > Secrets and variables > Actions`).
    *   Store non-secret, environment-specific variables (like `STAGING_API_BASE_URL`) as GitHub Environment Variables or directly in workflow files if not sensitive.
*   **Staging/Production Hosting:**
    *   Use the hosting platform's environment variable/secret management system (e.g., Railway Environment Variables, Render Environment Groups, Heroku Config Vars, AWS Parameter Store/Secrets Manager, Kubernetes Secrets).
    *   **Never commit `.env` files with actual secrets to Git.**

## Containerization (Docker)

The platform uses Docker for consistent development and deployment environments.
*   **Backend Dockerfile (`server/Dockerfile`):** Optimized for Node.js/Express and Prisma. Uses multi-stage builds. (See [Deployment Guide](./04-deployment-guide/README.md) for an example).
*   **Frontend Dockerfile (`client/Dockerfile`):** Builds the React static assets and serves them using Nginx or a similar lightweight server. (See [Deployment Guide](./04-deployment-guide/README.md) for an example).
*   **`docker-compose.yml` (Project Root):** Defines services for local development (`server`, `client`, `db` for PostgreSQL). See [Getting Started Guide](./01-getting-started/README.md).
*   **Container Registry:** GitHub Container Registry (GHCR) is assumed in examples, but any major registry (Docker Hub, AWS ECR, Google GCR) can be used.

## Managing Staging vs. Production Environments

*   **Isolation:** Staging and production environments are completely separate (different databases, API keys for third-party services, potentially different cloud accounts or projects).
*   **Configuration:** Differences are managed entirely by environment variables injected at deployment time.
*   **Deployment Triggers:**
    *   **Staging:** Deployed automatically on merges to `main` (if `main` is treated as a staging/integration branch before tagging for production) or a dedicated `staging` branch.
    *   **Production:** Deployed from Git tags (`v*.*.*`) on the `main` branch, often with a manual approval step in the CI/CD workflow for critical releases.
*   **Data:** Staging PostgreSQL database uses seeded or sanitized data. Production PostgreSQL is regularly backed up.
*   **Third-Party Services:** Use sandbox/test accounts and API keys for third-party services (OpenAI, Anthropic, etc.) in staging.

## Infrastructure as Code (IaC) - (Optional/Future Consideration)

If the platform's infrastructure becomes more complex than what PaaS providers offer out-of-the-box (e.g., custom VPCs, multiple managed services on AWS/GCP/Azure, Kubernetes clusters):
*   **Tools:** Terraform, Pulumi, AWS CloudFormation, Google Cloud Deployment Manager.
*   **Benefits:** Infrastructure is version-controlled, repeatable, and changes can be automated and reviewed.
*   For the current hypothetical stack deploying to PaaS like Railway or Render, explicit IaC might be minimal as the platform handles much of the infrastructure.

## Monitoring, Logging, and Alerting

*   **Logging (Node.js Backend):**
    *   The `TelemetryLogger` module should output structured logs (JSON).
    *   In production, logs are typically ingested by the hosting provider's logging solution (e.g., Railway Log Explorer, Render Logs, CloudWatch Logs) or a dedicated logging service (e.g., Logtail, Datadog Logs).
*   **Monitoring (APM & Metrics):**
    *   Application Performance Monitoring (APM): Tools like Sentry (for error tracking and performance), Datadog APM, New Relic.
    *   Metrics: Track API endpoint latency, error rates, request volume, AI task processing times, database performance. Hosting platforms often provide basic metrics. Prometheus/Grafana can be used for more custom setups.
*   **Alerting:**
    *   Set up alerts for critical errors (e.g., via Sentry), high resource usage, API downtime, or significant spikes in AI task failures.
    *   Integrate alerts with Slack or PagerDuty.

This DevOps and CI/CD setup aims for developer efficiency, release reliability, and operational stability for the Autonomous Coding Agent platform.
