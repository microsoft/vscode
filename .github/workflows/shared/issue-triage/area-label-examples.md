# Area Label Examples

<example number=1 url="https://github.com/microsoft/vscode/issues/177502">
Title: Extensions shall get values for machine scoped settings depending on where they run
Body: Trying to fix https://github.com/microsoft/vscode-remote-release/issues/8209, I made a change that tries to `vscode.workspace.getConfiguration('http').get('proxy')`. In spite of this being defined in my user settings, at the time the remote resolver is called, this is undefined.

https://github.com/microsoft/vscode-remote-tunnels/pull/613/files#diff-ef041b2eec6b0e8d50d717fa94a4ce49cc1efd6aea240e8058d2e8282c65d571R50
Labels Applied: config, network, remote
Reasoning:
- config: The issue is about VS Code configuration and settings, specifically accessing machine-scoped settings through `vscode.workspace.getConfiguration()`.
- network: The issue involves the `http.proxy` setting, which is a network-related configuration.
- remote: The issue occurs in the context of remote resolvers and remote extensions, specifically mentioning vscode-remote-tunnels.
</example>

<example number=2 url="https://github.com/microsoft/vscode/issues/277537">
Title: Chat view: introduce session title and back button
Body: **Replace the "Chat" header in active sessions with the session title, matching how titles appear in chat history.** 

Showing the session title directly in the header helps users stay oriented across multiple types of chat sessions and reduces cognitive load by making each session identifiable at a glance. This mirrors how users already identify sessions in the chat sessions view, carrying that context into the active sessions.

| Current State      | Suggested State |
| ----------- | ----------- |
| <img width="440" height="155" alt="Image" src="https://github.com/user-attachments/assets/3f081409-4eac-4453-bfb3-5e4c2edcfdcf"/>      | <img width="481" height="378" alt="Image" src="https://github.com/user-attachments/assets/7513a22b-77c1-49a5-af19-8e5f3fc9887d"/>       |
Labels Applied: chat, chat-agents-view, ux
Reasoning:
- chat: The issue is about the chat view and chat sessions, focusing on how session titles are displayed.
- chat-agents-view: The issue specifically addresses the agents view UI and how chat sessions are presented in that context.
- ux: This is a user experience improvement request focused on improving navigation and session identification in the interface.
</example>

<example number=3 url="https://github.com/microsoft/vscode/issues/277524">
Title: Agent sessions UX/UI improvements
Body: Continuing: https://github.com/microsoft/vscode/issues/270465

Parent issue tracking the proposed changes required to support multi-agent workflows:

**High confidence, low(er) effort:**
✅ ~~Session titles: https://github.com/microsoft/vscode/issues/277537 (UXE)~~
Delegation menu: https://github.com/microsoft/vscode/issues/277555 (UXE)
Agent session default position: https://github.com/microsoft/vscode/issues/277558 (Eng)

**High confidence, high effort:**
Progress streaming: https://github.com/microsoft/vscode/issues/277560 (Eng)
Agent Session as Chat empty state: https://github.com/microsoft/vscode/issues/277563 (Eng)

**Low(er) confidence, requires more validation:**
Show new session inline after delegation: https://github.com/microsoft/vscode/issues/277568 (Eng)
Labels Applied: chat, chat-agents-view, ux
Reasoning:
- chat: The issue is about chat functionality and multi-agent workflows within the chat system.
- chat-agents-view: The issue is specifically focused on agent sessions and the agents view, tracking multiple improvements to that interface.
- ux: This is a parent issue tracking various UX/UI improvements for agent sessions, focusing on user experience enhancements.
</example>

<example number=4 url="https://github.com/microsoft/vscode/issues/281201">
Title: Enterprise configured MCP registry is not respected in codespaces
Body: Steps to Reproduce:

1. Open vscode repository in Codespaces Web
2. Open MCP Servers view

🐛 It is pointing to GH MCP registry, instead it should point to 1ES MCP registry configured by Enterprise
Labels Applied: chat-mcp-management
Reasoning:
- chat-mcp-management: This issue is specifically about browsing and managing MCP (Model Context Protocol) servers in VS Code, particularly regarding registry configuration. The issue describes a bug where the enterprise-configured MCP registry is not being respected in Codespaces, which falls directly under MCP server management.
</example>

<example number=5 url="https://github.com/microsoft/vscode/issues/280928">
Title: SCM - tags are not sorted correctly
Body: <img width="551" height="306" alt="Image" src="https://github.com/user-attachments/assets/1037e760-a9c1-4d9f-ad2d-89b15c7f9069"/>
Labels Applied: scm
Reasoning:
- scm: This issue is about the Source Control Management (SCM) system in VS Code, specifically reporting a bug with how tags are sorted in the SCM view. The issue is directly related to SCM functionality and UI presentation.
</example>
