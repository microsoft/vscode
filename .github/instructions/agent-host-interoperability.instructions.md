---
description: Keep Agent Host Protocol clients interoperable with non-VS Code hosts.
applyTo: "src/vs/platform/agentHost/**,src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/**,src/vs/workbench/contrib/chat/browser/remoteAgentHost/**,src/vs/sessions/contrib/providers/agentHost/**,src/vs/sessions/contrib/providers/remoteAgentHost/**"
---

# AHP interoperability

AHP clients communicate with any conforming Agent Host, not only the local VS Code Agent Host. Treat host-advertised session and chat URIs, identifiers, state, and capabilities as authoritative. Do not derive or reinterpret them using the local host's URI format, provider names, or implementation conventions. Helpers that construct IDs for the local host are not a substitute for reading IDs supplied by a remote host.

Use standard AHP fields and negotiated capabilities for shared behavior. If VS Code needs an optional extension, use a namespaced `_meta` value with a typed reader that validates its shape before use. Do not make the extension a requirement for other hosts, and do not use `_meta` to replace a standard protocol field or to justify assuming a particular host implementation.

When changing an AHP client, cover a conforming host that advertises valid but different URIs and identifiers, as well as absent optional extensions. Test the behavior at the client boundary, not only against the local VS Code host.
