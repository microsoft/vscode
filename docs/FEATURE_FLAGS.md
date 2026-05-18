# Feature Flags Documentation

## Overview

This document describes the feature flag system used to control experimental and optional features in the application.

## Available Feature Flags

### `enableAICodeSuggestions`
- **Type:** Boolean
- **Default:** `false`
- **Description:** Enables AI-powered code suggestions and completions
- **Status:** Experimental

### `enableDebugVisualization`
- **Type:** Boolean
- **Default:** `true`
- **Description:** Enables advanced debugging visualizations including variable inspection and call stack visualization
- **Status:** Stable

### `enableCollaborativeEditing`
- **Type:** Boolean
- **Default:** `false`
- **Description:** Enables real-time collaborative editing features
- **Status:** Beta

### `enablePerformanceMonitoring`
- **Type:** Boolean
- **Default:** `true`
- **Description:** Enables performance monitoring and analytics collection
- **Status:** Stable

### `enableExperimentalTerminal`
- **Type:** Boolean
- **Default:** `false`
- **Description:** Enables experimental terminal features including enhanced shell integration
- **Status:** Experimental

### `maxLanguageServers`
- **Type:** Number
- **Default:** `5`
- **Description:** Maximum number of concurrent language servers that can run simultaneously
- **Status:** Stable

### `languageServerTimeout`
- **Type:** Number
- **Default:** `30000` (30 seconds)
- **Description:** Timeout in milliseconds for language server initialization
- **Status:** Stable

## Usage

### Basic Usage

```typescript
import { featureConfig } from './feature-config';

// Check if a feature is enabled
if (featureConfig.isFeatureEnabled('enableAICodeSuggestions')) {
    // Initialize AI code suggestions
}

// Get all feature flags
const flags = featureConfig.getFeatures();
console.log(flags);
```

### Updating Features

```typescript
// Update one or more features
featureConfig.updateFeatures({
    enableAICodeSuggestions: true,
    maxLanguageServers: 10
});
```

### Subscribing to Changes

```typescript
// Subscribe to feature flag changes
const unsubscribe = featureConfig.subscribe((flags) => {
    console.log('Feature flags updated:', flags);
});

// Later, unsubscribe
unsubscribe();
```

### Persistence

```typescript
// Save to storage
await featureConfig.saveToStorage(localStorage);

// Load from storage
await featureConfig.loadFromStorage(localStorage);
```

## Configuration Files

Feature flags can also be configured via JSON configuration files:

```json
{
    "features": {
        "enableAICodeSuggestions": true,
        "enableDebugVisualization": true,
        "maxLanguageServers": 8
    }
}
```

## Environment Variables

Some feature flags can be controlled via environment variables:

- `VSCODE_ENABLE_AI_SUGGESTIONS` - Controls `enableAICodeSuggestions`
- `VSCODE_MAX_LANGUAGE_SERVERS` - Controls `maxLanguageServers`
- `VSCODE_LANGUAGE_SERVER_TIMEOUT` - Controls `languageServerTimeout`

## Best Practices

1. **Always check feature flags before using experimental features**
2. **Use type-safe access methods** provided by the FeatureConfigManager
3. **Subscribe to changes** when features can be toggled at runtime
4. **Document new feature flags** in this file when adding them
5. **Test both enabled and disabled states** of features

## Testing

When testing features controlled by flags:

```typescript
import { FeatureConfigManager } from './feature-config';

// Create a test instance with custom flags
const testConfig = new FeatureConfigManager({
    enableAICodeSuggestions: true,
    enableDebugVisualization: false
});

// Use in tests
expect(testConfig.isFeatureEnabled('enableAICodeSuggestions')).toBe(true);
```

## Migration Guide

When promoting an experimental feature to stable:

1. Update the default value in `defaultFeatureFlags`
2. Update the status in this documentation
3. Remove any experimental warnings from the UI
4. Update related tests
5. Announce the change in release notes
