# Configuration Guide

Proper configuration is essential for running the Autonomous Coding Agent platform effectively in different environments. This guide details the primary method of configuration using environment variables and outlines setup considerations for development, staging, and production.

## Overview

The platform's configuration is primarily managed through **Environment Variables**. This approach aligns with Twelve-Factor App principles, enhancing portability and security by keeping configuration separate from code. Sensitive data (like API keys and database credentials) and environment-specific settings are all handled this way.

While some complex, non-sensitive default configurations *could* be managed by configuration files (e.g., JSON, YAML), for a Node.js application like our hypothetical platform, environment variables loaded at runtime are the standard and preferred method.

**Priority of Configuration:**
1.  Environment Variables set in the deployment environment (highest priority).
2.  Values from a `.env` file (typically used for local development, loaded by tools like `dotenv`).

## Environment Variables

Environment variables are the sole source of truth for application configuration once deployed.

### Setting Up Environment Variables
*   **Local Development:**
    *   A `.env` file is used in the project root, created by copying `.env.example`.
    *   The Node.js backend (Express.js) will use a library like `dotenv` to load these variables into `process.env` when the application starts in development mode.
    *   **The `.env` file itself MUST NOT be committed to version control.** It should be listed in `.gitignore`.
*   **Staging & Production Environments:**
    *   Environment variables are set directly in the deployment environment. This method depends on the hosting provider or orchestration tool:
        *   **Cloud Platforms (e.g., Railway, Vercel, Render, AWS ECS/Beanstalk, Google Cloud Run):** Variables are set through the provider's dashboard or CLI tools.
        *   **Docker Containers:** Variables can be passed using the `-e` flag with `docker run`, or in the `environment` section of a `docker-compose.yml` file (though for production, it's better if the orchestration system injects them).
        *   **Kubernetes:** Variables are managed using `ConfigMaps` (for non-sensitive data) and `Secrets` (for sensitive data), which are then exposed to pods.
        *   **CI/CD Pipelines (e.g., GitHub Actions):** Secrets and environment-specific variables are stored in the CI/CD system and injected during the build or deployment process.

### `.env.example` File (Template for Local Development)

A `.env.example` file should be maintained in the root of the project. This file serves as a template, listing all necessary environment variables with placeholders or non-sensitive default values.

```plaintext
# .env.example - Autonomous Coding Agent Platform

# Application Environment
NODE_ENV=development # Typically 'development', 'staging', or 'production'
SERVER_PORT=8080     # Port for the backend Node.js/Express server
CLIENT_PORT=3000     # Port for the React frontend development server (if run separately)

# Frontend Configuration (passed during build or via runtime config endpoint)
# Example: If React app needs to know the API URL
# REACT_APP_API_BASE_URL=http://localhost:8080/api

# Database (PostgreSQL)
# For local Docker Compose setup (server connects to 'db' service on internal Docker network):
DATABASE_URL=postgresql://agent_user:your_strong_password@db:5432/agent_db
# For running server natively and connecting to local PostgreSQL:
# DATABASE_URL=postgresql://your_local_pg_user:your_local_pg_pass@localhost:5432/your_local_pg_db

# These are for Docker Compose's postgres service to initialize the DB
POSTGRES_USER=agent_user
POSTGRES_PASSWORD=your_strong_password # Ensure this matches DATABASE_URL password for Docker
POSTGRES_DB=agent_db

# JWT Authentication
JWT_SECRET=a_very_secure_random_string_for_jwt_please_change_me # IMPORTANT: Use a strong, unique key
JWT_REFRESH_SECRET=another_very_secure_random_string_for_refresh_tokens # IMPORTANT: Use a different strong key
JWT_ACCESS_TOKEN_EXPIRES_IN=15m # e.g., 15 minutes
JWT_REFRESH_TOKEN_EXPIRES_IN=7d  # e.g., 7 days

# Logging Configuration
LOG_LEVEL=debug # 'debug', 'info', 'warn', 'error'

# API Keys for AI Services (Provide your actual keys)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# HUGGINGFACE_API_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Redis (for caching or message queue if BullMQ/Redis Streams are used)
# REDIS_HOST=redis
# REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password (if any)
# REDIS_URL=redis://:your_redis_password@redis:6379/0 # If using URL format

# Optional: OAuth2 Integration (e.g., for GitHub login)
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GITHUB_CALLBACK_URL=http://localhost:8080/api/auth/github/callback

# CORS Configuration (Backend)
# Example: Allow frontend running on localhost:3000
CORS_ORIGIN=http://localhost:3000
```
**To use:** Copy `.env.example` to `.env` (`cp .env.example .env`) and populate it with actual values, especially secrets.

### Key Environment Variables Table

| Variable Name                   | Description                                                                    | Example (Local Dev)                                  | Scope (Backend/Frontend) | Sensitive |
|---------------------------------|--------------------------------------------------------------------------------|------------------------------------------------------|--------------------------|-----------|
| `NODE_ENV`                      | Application environment.                                                       | `development`                                        | Backend, Frontend (Build) | No        |
| `SERVER_PORT`                   | Port for the backend server.                                                   | `8080`                                               | Backend                  | No        |
| `CLIENT_PORT`                   | Port for the frontend dev server.                                              | `3000`                                               | Frontend (Dev)           | No        |
| `DATABASE_URL`                  | Connection string for PostgreSQL (Prisma uses this).                           | `postgresql://agent_user:pass@db:5432/agent_db`      | Backend                  | Yes       |
| `POSTGRES_USER`                 | Username for PostgreSQL Docker service initialization.                         | `agent_user`                                         | Docker (DB Init)         | No        |
| `POSTGRES_PASSWORD`             | Password for PostgreSQL Docker service initialization.                         | `your_strong_password`                               | Docker (DB Init)         | Yes       |
| `POSTGRES_DB`                   | Database name for PostgreSQL Docker service initialization.                    | `agent_db`                                           | Docker (DB Init)         | No        |
| `JWT_SECRET`                    | Secret key for signing JWT access tokens.                                      | `(generate_strong_random_string)`                    | Backend                  | Yes       |
| `JWT_REFRESH_SECRET`            | Secret key for signing JWT refresh tokens.                                     | `(generate_different_strong_random_string)`          | Backend                  | Yes       |
| `JWT_ACCESS_TOKEN_EXPIRES_IN`   | Expiration time for access tokens (e.g., `15m`, `1h`).                         | `15m`                                                | Backend                  | No        |
| `JWT_REFRESH_TOKEN_EXPIRES_IN`  | Expiration time for refresh tokens (e.g., `7d`, `30d`).                        | `7d`                                                 | Backend                  | No        |
| `LOG_LEVEL`                     | Logging verbosity (e.g., `debug`, `info`, `warn`, `error`).                    | `debug`                                              | Backend                  | No        |
| `CORS_ORIGIN`                   | Allowed origins for CORS (e.g., frontend URL).                                 | `http://localhost:3000`                              | Backend                  | No        |
| `OPENAI_API_KEY`                | API Key for OpenAI services.                                                   | `sk-xxxxxxxx`                                        | Backend                  | Yes       |
| `ANTHROPIC_API_KEY`             | API Key for Anthropic (Claude) services.                                       | `sk-ant-xxxxxxxx`                                    | Backend                  | Yes       |
| `HUGGINGFACE_API_TOKEN`         | API Token for Hugging Face services.                                           | `hf_xxxxxxxx`                                        | Backend                  | Yes       |
| `REDIS_URL`                     | Connection string for Redis (if used).                                         | `redis://redis:6379`                                 | Backend                  | Yes (if pass) |
| `GITHUB_CLIENT_ID`              | Client ID for GitHub OAuth integration (if used).                              | `(your_github_client_id)`                            | Backend                  | No        |
| `GITHUB_CLIENT_SECRET`          | Client Secret for GitHub OAuth integration (if used).                          | `(your_github_client_secret)`                        | Backend                  | Yes       |
| `GITHUB_CALLBACK_URL`           | Callback URL for GitHub OAuth integration.                                     | `http://localhost:8080/api/auth/github/callback`     | Backend                  | No        |
| `REACT_APP_API_BASE_URL`        | (Example for React) Base URL for the backend API, used by the frontend.        | `http://localhost:8080/api`                          | Frontend (Build/Runtime) | No        |

**Note:** For production, always use strong, unique, and randomly generated secrets. `JWT_SECRET` and `JWT_REFRESH_SECRET` must be different and kept highly confidential.

## Configuration Files (Minimal Use)

For this Node.js/Express.js and React based platform, explicit configuration files (e.g., `config.json`, `config.yaml`) are generally avoided in favor of environment variables for Twelve-Factor App compliance.

However, some tools used within the project might have their own configuration files that are version controlled:
*   **`package.json`:** Manages Node.js project dependencies and scripts.
*   **`babel.config.js`, `postcss.config.js`, `tailwind.config.js`:** Build-time configuration for JavaScript transpilation and CSS processing for the React frontend.
*   **`tsconfig.json`:** TypeScript compiler options (if using TypeScript).
*   **`eslintrc.js`, `.prettierrc.js`:** Configuration for linters and code formatters.
*   **`prisma/schema.prisma`:** Prisma ORM schema definition, which dictates database structure.
*   **`docker-compose.yml`:** Defines services, networks, and volumes for local Docker development.
*   **CI/CD configuration files:** (e.g., `.github/workflows/main.yml`).

These files define the *structure* and *build process* of the application rather than runtime environment-specific values.

## Environment-Specific Setup

### 1. Development Environment (`NODE_ENV=development`)
*   **Purpose:** Local development and testing by individual developers.
*   **Configuration:**
    *   Uses a `.env` file loaded by `dotenv` in the Node.js backend.
    *   `LOG_LEVEL` often set to `debug` for verbose output.
    *   Database typically runs in a Docker container managed by `docker-compose.yml`, with data persisted in Docker volumes.
    *   Third-party AI service API keys are real (developer keys or from a shared pool with low limits if possible), but usage should be mindful of costs. Mock servers for AI services can be considered for extensive testing without API costs.
    *   Frontend (React) usually runs with a hot-reloading development server (e.g., Vite or Create React App's dev server).
    *   Backend (Node.js/Express) might use tools like `nodemon` for automatic restarts on code changes.
*   **Key Settings:** More verbose logging, relaxed security settings (e.g., broader CORS for local dev tools), detailed error messages.

### 2. Staging Environment (`NODE_ENV=staging` or `production` with staging flags)
*   **Purpose:** Pre-production testing, QA, demos. Should mirror production as closely as possible.
*   **Configuration:**
    *   Environment variables are injected by the deployment system (e.g., CI/CD pipeline, cloud provider settings). **No `.env` files are deployed.**
    *   `LOG_LEVEL` typically `info` or `warn`.
    *   Connects to a dedicated staging database (e.g., a separate PostgreSQL instance, possibly a restored and sanitized copy of production data).
    *   Uses dedicated API keys for third-party AI services, separate from production keys (often with sandbox features or lower rate limits/costs if available from the provider).
*   **Key Settings:** Production-like optimizations, but might have some debugging tools or feature flags enabled that are off in production. Data is expendable.

### 3. Production Environment (`NODE_ENV=production`)
*   **Purpose:** Live application serving end-users.
*   **Configuration:**
    *   All environment variables are securely managed and injected by the deployment infrastructure.
    *   `LOG_LEVEL` typically `warn` or `error` to reduce noise, with critical info logs. Important transaction/audit logs should still be `info`.
    *   Connects to the production PostgreSQL database.
    *   Uses production API keys for all third-party AI services.
*   **Key Settings:** Full performance optimizations (e.g., code minification, compression, aggressive caching where appropriate), hardened security (strict CORS, rate limiting, HTTPS enforcement), less verbose error messages to clients (detailed errors logged internally).

## Validating Configuration

It's good practice for the backend application to validate critical configurations at startup.
*   **Prisma Client Generation:** Prisma generates its client based on `DATABASE_URL`. If incorrect, client generation or connection will fail early.
*   **Essential Variables Check:** The Node.js application can have a small startup script that checks for the presence and basic format of critical environment variables (e.g., `JWT_SECRET`, `OPENAI_API_KEY` if OpenAI is a core feature).
    ```javascript
    // Example in server startup (conceptual)
    // const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'OPENAI_API_KEY'];
    // for (const envVar of requiredEnvVars) {
    //   if (!process.env[envVar]) {
    //     console.error(`FATAL ERROR: Environment variable ${envVar} is not set.`);
    //     process.exit(1); // Exit if critical config is missing
    //   }
    // }
    ```
*   If validation fails, the application should log a clear error message and exit gracefully to prevent running in an unstable or insecure state.

This guide provides a comprehensive overview of configuring the Autonomous Coding Agent platform. Always prioritize security when managing sensitive information like API keys and database credentials.
