---
description: Use when asked to work on telemetry events
---

Patterns for GDPR-compliant telemetry in VS Code with proper type safety and privacy protection.

## Implementation Pattern

### 1. Define Types
```typescript
type MyFeatureEvent = {
    action: string;
    duration: number;
    success: boolean;
    errorCode?: string;
};

type MyFeatureClassification = {
    action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action performed.' };
    duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds.' };
    success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether action succeeded.' };
    errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Error code if action failed.' };
    owner: 'yourGitHubUsername';
    comment: 'Tracks MyFeature usage and performance.';
};
```

### 2.1. Send Event
```typescript
this.telemetryService.publicLog2<MyFeatureEvent, MyFeatureClassification>('myFeatureAction', {
    action: 'buttonClick',
    duration: 150,
    success: true
});
```

### 2.2. Error Events
For error-specific telemetry with stack traces or error messages:
```typescript
type MyErrorEvent = {
    operation: string;
    errorMessage: string;
    duration?: number;
};

type MyErrorClassification = {
    operation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The operation that failed.' };
    errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error message.' };
    duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time until failure.' };
    owner: 'yourGitHubUsername';
    comment: 'Tracks MyFeature errors for reliability.';
};

this.telemetryService.publicLogError2<MyErrorEvent, MyErrorClassification>('myFeatureError', {
    operation: 'fileRead',
    errorMessage: error.message,
    duration: 1200
});
```

### 3. Service Injection
```typescript
constructor(
    @ITelemetryService private readonly telemetryService: ITelemetryService,
) { super(); }
```

## GDPR Classifications & Purposes

**Classifications (choose the most restrictive):**
- `SystemMetaData` - **Most common.** Non-personal system info, user preferences, feature usage, identifiers (extension IDs, language types, counts, durations, success flags)
- `CallstackOrException` - Error messages, stack traces, exception details. **Only for actual error information.**
- `PublicNonPersonalData` - Data already publicly available (rare)

**Purposes (combine with different classifications):**
- `FeatureInsight` - **Default.** Understanding how features are used, user behavior patterns, feature adoption
- `PerformanceAndHealth` - **For errors & performance.** Metrics, error rates, performance measurements, diagnostics

**Required Properties:**
- `comment` - Clear explanation of what the field contains and why it's collected
- `owner` - GitHub username (infer from branch or ask)
- `isMeasurement: true` - **Required** for all numeric values flags used in calculations

## Error Events

Use `publicLogError2` for errors with `CallstackOrException` classification:

```typescript
this.telemetryService.publicLogError2<ErrorEvent, ErrorClassification>('myFeatureError', {
	errorMessage: error.message,
	errorCode: 'MYFEATURE_001',
	context: 'initialization'
});
```

## Naming & Privacy Rules

**Naming Conventions:**
- Event names: `camelCase` with context (`extensionActivationError`, `chatMessageSent`)
- Property names: specific and descriptive (`agentId` not `id`, `durationMs` not `duration`)
- Common patterns: `success/hasError/isEnabled`, `sessionId/extensionId`, `type/kind/source`

**Critical Don'ts:**
- ❌ No PII (usernames, emails, file paths, content)
- ❌ Missing `owner` field in classification (infer from branch name or ask user)
- ❌ Vague comments ("user data" → "selected language identifier")
- ❌ Wrong classification
- ❌ Missing `isMeasurement` on numeric metrics

**Privacy Requirements:**
- Minimize data collection to essential insights only
- Use hashes/categories instead of raw values when possible
- Document clear purpose for each data point
