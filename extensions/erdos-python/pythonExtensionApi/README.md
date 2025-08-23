# Python extension's API

This npm module implements an API facade for the Python extension in VS Code.

## Example

First we need to define a `package.json` for the extension that wants to use the API:

```jsonc
{
	"name": "...",
	...
	// depend on the Python extension
	"extensionDependencies": [
		"ms-python.python"
	],
	// Depend on the Python extension facade npm module to get easier API access to the
	// core extension.
	"dependencies": {
		"@vscode/python-extension": "...",
		"@types/vscode": "..."
	},
}
```

Update `"@types/vscode"` to [a recent version](https://code.visualstudio.com/updates/) of VS Code, say `"^1.81.0"` for VS Code version `"1.81"`, in case there are any conflicts.

The actual source code to get the active environment to run some script could look like this:

```typescript
// Import the API
import { PythonExtension } from '@vscode/python-extension';

...

// Load the Python extension API
const pythonApi: PythonExtension = await PythonExtension.api();

// This will return something like /usr/bin/python
const environmentPath = pythonApi.environments.getActiveEnvironmentPath();

// `environmentPath.path` carries the value of the setting. Note that this path may point to a folder and not the
// python binary. Depends entirely on how the env was created.
// E.g., `conda create -n myenv python` ensures the env has a python binary
// `conda create -n myenv` does not include a python binary.
// Also, the path specified may not be valid, use the following to get complete details for this environment if
// need be.

const environment = await pythonApi.environments.resolveEnvironment(environmentPath);
if (environment) {
    // run your script here.
}
```

Check out [the wiki](https://aka.ms/pythonEnvironmentApi) for many more examples and usage.
