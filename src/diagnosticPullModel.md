## Introduction

Diagnostics are currently the only data objects in the languages space that an extension pushed to VS Code. The reasoning behind that architecture is as follows:

- VS Code wants to encourage extensions to provide workspace diagnostics and not only single file diagnostics. In a workspace diagnostic model the extension (e.g. LSP server) can decide when it is a good time to compute the diagnostics and push them to the server.
- diagnostic can easily be stream since they can be delivered on a file by file basis

However the approach has also some downsides:

- the extension doesn't know which files to prioritize since VS Code has no API to query the visuals (e.g. which files are presented in tabs, ....).
- the extension doesn't know if the client is presenting the diagnostics at all (e.g. a corresponding status or problems view is visible).
- if a language is file based (e.g. all linters) then such an extension usually only validates the open files. But again the VS Code API doesn't allow to query if a file is visible hence extensions rely on the open / close events which fire when the content of a document is 'opened' which for example also happens when a workspace edit is applied or a hover preview is computed. In these cases extension shouldn't start computing diagnostics since their computation can be expensive.

## Pull Model

Instead of letting the server push diagnostics a client could pull them. Such a model would be analogous to the other language features which are usually pull also (for example semantic tokens). However a pull model has some drawbacks as well:

- how does a client decide when to pull for workspace diagnostics.
- project configuration changes might require to re-pull all diagnostics (e.g. file and workspace based)


## API Proposal

A diagnostic pull model should be align with the current API design. A possible API could look like this:


