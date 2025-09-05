# Hello World Example

This directory contains a simple hello world example that demonstrates VS Code's Copilot instructions functionality.

## Files

- `hello-world.js` - A simple JavaScript file with hello world functionality
- `.github/copilot-instructions.md` - Copilot instructions specific to this example

## Purpose

This example shows how:
1. VS Code automatically loads copilot instructions from `.github/copilot-instructions.md`
2. These instructions provide context to AI coding assistants
3. The `ComputeAutomaticInstructions` class processes these files

## Running the Example

To run the hello world example:

```bash
node hello-world.js
```

Expected output:
```
Hello World!
Hello, VS Code Copilot!
This example demonstrates VS Code Copilot instructions functionality.
```

## Testing

This example is covered by the test case `hello world copilot-instructions` in the promptsService.test.ts file.