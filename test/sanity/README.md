# VS Code Release Sanity Check Tests

## Overview

Automated end-to-end release sanity tests for published VS Code builds.
These tests verify critical functionality across different platforms and installation methods,
ensuring that published builds meet quality standards before reaching end users.

See [Sanity Check wiki page](https://github.com/microsoft/vscode/wiki/Sanity-Check) for more details on sanity testing.

## Usage

Many tests will use the underlying platform to install and verify basic VS Code functionality.
Such tests will need to be run on the corresponding target OS/virtual machine and will fail if ran outside.
Use -g or -f command-line options to filter tests to match the host platform.

### Command-Line Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--commit <commit>` | `-c` | The commit SHA to test (required) |
| `--quality <quality>` | `-q` | The quality to test (required, "stable", "insider" or "exploration") |
| `--no-cleanup` | | Do not cleanup downloaded files after each test |
| `--grep <pattern>` | `-g` | Only run tests matching the given regex pattern |
| `--fgrep <string>` | `-f` | Only run tests containing the given string |
| `--help` | `-h` | Show help message |

### Example

To run CLI tests for all platforms on given commit of Insiders build, from the root directory run:

```bash
npm run sanity-test -- --commit 19228f26df517fecbfda96c20956f7c521e072be --quality insider -g "cli*"
```

## References

The following public documentation pages provide details on end-user VS Code setup scenarios.

- [Setup Overview](https://code.visualstudio.com/docs/setup/setup-overview)
- [Linux Setup](https://code.visualstudio.com/docs/setup/linux)
- [macOS Setup](https://code.visualstudio.com/docs/setup/mac)
- [Windows Setup](https://code.visualstudio.com/docs/setup/windows)
- [Portable Mode](https://code.visualstudio.com/docs/editor/portable)
- [VS Code Server](https://code.visualstudio.com/docs/remote/vscode-server)
- [Developing in WSL](https://code.visualstudio.com/docs/remote/wsl)
