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
- `isMeasurement: true` - **Required** for every emitted `number` or `boolean`, including counts, durations, numeric schema or classifier versions, and flags. Telemetry serialization is runtime-type-driven: numbers and booleans are placed in `Measures` regardless of their classification metadata. If a categorical value must be a property, emit it as a bounded string instead.

Before completing a telemetry change, compare every event field's runtime type with its classification. Every `number` and `boolean` field must have `isMeasurement: true`; string fields must not. Do not rely on event-payload tests alone because they do not validate classification metadata.

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
- ❌ Missing `isMeasurement: true` on any emitted number or boolean, including numeric versions and boolean flags

**Privacy Requirements:**
- Minimize data collection to essential insights only
- Use hashes/categories instead of raw values when possible
- Document clear purpose for each data point

## Workbench Notification Telemetry

Generic workbench notifications use `notificationShown` and `notificationInteraction`. Both use the existing `ITelemetryService.publicLog2` consent and enterprise telemetry controls. Do not add another notification telemetry setting, policy, appender, or consent check.

### Assigning Safe Identity

The producer contract is in [notificationTelemetry.ts](../../src/vs/platform/notification/common/notificationTelemetry.ts); event construction and classifications are in [workbench notificationTelemetry.ts](../../src/vs/workbench/common/notificationTelemetry.ts).

- Add a code-defined, nonlocalized operation/notification type to `NotificationTelemetryId`. Keep it stable across instances, languages, message updates, and releases. Reuse an ID only for the same semantic operation. Pass it through `telemetry` on `notify()`, prompt options, or progress options:

  ```typescript
  progressService.withProgress({
      location: ProgressLocation.Notification,
      telemetry: NotificationTelemetryId.PluginRepositoryClone,
      title: localizedTitle,
      cancellable: true
  }, task, onCancel);
  ```

- `INotification.id` remains an equality/deduplication key, not a telemetry ID. Never derive telemetry identity from that key, content, titles, labels, paths, URLs, errors, remote progress tokens, command arguments, or hashes of those values.
- The shared helper accepts only allowlisted built-in IDs. Missing, invalid, or forged metadata becomes explicit `unknown` attribution; it is never recovered from the display source.
- Extension message/progress bridges issue opaque metadata using the extension-description identifier. Only those bridges should call `extensionNotificationTelemetry`. Valid identifiers are lowercased; missing/invalid identifiers become `unknown`. Copying a capability object does not copy its attribution.
- `extensionId` identifies the originating extension, not an extension mentioned, installed, profiled, or blamed in a core notification. Development-extension progress whose bridge omits the identifier remains unattributed. There is no public extension API change and no extension message/progress content or operation-title collection.
- For audited built-in actions, add a semantic `NotificationActionTelemetryId` and use prompt choice `telemetryId` or `withNotificationActionTelemetry`. Never use an arbitrary `IAction.id`. Unannotated actions still report their primary/secondary role with `actionId: 'unknown'`.
- The progress service annotates its explicit cancellation control automatically, including localized cancellation labels such as "Skip". Other custom progress buttons remain primary actions: neither their labels nor their callback outcomes establish cancellation semantics.

### Event Schema

Both events have the following fields. All are `SystemMetaData` / `FeatureInsight`, owned by `benibenj`.

| Field | Runtime type | Meaning |
| --- | --- | --- |
| `origin` | string | `core`, `extension`, or `unknown` |
| `notificationId` | string | Allowlisted built-in type, `extension.message`, `extension.progress`, or `unknown` |
| `extensionId` | string | Trusted `publisher.extension`, `none` for core, or `unknown` |
| `instanceId` | number, measurement | Renderer-local sequence; joins a logical notification's events within the existing telemetry session |
| `surface` | string | `toast`, `center`, `accessibleView`, or `unknown` |
| `severity` | string | `info`, `warning`, `error`, or `unknown` |
| `hasProgress` | boolean, measurement | Active progress at the time of this event, not whether the item ever had progress |
| `cancellable` | boolean, measurement | Active progress with an enabled, explicitly annotated primary cancellation control |

`notificationInteraction` additionally contains:

| Field | Runtime type | Meaning |
| --- | --- | --- |
| `interaction` | string | `primaryAction`, `secondaryAction`, `progressCancel`, `dismiss`, `clearAll`, `expand`, `collapse`, `copy`, `configure`, or `link` |
| `actionId` | string | Audited action semantic ID, or `unknown` |
| `actionRole` | string | `primary`, `secondary`, or `none` |
| `extensionButtonIndex` | number, measurement | Extension message button position (0-1000), or -1; **not** a semantic action such as sign-in |
| `timeSinceShownMs` | number, measurement | Monotonic elapsed time since the first actual exposure on any surface, or -1 if never exposed |

Numeric and boolean fields must retain `isMeasurement: true`; string fields must not acquire it. Unit tests check this relationship at type-check time, and the telemetry extractor must resolve both classifications, including inherited fields.

### Exposure, Interaction, and Deduplication Semantics

- **Exposure is not creation.** A shown event requires a rendered row intersecting the visible list/window viewport, or an opened/navigated accessible view. Silent/DND/optional notifications, never-show-again suppression, progress delays, measurement-only toast layout, off-screen center rows, hidden documents, and removal before the render frame do not by themselves produce exposure.
- A logical notification emits **once per surface**. Scrolling, updating, rerendering, hiding/re-showing, or repeating the same notification on that surface does not create another exposure. Toast-to-center or accessible-view presentation can add another surface exposure, with the same instance.
- Existing model equality is unchanged. Dedup replacement inherits correlation/exposure state only when normalized attribution matches. Different attribution does not inherit it. Closing an item and later creating it again starts a new instance; progress instances retain their existing non-deduplicating behavior.
- The sequence and exposure state live only in renderer memory/weak maps. Do not persist them or use the instance key as the notification's type or deduplication ID. Join with the existing `SessionId`, not across renderer sessions.
- Action telemetry reports **invocation, not success**. Buttons, primary dropdown choices, secondary menus, keyboard commands, accessible-view actions, links, and copy use the shared construction path. Wrappers and delegated toolbar commands must not produce two contextual interactions for one invocation.
- Only explicit progress cancellation is `progressCancel`. Automatic completion, failure, close, timeout, hiding a toast/center, and disposal are not cancellation or dismissal. Manual clear is `dismiss`; clear-all records one `clearAll` per removable item and leaves active progress alone. A keyboard/clear-all action may affect an unexposed item; its elapsed exposure time remains -1.
- Only an actual user-requested expansion state change is recorded. Layout-driven expansion/collapse and content updates are excluded.
- Interactions use the invoking control's surface where known, otherwise the last observed/invoking surface, or `unknown`. Returning from accessible view must not incorrectly attribute a center/toast button to accessible view. Surface context never fabricates a shown event.
- **Do not add `workbenchActionExecuted` counts to these interactions.** Legacy command telemetry is deliberately preserved, including its existing action IDs and wrappers. Use the contextual event for notification interaction analysis. Dedicated chat-input notifications and modal dialog events are separate and unchanged.
- Shown events are viewport observations, not proof that the user read or understood a notice. Gating changes, time-window boundaries, and transmission loss can leave interactions without a corresponding shown event.

### Initial Built-in Coverage and Remaining Unknowns

This is a partial migration of **35 built-in types**, not comprehensive built-in attribution. The enum is the authoritative list.

| Producer area | Migrated IDs |
| --- | --- |
| Forwarded agent-host progress | `agentHost.progress` |
| Internal authentication progress and continuation | `authentication.signIn`, `authentication.continue` |
| Extension activation, installation, VSIX download | `extensions.activation`, `extensions.install`, `extensions.downloadVsix`, `extensions.downloadVsix.complete`, `extensions.downloadVsix.error` |
| Extension enablement and restart | `extensions.disabled`, `extensions.dependencyLoop`, `extensions.autoRestart` |
| Extension-host health | `extensions.host.unresponsive`, `extensions.host.versionMismatch`, `extensions.host.crashRepeated`, `extensions.remoteHost.crashRepeated` |
| Remote reconnection | `remote.reconnect` |
| Agents-window remote connection and maintenance | `remoteAgentHost.ssh.connect`, `remoteAgentHost.ssh.connectError`, `remoteAgentHost.tunnel.connect`, `remoteAgentHost.tunnel.connectError`, `remoteAgentHost.tunnel.authenticationError`, `remoteAgentHost.wsl.connect`, `remoteAgentHost.wsl.connectError`, `remoteAgentHost.update`, `remoteAgentHost.reconnect` |
| Plugin operations | `plugins.packageOperation`, `plugins.update`, `plugins.repository.clone`, `plugins.repository.update`, `plugins.repository.repair` |
| Dictation model setup | `dictation.model.prepare`, `dictation.model.import` |
| File/save participants | `files.saveParticipants`, `files.workingCopySaveParticipants`, `files.operationParticipants` |

`agentHost.progress` identifies the forwarding UI, **not** a claimed download, provider, connection, or authentication operation: the host's arbitrary message/token does not establish an audited operation type.

Unannotated producers, including many generic `info`/`warn`/`error` calls and debug, profile, theme, notebook, localization, update, and other workbench notices, remain `origin: 'unknown'`. Their exposure/interactions still carry bounded mechanism, severity, and progress dimensions. Many ordinary action semantics also remain `unknown`. Extension progress is attributable to its extension, not to an operation inside that extension.

Status-bar-only progress (including chat setup progress that supplies a command), editor/view progress that never produces a notification, modal extension messages, and chat-input notices are deliberately outside these events. Nothing here retroactively identifies operations behind historical generic cancellation events.

### Focused Validation

Recorded implementation validation: **92 tests passed**, client compilation/type-check passed, changed-TypeScript ESLint passed without warnings, and module/type layer and cyclic-dependency checks passed. The test selection covers contracts, privacy, model/prompt/dedup behavior, actual toast/center viewport exposure (including arrivals into an initially empty center), dropdown/secondary/keyboard actions, accessibility, progress completion/cancellation/delay, extension bridges, and representative agent-host/SSH producers.

```bash
npm run transpile-client
./scripts/test.sh --reporter dot \
  --run src/vs/workbench/test/common/notifications.test.ts \
  --run src/vs/workbench/test/common/notificationTelemetry.test.ts \
  --run src/vs/workbench/test/browser/notificationsToasts.test.ts \
  --run src/vs/workbench/test/browser/notificationsList.test.ts \
  --run src/vs/workbench/test/browser/notificationAccessibleView.test.ts \
  --run src/vs/workbench/test/browser/notificationTelemetry.test.ts \
  --run src/vs/workbench/services/progress/test/browser/progressService.test.ts \
  --run src/vs/workbench/api/test/browser/mainThreadProgress.test.ts \
  --run src/vs/workbench/api/test/browser/extHostMessagerService.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/agentSessions/agentHostDownloadProgress.test.ts \
  --run src/vs/sessions/contrib/providers/remoteAgentHost/test/browser/remoteAgentHostActions.test.ts
npm run typecheck-client
npm run gulp compile-client
npm run valid-layers-check
npm run check-cyclic-dependencies
(git diff --name-only --diff-filter=ACM -z -- '*.ts'; git ls-files --others --exclude-standard -z -- '*.ts') | xargs -0 ./node_modules/.bin/eslint
```

The following scoped extractor check also passed, verifying the owner, exact event field sets, and every measurement flag in the actual extracted metadata. The extractor lowercases property keys.

```bash
node --input-type=commonjs <<'NODE'
const assert = require('node:assert/strict');
const path = require('node:path');
const { extractAndResolveDeclarations } = require('@vscode/telemetry-extractor');
(async () => {
 const { events } = await extractAndResolveDeclarations([{ sourceDirs: [path.resolve('src/vs/workbench/common')], excludedDirs: [], parserOptions: { eventPrefix: '', applyEndpoints: false, patchDebugEvents: false, lowerCaseEvents: false, silenceOutput: true, verbose: false } }]);
 for (const name of ['notificationShown', 'notificationInteraction']) {
  const event = events[name];
  assert.ok(event, `Missing extracted event: ${name}`);
  assert.equal(event.owner, 'benibenj');
  const measurements = name === 'notificationShown' ? ['instanceid', 'hasprogress', 'cancellable'] : ['instanceid', 'hasprogress', 'cancellable', 'extensionbuttonindex', 'timesinceshownms'];
  const properties = name === 'notificationShown' ? ['origin', 'notificationid', 'extensionid', 'surface', 'severity'] : ['origin', 'notificationid', 'extensionid', 'surface', 'severity', 'interaction', 'actionid', 'actionrole'];
  assert.deepEqual(Object.keys(event).filter(key => event[key] && typeof event[key] === 'object').sort(), [...measurements, ...properties].sort());
  for (const key of [...measurements, ...properties]) {
   assert.equal(event[key].classification, 'SystemMetaData', `${name}.${key}`);
   assert.equal(event[key].isMeasurement === true, measurements.includes(key), `${name}.${key}`);
  }
  console.log(`${name}: owner, exact field set and all measurement classifications verified`);
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
NODE
```

Validation limits: the initial standard-test dependency bootstrap encountered registry authentication `E401`; the subsequently available root dependencies, transpiler, and Electron runtime supported all successful checks above. No credentials/registry configuration were changed. Live extension-provider flows, minimized/occluded OS-window behavior, full integration/smoke suites, and telemetry backend ingestion were not exercised.

### Illustrative KQL (Not Deployed or Executed)

These new events are not present in the historical sample. This example uses the raw core-events table and expected lowercased property/measurement keys. Filter to a deployed application version before real comparisons. Existing `SessionId`, `TimeSinceSessionStart`, and `Sequence` support session-relative joining/ordering; the existing Agents-window boolean is in `Measures`.

```kql
database("VSCode").RawEventsVSCode
| where ServerUploadTimestamp > ago(7d)
| where EventName in~ ("monacoworkbench/notificationShown", "monacoworkbench/notificationInteraction")
// Optional Agents-window-only filter:
// | where todouble(Measures["common.isagentswindow"]) == 1
| extend
    Origin = tostring(Properties["origin"]),
    Notification = tostring(Properties["notificationid"]),
    Extension = tostring(Properties["extensionid"]),
    NotificationInstance = tolong(Measures["instanceid"]),
    Interaction = tostring(Properties["interaction"]),
    IsShown = EventName =~ "monacoworkbench/notificationShown"
| summarize
    SurfaceExposures = countif(IsShown),
    CancelInvocations = countif(Interaction == "progressCancel"),
    ActionInvocations = countif(Interaction in ("primaryAction", "secondaryAction")),
    DismissInvocations = countif(Interaction in ("dismiss", "clearAll"))
  by SessionId, NotificationInstance, Origin, Notification, Extension
| summarize
    ShownInstances = countif(SurfaceExposures > 0),
    SurfaceExposures = sum(SurfaceExposures),
    CancelInvocations = sum(CancelInvocations),
    ActionInvocations = sum(ActionInvocations),
    DismissInvocations = sum(DismissInvocations)
  by Origin, Notification, Extension
| order by CancelInvocations desc
| take 50
```

This intentionally separates unique shown instances from per-surface exposures and excludes legacy clicks. It counts cancellation **invocations**, not successful cancellation outcomes; it is not a cancellation-rate estimate across unmatched sessions/windows.
