---
name: updateCopilotCLIToolMapping
description: Update the mapping of Copilot CLI tools from the source code for the CLI runtime
---

The constant `ToolFriendlyNameAndHandlers` in src/extension/chatSessions/copilotcli/common/copilotCLITools.ts
contains a mapping of known tools, and how the progress and output is displayed.
The type `ToolInfo` contains all of the tools and their corresponding arguments/return types.
All of this information has been derived from <copilot-agent-runtime repo>/src/tools/**

I would like you to update the `ToolFriendlyNameAndHandlers` mapping as well as `ToolInfo` and other related types based on any new/updated tools that are defined in the CLI runtime repo.

* You must create simple TypeScript interfaces as done today see `WebSearchTool` for the tool `web_search`
* You must have an entry in `ToolFriendlyNameAndHandlers` for the new tools
* You must add/update any of the related tests

At the end of all of your changes you must provide a summary
* List of updated tools and their friendly names
What are the updates to, did the arguments change, did the return type change, etc.
How does this impact what is displayed to the user
* List of new tools and their friendly names
How are the arguments and output displayed to the user


Finally, if the user hasn't already provided this, then you must ask for the folder path to the CLI runtime repo.
