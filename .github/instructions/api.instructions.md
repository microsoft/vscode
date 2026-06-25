---
applyTo: 'src/vscode-dts/**/*.d.ts,src/vs/workbench/api/**/*.ts'
---

# VS Code API Development

> See also: [VS Code Extension API Guidelines](https://github.com/microsoft/vscode/wiki/Extension-API-guidelines)

<!-- TODO: Add more details about the API development process -->

## Adding a New Proposed API

When adding a new proposed API to VS Code, implement two main layers that communicate via RPC:

- **Extension Host API layer** (`extHost*.ts`): The implementation of the API that extensions call.
- **Renderer Process API counterparts** (`mainThread*.ts`): These run in the renderer process and are the counterparts to the `extHost` APIs. They interact with shared VS Code services.
- **Shared Services**: Central services that manage state and functionality, coordinating contributions from different `mainThread` instances.
- **Communication protocol** (`extHost.protocol.ts`): The RPC contract between the two layers.

The data flow is: **Extension code** → **Extension Host** → **Renderer Process counterpart** → **Shared VS Code services**.

### Define the API Shape

First, define the public shape of your API.

```typescript
// src/vscode-dts/vscode.proposed.yourFeatureName.d.ts
declare module 'vscode' {
    export interface YourNewInterface {
        readonly property: string;
        method(): Thenable<void>;
    }

    export namespace yourNamespace {
        export function yourMethod(): Thenable<void>;
    }
}
```

### Define the Communication Protocol

Next, define the RPC interface that allows the Extension Host and Main thread to communicate.

```typescript
// src/vs/workbench/api/common/extHost.protocol.ts

export interface ExtHostYourFeatureShape {
    $methodFromMain(args: any): Promise<void>;
}

export interface MainThreadYourFeatureShape extends IDisposable {
    $methodFromExtHost(args: any): Promise<void>;
}

// In MainContext object:
export const MainContext = {
    MainThreadYourFeature: createProxyIdentifier<MainThreadYourFeatureShape>('MainThreadYourFeature'),
};

// In ExtHostContext object:
export const ExtHostContext = {
    ExtHostYourFeature: createProxyIdentifier<ExtHostYourFeatureShape>('ExtHostYourFeature'),
};
```

**Key Requirements:**
- Methods that cross the process boundary (RPC calls) must be prefixed with `$` and return a `Promise` or `Thenable`.
- Complex objects are serialized when passed between processes, which means they lose their methods. You may need to create converters for them.

### Implement the Extension Host part

Create the Extension Host implementation of your API. This is the code that runs in the extension host process.

```typescript
// src/vs/workbench/api/common/extHostYourFeature.ts
export class ExtHostYourFeature implements ExtHostYourFeatureShape {
    private readonly _proxy: MainThreadYourFeatureShape;

    constructor(mainContext: IMainContext) {
        this._proxy = mainContext.getProxy(MainContext.MainThreadYourFeature);
    }

    async yourMethod(): Promise<void> {
        return this._proxy.$yourMainThreadMethod();
    }

    async $methodFromMain(args: any): Promise<void> {
        // Handle callbacks from the Main Process
    }
}
```

### Implement the Renderer Process counterpart

Create the implementation that performs the actual work in the Renderer process.

```typescript
// src/vs/workbench/api/browser/mainThreadYourFeature.ts
@extHostNamedCustomer(MainContext.MainThreadYourFeature)
export class MainThreadYourFeature implements MainThreadYourFeatureShape {
    private readonly _proxy: ExtHostYourFeatureShape;
    private readonly _disposables = new DisposableStore();

    constructor(extHostContext: IExtHostContext) {
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostYourFeature);
    }

    async $methodFromExtHost(args: any): Promise<void> {
        // Interact with VS Code services and UI
    }

    dispose(): void {
        this._disposables.dispose();
    }
}
```

### Expose the API to Extensions

Finally, wire up your API in `src/vs/workbench/api/common/extHost.api.impl.ts` so that extensions can call it.

Inside the `createApiFactoryAndRegisterActors` function, follow these steps:

**1. Instantiate your Extension Host API layer:**
```typescript
const extHostYourFeature = rpcProtocol.set(ExtHostContext.ExtHostYourFeature,
    new ExtHostYourFeature(rpcProtocol));
```

**2. Add your API to a namespace:**

This is where the proposal check occurs. Use `checkProposedApiEnabled(extension, 'yourFeatureName')` to ensure only enabled extensions can access the proposed API.

```typescript
const yourNamespace: typeof vscode.yourNamespace = {
    yourMethod(): Thenable<void> {
        checkProposedApiEnabled(extension, 'yourFeatureName');
        return extHostYourFeature.yourMethod();
    }
};
```


**3. Add the namespace to the `api` object that gets returned:**
```typescript
return <typeof vscode>{
    // ... existing API
    yourNamespace,
    // ... rest of API
};
```

#### API Object Pattern

For complex APIs, use the lazy initialization pattern to create an API object. This is used extensively in VS Code, for example in the notebook API.

```typescript
get apiObject(): vscode.YourApiInterface {
    if (!this._apiObject) {
        const that = this;
        this._apiObject = Object.freeze({
            get someProperty() { return that._someInternalProperty; },
            someMethod(param: string): Thenable<void> {
                return that.someMethod(param);
            }
        });
    }
    return this._apiObject;
}
```

#### Handling Custom Types

For complex objects that need to be passed between processes, define custom types and converters.
- **Types**: `src/vs/workbench/api/common/extHostTypes.ts`
- **Converters**: `src/vs/workbench/api/common/extHostTypeConverters.ts`
