# Configuration Guide

Proper configuration is essential for running the platform effectively in different environments. This guide details the configuration files, environment variables, and setup procedures for development, staging, and production environments.

## Overview

The platform's configuration is primarily managed through:
1.  **Environment Variables:** For sensitive data, environment-specific settings, and to comply with Twelve-Factor App principles.
2.  **Configuration Files:** For more complex or structured configuration that is less likely to change between deployment environments or contains non-sensitive defaults. [**Specify file formats, e.g., YAML, JSON, TOML, .js files**]

**Priority of Configuration Sources:**
1.  Environment Variables (highest priority, override file settings).
2.  Environment-Specific Configuration Files (e.g., `config.staging.json`).
3.  Default Configuration File (e.g., `config.default.json`).

## Environment Variables

Environment variables are the primary way to configure the application, especially for settings that vary across environments or are sensitive.

### Setting Up Environment Variables
*   **Local Development:** Typically managed via a `.env` file in the project root, loaded by a library like `dotenv` (for Node.js) or similar mechanisms in other languages. **This file should NOT be committed to version control.**
*   **Staging/Production:** Set directly in the deployment environment (e.g., through cloud provider dashboards, CI/CD pipeline variables, Docker environment flags, Kubernetes ConfigMaps/Secrets).

### Common Environment Variables

Below is a list of common environment variables used by the platform. Refer to the `.env.example` file in the root of the repository for a comprehensive template.

| Variable Name                  | Description                                                                 | Example (Local Dev)                 | Required (Dev/Stage/Prod) | Sensitive |
|--------------------------------|-----------------------------------------------------------------------------|-------------------------------------|---------------------------|-----------|
| `NODE_ENV`                     | Specifies the environment (development, test, production).                  | `development`                       | Yes                       | No        |
| `PORT`                         | The port on which the application server will listen.                       | `3000` (Frontend), `8080` (Backend) | Yes                       | No        |
| `API_BASE_URL`                 | Base URL for the backend API.                                               | `http://localhost:8080/api`         | Yes                       | No        |
| `FRONTEND_URL`                 | Base URL for the frontend application.                                      | `http://localhost:3000`             | Yes                       | No        |
| `DATABASE_URL`                 | Connection string for the primary database.                                 | `postgresql://user:pass@host:port/db` | Yes                       | Yes       |
| `REDIS_URL`                    | Connection string for Redis (if used for caching/sessions/queues).          | `redis://localhost:6379`            | If used                   | Yes       |
| `JWT_SECRET`                   | Secret key for signing and verifying JSON Web Tokens.                       | `a_very_strong_random_secret_key`   | Yes                       | Yes       |
| `JWT_EXPIRATION_TIME`          | Token expiration time (e.g., `1h`, `7d`).                                   | `1h`                                | Yes                       | No        |
| `LOG_LEVEL`                    | Logging verbosity (e.g., `debug`, `info`, `warn`, `error`).                 | `debug`                             | Yes                       | No        |
| `MAIL_HOST`                    | SMTP server host for sending emails.                                        | `smtp.example.com`                  | If email feature is used  | No        |
| `MAIL_PORT`                    | SMTP server port.                                                           | `587`                               | If email feature is used  | No        |
| `MAIL_USER`                    | SMTP username.                                                              | `user@example.com`                  | If email feature is used  | Yes       |
| `MAIL_PASSWORD`                | SMTP password.                                                              | `your_mail_password`                | If email feature is used  | Yes       |
| `MAIL_FROM_ADDRESS`            | Default "from" address for emails.                                          | `noreply@platform.com`              | If email feature is used  | No        |
| `S3_BUCKET_NAME`               | AWS S3 bucket name for file storage.                                        | `my-platform-uploads-dev`           | If S3 is used             | No        |
| `AWS_ACCESS_KEY_ID`            | AWS Access Key ID for S3 or other AWS services.                             | `YOUR_AWS_ACCESS_KEY`               | If AWS services are used  | Yes       |
| `AWS_SECRET_ACCESS_KEY`        | AWS Secret Access Key.                                                      | `YOUR_AWS_SECRET_KEY`               | If AWS services are used  | Yes       |
| `AWS_REGION`                   | AWS region for services.                                                    | `us-east-1`                         | If AWS services are used  | No        |
| `GOOGLE_CLIENT_ID`             | Google OAuth Client ID.                                                     | `your-google-client-id.apps.googleusercontent.com` | If Google OAuth is used | Yes       |
| `GOOGLE_CLIENT_SECRET`         | Google OAuth Client Secret.                                                 | `YOUR_GOOGLE_CLIENT_SECRET`         | If Google OAuth is used | Yes       |
| `OPENAI_API_KEY`               | API Key for OpenAI services.                                                | `sk-YOUR_OPENAI_KEY`                | If OpenAI is used         | Yes       |
| `MAPBOX_ACCESS_TOKEN`          | Access token for Mapbox services.                                           | `pk.YOUR_MAPBOX_TOKEN`              | If Mapbox is used         | Yes       |
| `[OTHER_SERVICE_API_KEY]`    | [API key for another integrated service]                                    |                                     | If service is used        | Yes       |

**Note:** Always generate strong, unique secrets for sensitive variables like `JWT_SECRET`, API keys, and passwords for staging and production environments.

### `.env.example` File
A `.env.example` file should be present in the root of your project. This file serves as a template for the actual `.env` file.
```plaintext
# .env.example

# Application Configuration
NODE_ENV=development
PORT=8080
API_BASE_URL=http://localhost:8080/api
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb_dev

# JWT Authentication
JWT_SECRET=your_jwt_secret_key_here # Change this in your .env file!
JWT_EXPIRATION_TIME=1h

# Redis (Optional)
# REDIS_URL=redis://localhost:6379

# Email Service (Example)
# MAIL_HOST=smtp.mailtrap.io
# MAIL_PORT=2525
# MAIL_USER=your_mailtrap_user
# MAIL_PASSWORD=your_mailtrap_password
# MAIL_FROM_ADDRESS=noreply@example.com

# Cloud Storage (Example AWS S3)
# S3_BUCKET_NAME=
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=

# Third-Party Services
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# OPENAI_API_KEY=
# MAPBOX_ACCESS_TOKEN=
```
To use it, copy this file to `.env` (`cp .env.example .env`) and then fill in the actual values. **Ensure `.env` is listed in your `.gitignore` file.**

## Configuration Files (Optional)

[**If your platform uses configuration files (e.g., for logging setup, feature flags, default settings not suitable for env vars), describe them here. If not, this section can be minimal or removed.**]

The platform may use configuration files for settings that are more complex or less likely to change between environments.

**Example: `config/app-config.json`**
```json
{
  "appName": "My Platform",
  "featureFlags": {
    "newDashboard": true,
    "betaAnalytics": false
  },
  "pagination": {
    "defaultPageSize": 20,
    "maxPageSize": 100
  },
  "logging": {
    "format": "json", // "text" or "json"
    "destinations": ["console", "file"],
    "filePath": "/var/log/app.log" // Note: Ensure write permissions
  }
}
```

*   **Location:** Typically in a `config/` directory.
*   **Loading:** The application loads these files at startup. Environment variables can override values from these files if the application logic supports it.
*   **Structure:** [**Describe the structure and purpose of each configuration file.**]

**Environment-Specific Configuration Files:**
You might have files like `config/app-config.development.json`, `config/app-config.staging.json`, and `config/app-config.production.json` that override or extend a base `config/app-config.default.json`. The application would load the appropriate file based on the `NODE_ENV` or a similar environment variable.

## Environment-Specific Setup

### 1. Development Environment
*   **Purpose:** Local development and testing by developers.
*   **Configuration:**
    *   Uses a `.env` file for environment variables.
    *   `NODE_ENV` set to `development`.
    *   `LOG_LEVEL` often set to `debug` for verbose output.
    *   Database typically a local instance or Docker container.
    *   Third-party services might use sandbox/test accounts or local mocks.
    *   Features like hot-reloading, detailed error messages are often enabled.
*   **Setup:**
    1.  Clone the repository.
    2.  Install dependencies (e.g., `npm install`).
    3.  Copy `.env.example` to `.env` and configure local settings (database, API keys for test accounts).
    4.  Set up the local database (run migrations, seed data).
    5.  Start the development server (e.g., `npm run dev`).

### 2. Staging Environment
*   **Purpose:** Pre-production testing, QA, demos. Should closely mirror production.
*   **Configuration:**
    *   `NODE_ENV` set to `staging` or `production` (depending on how staging is treated, often `production` for parity).
    *   Environment variables set directly in the hosting environment or CI/CD.
    *   Connects to a dedicated staging database (often a restored sanitized copy of production).
    *   Uses staging/sandbox accounts for third-party services.
    *   `LOG_LEVEL` typically `info` or `warn`.
    *   May have debugging tools or flags enabled that are off in production.
*   **Setup:**
    *   Typically deployed via a CI/CD pipeline.
    *   Environment variables are injected during deployment.
    *   Database migrations are run as part of the deployment process.

### 3. Production Environment
*   **Purpose:** Live application serving end-users.
*   **Configuration:**
    *   `NODE_ENV` set to `production`.
    *   All environment variables must be securely set in the hosting environment.
    *   Connects to the production database.
    *   Uses production accounts for all third-party services.
    *   `LOG_LEVEL` typically `warn` or `error` to reduce noise, with critical info logs.
    *   Performance optimizations enabled (e.g., code minification, caching, disabled verbose errors).
    *   Security hardening is critical (e.g., HTTPS enforcement, rate limiting, WAF).
*   **Setup:**
    *   Deployed via a well-tested CI/CD pipeline with approval gates.
    *   Robust monitoring, logging, and alerting are in place.
    *   Backup and disaster recovery plans are active.

## Validating Configuration
It's good practice to have a mechanism at application startup to validate critical configurations. This might involve:
*   Checking for the presence of essential environment variables.
*   Validating the format or type of certain variables (e.g., ensuring `PORT` is a number).
*   Attempting to connect to essential services like the database.
If validation fails, the application should log a clear error message and exit gracefully.

[**If your application has a specific script or command for validating configuration, mention it here.**]

This guide provides a comprehensive overview of configuring the platform. Always ensure that sensitive information is handled securely and never committed to version control. Refer to specific service integration guides for details on configuring API keys and other credentials for third-party tools.
