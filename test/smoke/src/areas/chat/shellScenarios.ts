/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Mock-LLM scenarios + response matchers used by smoke tests that exercise a
 * model-driven shell tool invocation and verify both:
 *   1. The tool actually ran (the tool result contains the echoed marker), and
 *   2. The reply appears in the chat (the same marker is rendered).
 *
 * Two variants are provided to cover the different tool names advertised by
 * each surface:
 *   - {@link shellEchoScenario} matches SDK-based sessions (Copilot CLI,
 *     Claude, AgentHost), which expose `bash` / `pwsh` / `powershell` tools.
 *   - {@link runInTerminalScenario} matches the VS Code built-in chat agent
 *     (used by the "Local" session), which exposes the `run_in_terminal`
 *     tool.
 *
 * Both scenarios use a two-turn protocol:
 *   - Turn 1 (`tool-calls`): the model asks the tool to execute
 *     `echo <reply>`.
 *   - Turn 2 (`echo-last-message`): the model replays the last
 *     (tool-result) message back as a ```json fenced block, so the reply
 *     appears in the assistant rendering.
 *
 * Importantly, `echo` is in the default `chat.tools.terminal.autoApprove`
 * list, so no extra settings are required to auto-approve the command.
 */

export function shellEchoScenario(reply: string): unknown {
	return {
		type: 'multi-turn',
		turns: [
			{
				kind: 'tool-calls',
				toolCalls: [
					{
						toolNamePattern: /^(bash|pwsh|powershell)$/i,
						arguments: { command: `echo ${reply}` },
					},
				],
			},
			{ kind: 'echo-last-message' },
		],
	};
}

export function runInTerminalScenario(reply: string): unknown {
	return {
		type: 'multi-turn',
		turns: [
			{
				kind: 'tool-calls',
				toolCalls: [
					{
						toolNamePattern: /^run_in_terminal$/,
						arguments: {
							command: `echo ${reply}`,
							explanation: 'Smoke test echo to verify run_in_terminal',
							goal: 'Echo a marker to verify terminal execution',
							mode: 'sync',
						},
					},
				],
			},
			{ kind: 'echo-last-message' },
		],
	};
}

/**
 * Matcher for the assistant text produced by {@link shellEchoScenario} or
 * {@link runInTerminalScenario}. The final response renders the tool result
 * as a ```json block; the exact format varies by surface:
 *   - Copilot CLI (responses-API):     `{ "output": "<reply>" }`
 *   - Local `run_in_terminal`:         `{ "output": "<reply>..." }`
 *   - Claude SDK Bash (messages-API):  `{ "content": "<reply>" }`
 *   - AgentHost custom terminal tool:  `{ "output": "ShellID: ...\nExitcode: 0\n<reply>" }`
 *
 * Anchoring on a JSON double-quote OR newline immediately preceding the reply
 * matches:
 *   - the value side of any `"<key>": "<reply>..."` pair (Copilot CLI, Claude,
 *     Local `run_in_terminal`), AND
 *   - the AgentHost custom-terminal format where the reply is preceded by
 *     `\n` inside a larger `"output"` string.
 *
 * This excludes the `echo <reply>` command preview (a bareword surrounded by
 * whitespace, not `"` or `\n`). `<reply>` must not contain regex
 * metacharacters.
 */
export function shellEchoResponseMatcher(reply: string): RegExp {
	// The rendered JSON block collapses `\n` in the string value into a real
	// newline in `textContent`, but the assistant output can also contain
	// literal escaped `\n` when the JSON is displayed verbatim; match either.
	return new RegExp(`(?:"|\\n|\\\\n)${reply}`);
}
