---
name: "StopHookTestAgent"
description: "Test agent that has a Stop hook to verify subagent hook behavior"
hooks:
  Stop:
    - type: command
      command: "bash .github/hooks/test-stop-hook.sh"
---

You are a test agent. When invoked, respond with exactly: "Hello from StopHookTestAgent. I am done."
Do not do anything else.
