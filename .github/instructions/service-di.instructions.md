---
description: 'Use when creating, modifying, or injecting services via the VS Code dependency injection system. Covers createDecorator, registerSingleton, InstantiationType, constructor parameter ordering, and _serviceBrand.'
---

# Service & Dependency Injection Patterns

VS Code uses a custom dependency injection system based on parameter decorators. Getting the patterns wrong causes silent runtime crashes.

## Declaring a Service Interface

```typescript
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const IMyService = createDecorator<IMyService>('myService');

export interface IMyService {
	readonly _serviceBrand: undefined; // Required for type-checking
	doSomething(): Promise<void>;
	readonly onDidChange: Event<void>;
}
```

**`_serviceBrand: undefined`** is mandatory — TypeScript uses it to correctly type-check service decorators.

## Implementing a Service

```typescript
export class MyService extends Disposable implements IMyService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}
}
```

## Registering a Singleton

```typescript
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';

registerSingleton(IMyService, MyService, InstantiationType.Delayed);
```

| Type | When Instantiated | Use For |
|------|-------------------|--------|
| `InstantiationType.Delayed` | On first `accessor.get(IMyService)` call | **Default**. Most services. |
| `InstantiationType.Eager` | Immediately at startup | Services that must run setup logic early |

Prefer `Delayed` unless eager initialization is specifically required.

## Constructor Parameter Ordering

**Critical rule**: Non-service parameters MUST come before service parameters.

```typescript
// CORRECT — config first, then services
constructor(
	private readonly config: MyConfig,
	@ILogService private readonly logService: ILogService,
) { }

// WRONG — service before non-service → DI crash
constructor(
	@ILogService private readonly logService: ILogService,
	private readonly config: MyConfig, // ← DI will try to inject this as a service
) { }
```

## Consuming Services

In contributions and actions, use `ServicesAccessor`:

```typescript
override async run(accessor: ServicesAccessor): Promise<void> {
	const myService = accessor.get(IMyService);
	await myService.doSomething();
}
```

In classes instantiated via `IInstantiationService`, inject via constructor decorators.

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Non-service arg after service arg | Silent DI crash | Reorder: non-service args first |
| Missing `_serviceBrand: undefined` | TypeScript type errors | Add to interface |
| Using `Eager` unnecessarily | Slower startup | Switch to `Delayed` |
| Circular dependency in constructor | Stack overflow at instantiation | Break cycle with lazy resolution |
| Forgetting `registerSingleton` | Service not found error | Add registration call |
