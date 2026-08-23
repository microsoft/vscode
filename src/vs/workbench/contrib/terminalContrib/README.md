_Terminal contribs_ are a way of splitting out standalone terminal features into their own components that build upon the main terminal code. The `terminalContrib/` folder can only import from `terminal/`, not the other way around. There are eslint rules to prevent this circular dependencies.

Having the entire feature and its tests in the same place makes not only the contrib easier to maintain and understand, but also the core terminal code as it's less interspersed with feature code. Sometimes it's not possible without bigger changes to make the feature totally standalone, in this case the goal is to get as close as possible.

This should not be confused with the similar `ITerminalContribution` which is a parallel to `IEditorContribution` and is used for decorating each individual terminal with additional functionality. An entry in `terminalContrib/` may use `ITerminalContribution`s to add its features.
