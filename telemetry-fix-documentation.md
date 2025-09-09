# Fix for Error Telemetry Issue

## Problem
The file `nesActivationStatusTelemetry.contribution.ts` was incorrectly using `publicLogError2` to send activation status telemetry events. This is inappropriate because:

1. **Error telemetry should only be used for actual errors/exceptions**
2. **Activation status is feature insight telemetry, not error telemetry**
3. **This causes events to be incorrectly classified as errors in telemetry systems**

## Solution
Changed the telemetry method from `publicLogError2` to `publicLog2` on line 38 of the file.

### Before (Incorrect):
```typescript
this.telemetryService.publicLogError2<NesActivationStatusEvent, NesActivationStatusClassification>('nesActivationStatus', {
    activated: true,
    timestamp: Date.now(),
    context: 'initialization'
});
```

### After (Correct):
```typescript
this.telemetryService.publicLog2<NesActivationStatusEvent, NesActivationStatusClassification>('nesActivationStatus', {
    activated: true,
    timestamp: Date.now(),
    context: 'initialization'
});
```

## Telemetry Guidelines

### When to use `publicLogError2`:
- Actual errors and exceptions
- Failed operations
- System failures
- Events with `CallstackOrException` classification

### When to use `publicLog2`:
- Feature usage tracking
- Activation/status events
- Performance measurements
- Events with `SystemMetaData` classification and `FeatureInsight` purpose

## GDPR Compliance
The telemetry event properly uses:
- `SystemMetaData` classification for GDPR compliance
- `FeatureInsight` purpose for feature usage tracking
- Appropriate `isMeasurement: true` for numeric metrics
- Clear comments explaining what each field contains

## Testing
A comprehensive test was added to ensure:
1. Regular telemetry is used (not error telemetry)
2. Correct event name and data structure
3. No error telemetry calls are made