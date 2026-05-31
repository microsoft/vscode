## tool call s-test: Usage Guide

This folder contains the tool call simulation test (s-test) harness for running and debugging tool invocations in the VS Code Copilot repo.

---

### Example for input

Structure of the JSON:
```jsonc
{
	"name": "get_errors_1",
	"stateFile": "example.state.json",
	"toolArgs": {
		"tool": "get_errors",
		"args": { // This depends on the tool
			"filePaths": ["./src/extension.ts"]
		}
	}
}
```

---

## Running tool call s-test

You can run the tool call s-test from the terminal or from VS Code using launch configurations.

### 1. From VS Code: Debugging

You can debug the tool call s-test using the built-in launch configuration:

1. Open the Run & Debug panel in VS Code (`Ctrl+Shift+D`).
2. Select **"Run tool call s-test"** from the configuration dropdown.
3. Press **F5** to start debugging.


---

### 2. From the Terminal

Set the input and output JSON file paths as environment variables, then run the simulation:

```
run simulate -- --verbose -n=1 -p=1 --sidebar --scenario-test=toolcall.stest --external-scenarios ./toolcalls --output ./out
```

---

## Using tool call s-test to Launch Tools

The s-test harness can invoke any tool by specifying its name and arguments in `input.json`. For example:

```jsonc
{
  "tool": "read_file",
  "args": {
    "files": [
      { "filePath": "./test/testFile1.ts" }
    ]
  }
}
```

Supported tools include (but are not limited to):

- `get_errors`
- `read_file`


**Note:**

If your tool requires special argument processing (for example, mapping `files` to `filePaths`), you must also add a preprocessor for it in the `toolArgsPreprocessors` object in [`toolcall.stest.ts`](./toolcall.stest.ts).

If your tool does not need argument transformation, you can just specify its name and arguments in the `*.toolcall.json` file.

---

## Output

After running, the output JSON will contain the tool name, arguments, and result, or error information if the tool failed. Example:

```jsonc
{
  "toolName": "get_errors",
  "args": { ... },
  "result": { ... }
}
```

If an error occurs:

```jsonc
{
  "error": {
    "message": "...",
    "stack": "..."
  }
}
```

---

## Notes

- You can customize `*.toolcall.json` to test different tools and arguments.
- The s-test can be run repeatedly with different inputs and outputs.
- For more details, see the implementation in `toolcall.stest.ts`.