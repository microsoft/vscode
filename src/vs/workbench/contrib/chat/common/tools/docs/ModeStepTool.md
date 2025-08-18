The  `executeModeStepTool` is an exploration of how to best support multi-step workflows in VS Code chat modes. As of right now, it's inspired by the `think` tool as such it reads a prompt file and appends it to the conversation thereby giving the model the instructions of how to behave next. In a future step, the executeModeStepTool could run subagents to achieve context isolation and a separate tool set of each step.

An example of a multi-step workflow is [here](./ThreeStep.chatmode.md).

The tool description / registration needs to go hand in hand with the system prompt.
The  `<How-you-operate>` section is the replacement of the system prompt. I'd expect us to use similar system prompt when we run a custom mode rather than the vanilla system prompt for agent mode.

Since we replace the system prompt you need the following setting when running a custom mode.
```json
  "github.copilot.chat.advanced.omitBaseAgentInstructions": true
```
