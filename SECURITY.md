# Security Policy

## Principles

1. **Local-first by default**: Code never leaves your device unless you explicitly opt in to cloud features.
2. **No secrets logging**: Environment variables, API keys, and credentials are redacted from all logs and telemetry.
3. **Explicit consent**: Cloud sync, telemetry, and model API usage require user opt-in.
4. **Transparency**: All data flows documented; open-source allows audit.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email: `security@<pending-domain>` (placeholder until domain finalized)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Data Handling

### What stays local
- All source code by default
- File system access logs
- Local git history
- Diff previews
- Test results

### What requires opt-in
- Cloud model API calls (OpenAI, Anthropic, etc.)
- Anonymized usage telemetry
- Cloud project sync
- Shared contexts/snippets

### Never collected
- Secrets, API keys, environment variables
- PII without explicit user action
- Repository contents without cloud opt-in

## VS Code Foundation

Spark inherits the security practices of VS Code OSS. For VS Code-specific security info, see [Microsoft's Security Policy](https://aka.ms/SECURITY.md).
