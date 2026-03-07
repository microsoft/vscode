---
name: new-workbench-contribution
description: 'Create new workbench contributions for VS Code features. Use when registering lifecycle hooks, adding feature initialization, or wiring up services at startup. Covers registerWorkbenchContribution2, WorkbenchPhase selection, and .contribution.ts barrel files.'
---

# New Workbench Contribution

Workbench contributions are the primary mechanism for hooking features into the VS Code lifecycle. Getting the phase wrong can cause startup regressions or race conditions.

## When to Use

- Adding a new feature that needs initialization at startup
- Registering event listeners that should live for the app lifetime
- Wiring up services that need to run setup logic
- Adding UI that depends on workbench readiness

## Procedure

### Step 1: Choose the WorkbenchPhase

Select the latest possible phase that works. Earlier phases directly impact startup time.

| Phase | When | Use For |
|-------|------|--------|
| `BlockStartup` | Before anything renders | Critical: remote connection, workspace validation |
| `BlockRestore` | Before editors restore | Custom action view items, editor resolvers |
| `AfterRestored` | After editors are restored | **Default for most features**. UI contributions, view registrations |
| `Eventually` | When idle | **Preferred**. Telemetry, non-critical listeners, background work |

**Decision rule**: If the user won't notice a 2-second delay in your feature loading, use `Eventually`. If they'd see a flash of missing UI, use `AfterRestored`.

**Warning**: Two contributions at the same phase with different `typeId` values can race. The welcome page and getting started page — both at `AfterRestored` — require explicit mutual exclusion gating to avoid non-deterministic behavior.

### Step 2: Create the Contribution Class

```typescript
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

export class MyFeatureContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.myFeature';

	constructor(
		// Non-service args first (if any), then services
		@IMyService private readonly myService: IMyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();

		this._register(this.myService.onDidChange(() => {
			// React to changes
		}));
	}
}
```

**Critical**: Non-service constructor parameters MUST come before service parameters.

### Step 3: Register the Contribution

```typescript
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';

registerWorkbenchContribution2(
	MyFeatureContribution.ID,
	MyFeatureContribution,
	WorkbenchPhase.Eventually // Use the latest phase that works
);
```

### Step 4: Add to the Barrel File

Add the registration import to the appropriate `.contribution.ts` file for your feature area:

```typescript
// In myFeature.contribution.ts or the area's main contribution file
import './myFeatureContribution.js';
```

### Step 5: Gate AI Features

If the contribution is AI/chat-related, gate it properly:

```typescript
constructor(
	@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
) {
	super();

	// Runtime check — hide all UI
	if (this.chatEntitlementService.sentiment.hidden) {
		return;
	}
}
```

And gate any registered actions with `precondition: ChatContextKeys.enabled`.

### Step 6: Validate

1. Check the `VS Code - Build` task output for compilation errors
2. Run `npm run valid-layers-check` to ensure no layering violations
3. Verify the contribution loads at the expected time (add a `console.log` temporarily)

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Using `BlockStartup` for non-critical features | Slower startup | Move to `Eventually` or `AfterRestored` |
| Service args before non-service args | DI crash at runtime | Reorder constructor parameters |
| Missing `.contribution.ts` import | Feature never loads | Add import to barrel file |
| AI feature without `ChatContextKeys.enabled` gate | Shows when AI disabled | Add precondition and runtime check |
| Same phase race condition | Non-deterministic behavior | Add explicit ordering or phase separation |
