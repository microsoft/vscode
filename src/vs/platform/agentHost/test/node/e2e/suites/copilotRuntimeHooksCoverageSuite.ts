/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind } from '../../../../common/state/protocol/state.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, type ClientPluginCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, driveTurnToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

type HookEvent = 'sessionStart' | 'sessionEnd' | 'userPromptSubmitted' | 'preToolUse' | 'postToolUse' | 'postToolUseFailure';

interface IHookInput {
	readonly cwd?: string;
	readonly source?: string;
	readonly reason?: string;
	readonly prompt?: string;
	readonly toolName?: string;
	readonly toolArgs?: { readonly path?: string };
	readonly toolResult?: { readonly textResultForLlm?: string; readonly resultType?: string };
	readonly hook_event_name?: string;
	readonly tool_name?: string;
	readonly tool_input?: { readonly path?: string };
}

interface IHookTrace {
	readonly tag: string;
	readonly cwd: string;
	readonly environment: {
		readonly marker: string;
		readonly project: string;
		readonly plugin: string;
	};
	readonly input: IHookInput;
}

interface IHookBehavior {
	readonly output?: object;
	readonly rawOutput?: string;
	readonly exitCode?: number;
	readonly stderr?: string;
	readonly redirectFile?: string;
}

interface IHookSpec {
	readonly event: HookEvent;
	readonly tag: string;
	readonly behavior?: IHookBehavior;
	readonly matcher?: string;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
	readonly compatibility?: 'PreToolUse';
}

interface IHookFixture {
	readonly workspace: string;
	readonly plugin: string;
	readonly trace: string;
	readonly sessionUri: string;
	run(prompt: string): Promise<void>;
	view(file?: string): Promise<ChatToolCallCompleteAction>;
	traces(): IHookTrace[];
	requestText(): string;
}

const hookScript = String.raw`
const { appendFileSync } = require('fs');
const [trace, tag, behaviorText] = process.argv.slice(2);
const behavior = JSON.parse(behaviorText);
let inputText = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => inputText += chunk);
process.stdin.on('end', () => {
	const input = JSON.parse(inputText);
	appendFileSync(trace, JSON.stringify({
		tag, cwd: process.cwd(), input,
		environment: {
			marker: process.env.RUNTIME_HOOK_MARKER || '',
			project: process.env.RUNTIME_HOOK_PROJECT || '',
			plugin: process.env.RUNTIME_HOOK_PLUGIN || ''
		}
	}) + '\n');
	const output = behavior.redirectFile
		? { modifiedArgs: { ...input.toolArgs, path: behavior.redirectFile } }
		: behavior.output;
	if (behavior.rawOutput !== undefined) {
		process.stdout.write(behavior.rawOutput);
	} else if (output !== undefined) {
		process.stdout.write(JSON.stringify(output));
	}
	if (behavior.stderr) {
		process.stderr.write(behavior.stderr);
	}
	process.exitCode = behavior.exitCode || 0;
});
`;

export function defineCopilotRuntimeHooksCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	suite('Copilot runtime hooks coverage', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineHooksTests(context);
	});
}

function defineHooksTests(context: IAgentHostE2ETestContext): void {
	function hooksTest(title: string, run: () => Promise<void>): void {
		test(`runtime coverage hooks: ${title}`, async function () {
			this.timeout(180_000);
			await run();
		});
	}

	async function fixture(repoHooks: readonly IHookSpec[], pluginHooks: readonly IHookSpec[] = []): Promise<IHookFixture> {
		const parent = join(process.cwd(), '.build');
		mkdirSync(parent, { recursive: true });
		const root = mkdtempSync(join(parent, 'ahp-runtime-hooks-'));
		context.tempDirs.push(root);
		const workspace = join(root, 'workspace');
		const plugin = join(root, 'plugin');
		const trace = join(workspace, 'hook-trace.jsonl');
		mkdirSync(join(workspace, '.github', 'hooks'), { recursive: true });
		mkdirSync(join(workspace, 'hook cwd space Ω'), { recursive: true });
		mkdirSync(join(plugin, '.plugin'), { recursive: true });
		mkdirSync(join(plugin, 'hooks'), { recursive: true });
		mkdirSync(join(plugin, 'skills', 'runtime-hook-note'), { recursive: true });
		execFileSync('git', ['init', '--quiet', workspace]);
		writeFileSync(trace, '');
		writeFileSync(join(workspace, 'fixture.txt'), 'HOOK_ORIGINAL_FILE\n');
		writeFileSync(join(workspace, 'redirected.txt'), 'HOOK_REDIRECTED_FILE\n');
		writeFileSync(join(workspace, 'hook.cjs'), hookScript);
		writeFileSync(join(plugin, 'hook.cjs'), hookScript);
		writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'runtime-hooks' }));
		writeFileSync(join(plugin, 'skills', 'runtime-hook-note', 'SKILL.md'), '---\nname: runtime-hook-note\ndescription: Synthetic runtime hook metadata\n---\nNo action is required.');

		function document(specs: readonly IHookSpec[], pluginSource: boolean): { version: number; hooks: Record<string, object[]> } {
			const hooks: Record<string, object[]> = {};
			for (const spec of specs) {
				const command = {
					type: 'command',
					exec: process.execPath,
					args: [
						pluginSource ? join('${CLAUDE_PLUGIN_ROOT}', 'hook.cjs') : join(workspace, 'hook.cjs'),
						trace, spec.tag,
						JSON.stringify(spec.behavior?.redirectFile
							? { ...spec.behavior, redirectFile: join(workspace, spec.behavior.redirectFile) }
							: spec.behavior ?? {}),
					],
					env: { ELECTRON_RUN_AS_NODE: '1', ...spec.env },
					...(spec.cwd ? { cwd: spec.cwd } : {}),
					...(spec.matcher && !spec.compatibility ? { matcher: spec.matcher } : {}),
					timeoutSec: 10,
				};
				const event = spec.compatibility ?? spec.event;
				(hooks[event] ??= []).push(spec.compatibility
					? { matcher: spec.matcher, hooks: [command] }
					: command);
			}
			return { version: 1, hooks };
		}
		writeFileSync(join(workspace, '.github', 'hooks', 'runtime.json'), JSON.stringify(document(repoHooks, false)));
		if (pluginHooks.length) {
			writeFileSync(join(plugin, 'hooks', 'hooks.json'), JSON.stringify(document(pluginHooks, true)));
		}
		const clientId = 'runtime-hooks-client';
		const sessionUri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace));
		if (pluginHooks.length) {
			const pluginUri = URI.file(plugin).toString();
			const customization: ClientPluginCustomization = {
				type: CustomizationType.Plugin, id: customizationId(pluginUri), uri: pluginUri,
				name: 'runtime-hooks', nonce: '1',
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
			};
			context.client.dispatch({
				channel: sessionUri, clientSeq: 1,
				action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations: [customization] } },
			});
			await retry(async () => {
				const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
				const state = (result.snapshot!.state as SessionState).customizations?.find((item): item is PluginCustomization =>
					item.type === CustomizationType.Plugin && item.uri === pluginUri);
				assert.ok(state?.children?.some(child => child.type === CustomizationType.Skill));
			}, 100, 100);
		}
		let ordinal = 0;
		const channel = buildDefaultChatUri(sessionUri);
		const run = async (prompt: string) => {
			ordinal++;
			await driveTurnToCompletion(context.client, sessionUri, `hook-turn-${ordinal}`, prompt, ordinal * 100);
		};
		return {
			workspace, plugin, trace, sessionUri, run,
			view: async (file = 'fixture.txt') => {
				await run(`Call view exactly once on this exact file path: "${join(workspace, file)}". Do not use any other tool or retry even if a hook denies or changes the call. Then reply exactly HOOK_CHECKED.`);
				const starts = context.client.receivedNotifications(notification =>
					isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === channel)
					.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
					.filter(action => action.turnId === `hook-turn-${ordinal}`);
				assert.deepStrictEqual(starts.map(action => action.toolName), ['view']);
				const completions = context.client.receivedNotifications(notification =>
					isActionNotification(notification, ActionType.ChatToolCallComplete) && getActionEnvelope(notification).channel === channel)
					.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction)
					.filter(action => action.toolCallId === starts[0].toolCallId);
				assert.strictEqual(completions.length, 1);
				return completions[0];
			},
			traces: () => readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as IHookTrace),
			requestText: () => context.observedModelRequestBodies.join('\n'),
		};
	}

	function assertView(result: ChatToolCallCompleteAction, expected: string, success = true): void {
		const text = textFromContent(result.result.content ?? []);
		assert.deepStrictEqual({ success: result.result.success, contains: text.includes(expected) }, { success, contains: true }, text);
	}

	function matchesPath(actual: string | undefined, expected: string): boolean {
		return actual !== undefined && extUriBiasedIgnorePathCase.isEqual(URI.file(realpathSync(actual)), URI.file(realpathSync(expected)));
	}

	hooksTest('workspace SessionStart adds first-turn context without rerunning on the next turn', async () => {
		const scenario = await fixture([{
			event: 'sessionStart', tag: 'repo-start',
			behavior: { output: { additionalContext: 'HOOK_SESSION_CONTEXT' } },
		}]);
		await scenario.run('Reply exactly HOOK_SESSION_READY. Do not use any tools.');
		await scenario.run('Reply exactly HOOK_SESSION_STILL_READY. Do not use any tools.');
		const start = scenario.traces().filter(entry => entry.tag === 'repo-start');
		assert.deepStrictEqual({
			count: start.length,
			cwdMatches: matchesPath(start[0]?.input.cwd, scenario.workspace),
			source: start[0]?.input.source,
			context: scenario.requestText().includes('HOOK_SESSION_CONTEXT'),
		}, { count: 1, cwdMatches: true, source: 'new', context: true });
	});

	hooksTest('native plugin SessionStart hook resolves its executable arguments and adds context', async () => {
		const scenario = await fixture([], [{
			event: 'sessionStart', tag: 'plugin-start',
			behavior: { output: { additionalContext: { marker: 'HOOK_PLUGIN_CONTEXT', value: 7 } } },
		}]);
		await scenario.run('Reply exactly HOOK_PLUGIN_READY. Do not use any tools.');
		assert.deepStrictEqual({
			tags: scenario.traces().map(entry => entry.tag),
			context: scenario.requestText().includes('HOOK_PLUGIN_CONTEXT'),
		}, { tags: ['plugin-start'], context: true });
	});

	hooksTest('UserPromptSubmitted replaces the prompt and appends hook context on each turn', async () => {
		const scenario = await fixture([{
			event: 'userPromptSubmitted', tag: 'prompt',
			behavior: { output: { modifiedPrompt: 'Reply exactly HOOK_REPLACED_PROMPT. Do not use any tools.', additionalContext: 'HOOK_PROMPT_CONTEXT' } },
		}]);
		await scenario.run('Reply exactly HOOK_ORIGINAL_PROMPT_ONE. Do not use any tools.');
		await scenario.run('Reply exactly HOOK_ORIGINAL_PROMPT_TWO. Do not use any tools.');
		const trace = scenario.traces();
		assert.deepStrictEqual({
			prompts: trace.map(entry => entry.input.prompt),
			context: scenario.requestText().includes('HOOK_PROMPT_CONTEXT'),
			replacement: scenario.requestText().includes('HOOK_REPLACED_PROMPT'),
		}, {
			prompts: ['Reply exactly HOOK_ORIGINAL_PROMPT_ONE. Do not use any tools.', 'Reply exactly HOOK_ORIGINAL_PROMPT_TWO. Do not use any tools.'],
			context: true, replacement: true,
		});
	});

	hooksTest('PreToolUse allow observes the native view arguments before execution', async () => {
		const scenario = await fixture([{ event: 'preToolUse', tag: 'allow', behavior: { output: { permissionDecision: 'allow' } } }]);
		const result = await scenario.view();
		assertView(result, 'HOOK_ORIGINAL_FILE');
		assert.deepStrictEqual(scenario.traces().map(entry => ({
			tag: entry.tag, tool: entry.input.toolName, pathMatches: matchesPath(entry.input.toolArgs?.path, join(scenario.workspace, 'fixture.txt')),
		})), [{ tag: 'allow', tool: 'view', pathMatches: true }]);
	});

	hooksTest('PreToolUse deny prevents file content from entering the tool result or model request', async () => {
		const scenario = await fixture([{ event: 'preToolUse', tag: 'deny', behavior: { output: { permissionDecision: 'deny', permissionDecisionReason: 'HOOK_READ_DENIED' } } }]);
		assertView(await scenario.view(), 'HOOK_READ_DENIED', false);
		assert.deepStrictEqual({
			tags: scenario.traces().map(entry => entry.tag),
			contentLeaked: scenario.requestText().includes('HOOK_ORIGINAL_FILE'),
		}, { tags: ['deny'], contentLeaked: false });
	});

	hooksTest('PreToolUse modifiedArgs redirects the real native file read', async () => {
		const scenario = await fixture([{ event: 'preToolUse', tag: 'modify-input', behavior: { redirectFile: 'redirected.txt' } }]);
		assertView(await scenario.view(), 'HOOK_REDIRECTED_FILE');
		assert.deepStrictEqual({
			originalInputMatches: matchesPath(scenario.traces()[0]?.input.toolArgs?.path, join(scenario.workspace, 'fixture.txt')),
			originalContentLeaked: scenario.requestText().includes('HOOK_ORIGINAL_FILE'),
		}, { originalInputMatches: true, originalContentLeaked: false });
	});

	hooksTest('PreToolUse additional context is handed to the model alongside the real result', async () => {
		const scenario = await fixture([{ event: 'preToolUse', tag: 'pre-context', behavior: { output: { additionalContext: 'HOOK_PRE_TOOL_CONTEXT' } } }]);
		assertView(await scenario.view(), 'HOOK_ORIGINAL_FILE');
		assert.deepStrictEqual({
			tags: scenario.traces().map(entry => entry.tag),
			context: scenario.requestText().includes('HOOK_PRE_TOOL_CONTEXT'),
			result: scenario.requestText().includes('HOOK_ORIGINAL_FILE'),
		}, { tags: ['pre-context'], context: true, result: true });
	});

	hooksTest('PreToolUse ask requests client confirmation before the native tool completes', async () => {
		const scenario = await fixture([{ event: 'preToolUse', tag: 'ask', behavior: { output: { permissionDecision: 'ask', permissionDecisionReason: 'HOOK_CONFIRM_READ' } } }]);
		assertView(await scenario.view(), 'HOOK_ORIGINAL_FILE');
		const pending = context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallReady) && getActionEnvelope(notification).channel === buildDefaultChatUri(scenario.sessionUri))
			.map(notification => getActionEnvelope(notification).action as ChatToolCallReadyAction)
			.filter(action => action.confirmed === undefined);
		assert.ok(pending.length > 0, 'The hook ask must produce a real pending client confirmation');
		assert.deepStrictEqual(scenario.traces().map(entry => entry.tag), ['ask']);
	});

	hooksTest('PostToolUse observes the real file result and replaces the model-facing result', async () => {
		const scenario = await fixture([{
			event: 'postToolUse', tag: 'post-rewrite', behavior: {
				output: {
					modifiedResult: { textResultForLlm: 'HOOK_REPLACED_RESULT', resultType: 'success' },
					additionalContext: 'HOOK_POST_TOOL_CONTEXT',
				}
			}
		}]);
		await scenario.view();
		assert.deepStrictEqual({
			tool: scenario.traces()[0]?.input.toolName,
			originalResult: scenario.traces()[0]?.input.toolResult?.textResultForLlm?.includes('HOOK_ORIGINAL_FILE'),
			replacement: scenario.requestText().includes('HOOK_REPLACED_RESULT'),
			context: scenario.requestText().includes('HOOK_POST_TOOL_CONTEXT'),
		}, { tool: 'view', originalResult: true, replacement: true, context: true });
	});

	hooksTest('PostToolUse block withholds the original native result from the model', async () => {
		const scenario = await fixture([{ event: 'postToolUse', tag: 'post-block', behavior: { output: { decision: 'block', reason: 'HOOK_RESULT_BLOCKED' } } }]);
		await scenario.view();
		assert.deepStrictEqual({
			originalObservedByHook: scenario.traces()[0]?.input.toolResult?.textResultForLlm?.includes('HOOK_ORIGINAL_FILE'),
			reason: scenario.requestText().includes('HOOK_RESULT_BLOCKED'),
			contentLeaked: scenario.requestText().includes('HOOK_ORIGINAL_FILE'),
		}, { originalObservedByHook: true, reason: true, contentLeaked: false });
	});

	hooksTest('canonical and nested compatibility matchers skip unrelated tools and map view input', async () => {
		const scenario = await fixture([
			{ event: 'preToolUse', tag: 'unmatched', matcher: 'sql', behavior: { output: { permissionDecision: 'deny', permissionDecisionReason: 'HOOK_UNMATCHED_DENY' } } },
			{ event: 'preToolUse', tag: 'native-matched', matcher: 'view|glob' },
		], [
			{
				event: 'preToolUse', tag: 'compat-matched', compatibility: 'PreToolUse', matcher: 'view', behavior: {
					output: {
						hookSpecificOutput: { permissionDecision: 'allow', additionalContext: 'HOOK_COMPAT_CONTEXT' },
					}
				}
			},
		]);
		assertView(await scenario.view(), 'HOOK_ORIGINAL_FILE');
		const trace = scenario.traces();
		const compatibility = trace.find(entry => entry.tag === 'compat-matched');
		assert.deepStrictEqual({
			tags: trace.map(entry => entry.tag),
			compatEvent: compatibility?.input.hook_event_name,
			compatTool: compatibility?.input.tool_name,
			compatPathMatches: matchesPath(compatibility?.input.tool_input?.path, join(scenario.workspace, 'fixture.txt')),
			context: scenario.requestText().includes('HOOK_COMPAT_CONTEXT'),
		}, {
			tags: ['native-matched', 'compat-matched'], compatEvent: 'PreToolUse', compatTool: 'Read',
			compatPathMatches: true, context: true,
		});
	});

	hooksTest('plugin hook environment and project-relative cwd expand without shell interpolation', async () => {
		const scenario = await fixture([], [{
			event: 'preToolUse', tag: 'plugin-environment',
			cwd: join('${COPILOT_PROJECT_DIR}', 'hook cwd space Ω'),
			env: {
				RUNTIME_HOOK_MARKER: 'HOOK_LITERAL_SPACE Ω',
				RUNTIME_HOOK_PROJECT: '${COPILOT_PROJECT_DIR}',
				RUNTIME_HOOK_PLUGIN: '${CLAUDE_PLUGIN_ROOT}',
			},
		}]);
		assertView(await scenario.view(), 'HOOK_ORIGINAL_FILE');
		const entry = scenario.traces()[0];
		assert.deepStrictEqual({
			tag: entry?.tag, cwdMatches: matchesPath(entry?.cwd, join(scenario.workspace, 'hook cwd space Ω')),
			marker: entry?.environment.marker,
			projectMatches: matchesPath(entry?.environment.project, scenario.workspace),
			pluginHasScript: entry?.environment.plugin && existsSync(join(entry.environment.plugin, 'hook.cjs')),
		}, {
			tag: 'plugin-environment', cwdMatches: true,
			marker: 'HOOK_LITERAL_SPACE Ω', projectMatches: true, pluginHasScript: true,
		});
	});

	hooksTest('non-JSON hook stdout is ignored while the next valid hook still executes', async () => {
		const scenario = await fixture([
			{ event: 'preToolUse', tag: 'invalid-stdout', behavior: { rawOutput: 'HOOK_NOT_JSON' } },
			{ event: 'preToolUse', tag: 'after-invalid', behavior: { output: { additionalContext: 'HOOK_AFTER_INVALID_CONTEXT' } } },
		]);
		assertView(await scenario.view(), 'HOOK_ORIGINAL_FILE');
		assert.deepStrictEqual({
			tags: scenario.traces().map(entry => entry.tag),
			context: scenario.requestText().includes('HOOK_AFTER_INVALID_CONTEXT'),
			invalidOutputLeaked: scenario.requestText().includes('HOOK_NOT_JSON'),
		}, { tags: ['invalid-stdout', 'after-invalid'], context: true, invalidOutputLeaked: false });
	});

	hooksTest('exit code two forces PreToolUse denial despite an allow decision on stdout', async () => {
		const scenario = await fixture([{
			event: 'preToolUse', tag: 'exit-two', behavior: {
				exitCode: 2, stderr: 'HOOK_EXIT_TWO_STDERR',
				output: { permissionDecision: 'allow', permissionDecisionReason: 'HOOK_EXIT_TWO_REASON' },
			}
		}]);
		assertView(await scenario.view(), 'HOOK_EXIT_TWO_REASON', false);
		assert.deepStrictEqual({
			tags: scenario.traces().map(entry => entry.tag),
			contentLeaked: scenario.requestText().includes('HOOK_ORIGINAL_FILE'),
		}, { tags: ['exit-two'], contentLeaked: false });
	});

	hooksTest('failed prompt hook does not block the next hook or the real tool turn', async () => {
		const scenario = await fixture([
			{ event: 'userPromptSubmitted', tag: 'prompt-failure', behavior: { exitCode: 7, stderr: 'HOOK_PROMPT_COMMAND_FAILURE' } },
			{ event: 'userPromptSubmitted', tag: 'prompt-recovery', behavior: { output: { additionalContext: 'HOOK_PROMPT_RECOVERED' } } },
		]);
		assertView(await scenario.view(), 'HOOK_ORIGINAL_FILE');
		assert.deepStrictEqual({
			tags: scenario.traces().map(entry => entry.tag),
			context: scenario.requestText().includes('HOOK_PROMPT_RECOVERED'),
		}, { tags: ['prompt-failure', 'prompt-recovery'], context: true });
	});

	hooksTest('native SessionEnd reports a completed run without repeating on disposal', async () => {
		const scenario = await fixture([{ event: 'sessionEnd', tag: 'end' }]);
		await scenario.run('Reply exactly HOOK_DISPOSAL_READY. Do not use any tools.');
		const completedRun = scenario.traces().map(entry => ({
			tag: entry.tag, cwdMatches: matchesPath(entry.input.cwd, scenario.workspace), reason: entry.input.reason,
		}));
		assert.deepStrictEqual(completedRun, [{ tag: 'end', cwdMatches: true, reason: 'complete' }]);
		await context.client.call('disposeSession', { channel: scenario.sessionUri }, 30_000);
		const index = context.createdSessions.indexOf(scenario.sessionUri);
		assert.ok(index >= 0);
		context.createdSessions.splice(index, 1);
		assert.deepStrictEqual(scenario.traces().map(entry => ({
			tag: entry.tag, cwdMatches: matchesPath(entry.input.cwd, scenario.workspace), reason: entry.input.reason,
		})), completedRun);
	});
}
