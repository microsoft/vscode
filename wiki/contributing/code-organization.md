# Code Organization

Code consists a layered and modular `core` that can be extended using extensions. Extensions are run in a separate process refered to as the
`extension host.` Extensions are implemented by utilizing the [extension API](https://code.visualstudio.com/docs/extensions/overview).

# Layers

The `core` is partitioned into the following layers:
- `base`: Provides general utilities and user interface building blocks
- `platform`: Defines service injection support and the base services for Code
- `editor`: The "Monaco" editor is available as a separate downloadable component
- `languages`: For historical reasons, not all languages are implemented as extensions (yet) - as Code evolves we will migrate more languages to towards extensions
- `workbench`: Hosts the "Monaco" editor and provides the framework for "viewlets" like the Explorer, Status Bar, or Menu Bar, leveraging [Electron](http://electron.atom.io/) to implement the Code desktop application.

# Target Environments
The `core` of Code is fully implemented in [TypeScript](https://github.com/microsoft/typescript). Inside each layer the code is organized by the target runtime environment. This ensures that only the runtime specific APIs are used. In the code we distinguish between the following target environments:
- `common`: Source code that only requires basic JavaScript APIs and run in all the other target environments
- `browser`: Source code that requires the `browser` APIs like access to the DOM
  - may use code from: `common`
- `node`: Source code that requires [`nodejs`](https://nodejs.org) APIs
  - may use code from: `common`
- `electron-browser`: Source code that requires the [Electron renderer-process](https://github.com/atom/electron/tree/master/docs#modules-for-the-renderer-process-web-page) APIs
  - may use code from: `common`, `browser`, `node`
- `electron-main`: Source code that requires the [Electron main-process](https://github.com/atom/electron/tree/master/docs#modules-for-the-main-process) APIs
  - may use code from: `common`, `node`

# Dependency Injection

The code is organised around services of which most are defined in the `platform` layer. Services get to its clients via `constructor injection`.

A service definition is two parts: (1) the interface of a service, and (2) a service identifier - the latter is required because TypeScript doesn't use nominal but structural typing. A service identifier is a decoration (as proposed for ES7) and should have the same name as the service interface.

Declaring a service dependency happens by adding a corresponding decoration to a constructor argument. In the snippet below `@IModelService` is the service identifier decoration and `IModelService` is the (optional) type annotation for this argument.

```javascript
class Client {
  constructor(@IModelService modelService: IModelService) {
    // use modelService
  }
}
```

Use the instantiation service to create instances for service consumers, like so `instantiationService.createInstance(Client)`. Usually, this is done for you when being registered as a contribution, like a Viewlet or Language.