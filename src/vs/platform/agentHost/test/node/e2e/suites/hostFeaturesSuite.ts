/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentHostConfigKey } from '../../../../common/agentHostCustomizationConfig.js';
import { AgentHostCopilotMultiRootEnabledConfigKey } from '../../../../common/agentHostSchema.js';
import { deriveGitHubEndpoints, gitHubCopilotResource } from '../../../../common/githubEndpoints.js';
import { CompletionItemKind, type CompletionsResult, type InitializeResult, type ResolveSessionConfigResult, type SessionConfigCompletionsResult, type SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, AuthRequiredReason, type AuthRequiredParams } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageAttachmentKind, ROOT_STATE_URI, ToolCallConfirmationReason, type TerminalState, type ToolResultContent } from '../../../../common/state/sessionState.js';
import {
	createRealSession,
	dispatchTurn,
	getMarkdownResponseText,
	terminalResourceFromContent,
	textFromContent,
	initTestGitRepo,
	resolveGitHubToken,
} from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, providerHostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineHostFeaturesTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, isWindows } = context;
	const behaviorSnapshot = { profile: 'behavior' } as const;
	let rootConfigClientSeq = 10_000;

	function createWorkspace(prefix: string): string {
		const workspace = mkdtempSync(join(tmpdir(), prefix));
		tempDirs.push(workspace);
		return workspace;
	}

	function copilotMultiRootTest(title: string, run: Mocha.AsyncFunc): void {
		if (config.provider === 'copilotcli') {
			providerHostOnlyTest(context, title, run);
		}
	}

	async function createSession(prefix: string, workspace = createWorkspace(`ahp-${prefix}-`)): Promise<string> {
		return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
	}

	async function setRootConfig(configValues: Readonly<Record<string, unknown>>): Promise<void> {
		const clientSeq = rootConfigClientSeq++;
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq,
			action: { type: ActionType.RootConfigChanged, config: configValues },
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& getActionEnvelope(notification).channel === ROOT_STATE_URI
			&& getActionEnvelope(notification).origin?.clientSeq === clientSeq,
		);
	}

	async function createSessionWithWorkingDirectories(prefix: string, workingDirectories: readonly URI[]): Promise<string> {
		const clientWorkspace = workingDirectories.find(directory => directory.scheme === 'file')?.fsPath ?? createWorkspace(`ahp-${prefix}-client-`);
		context.client.setWorkingDirectory(clientWorkspace);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${prefix}-${config.provider}`,
		}, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
		const enableCopilotMultiRoot = config.provider === 'copilotcli' && workingDirectories.length > 1;
		if (enableCopilotMultiRoot) {
			await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			await setRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: true });
		}
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: workingDirectories.map(directory => directory.toString()),
			config: { isolation: 'folder' },
		}, 30_000);
		createdSessions.push(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		if (enableCopilotMultiRoot) {
			await setRootConfig({ [AgentHostCopilotMultiRootEnabledConfigKey]: false });
		}
		context.client.clearReceived();
		return sessionUri;
	}

	async function getCompletions(sessionUri: string, text: string, offset = text.length): Promise<CompletionsResult> {
		return context.client.call<CompletionsResult>('completions', {
			channel: buildDefaultChatUri(sessionUri),
			kind: CompletionItemKind.UserMessage,
			text,
			offset,
		});
	}

	function completionResourceUris(result: CompletionsResult): string[] {
		return result.items.flatMap(item => item.attachment.type === MessageAttachmentKind.Resource ? [item.attachment.uri] : []);
	}

	async function getBranchCompletions(workingDirectory: string | undefined, query?: string): Promise<SessionConfigCompletionsResult> {
		return context.client.call<SessionConfigCompletionsResult>('sessionConfigCompletions', {
			channel: ROOT_STATE_URI,
			provider: config.provider,
			workingDirectory,
			config: { isolation: 'worktree' },
			property: 'branch',
			query,
		});
	}

	conformanceTest(context, 'initialize advertises host-owned input capabilities', async function () {

		const result = await context.client.call<InitializeResult>('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `host-capabilities-${config.provider}`,
		});

		assert.deepStrictEqual({
			completionTriggerCharacters: result.completionTriggerCharacters,
			terminalCommandPrefix: result.terminalCommandPrefix,
		}, {
			completionTriggerCharacters: ['@', '#', '/'],
			terminalCommandPrefix: '!',
		});
	});

	conformanceTest(context, 'configuring a GitHub Enterprise host asks the client to re-authenticate', async function () {
		const enterpriseUri = 'https://enterprise.example.com';
		await createSession('enterprise-auth-required');
		await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		context.client.clearReceived();
		try {
			const required = context.client.waitForNotification(notification => notification.method === 'auth/required');
			await setRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: enterpriseUri });
			const notification = await required;

			assert.deepStrictEqual(notification.params as AuthRequiredParams, {
				channel: ROOT_STATE_URI,
				resource: gitHubCopilotResource(deriveGitHubEndpoints(enterpriseUri)),
				reason: AuthRequiredReason.Required,
			});
		} finally {
			await setRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: '' });
		}
	});

	conformanceTest(context, 'workspace file completions are filtered, attached, and cached', async function () {

		const workspace = createWorkspace('ahp-file-completions-');
		const sourceDirectory = join(workspace, 'src');
		mkdirSync(sourceDirectory);
		const targetPath = join(sourceDirectory, 'alpha-target.ts');
		writeFileSync(targetPath, 'export const target = true;\n');
		writeFileSync(join(workspace, 'ignored-target.ts'), 'ignored\n');
		writeFileSync(join(workspace, '.gitignore'), 'ignored-target.ts\n');
		const sessionUri = await createSession('file-completions', workspace);

		const first = await getCompletions(sessionUri, 'review @alpha-t');
		unlinkSync(targetPath);
		const second = await getCompletions(sessionUri, 'review #alpha-t');

		assert.deepStrictEqual({
			first: first.items.map(item => ({ insertText: item.insertText, attachment: item.attachment })),
			second: second.items.map(item => ({ insertText: item.insertText, attachment: item.attachment })),
		}, {
			first: [{
				insertText: '@alpha-target.ts',
				attachment: {
					type: 'resource',
					uri: URI.file(targetPath).toString(),
					label: 'alpha-target.ts',
					displayKind: 'document',
				},
			}],
			second: [{
				insertText: '#alpha-target.ts',
				attachment: {
					type: 'resource',
					uri: URI.file(targetPath).toString(),
					label: 'alpha-target.ts',
					displayKind: 'document',
				},
			}],
		});
	});

	conformanceTest(context, 'workspace file completions ignore plain text', async function () {

		const workspace = createWorkspace('ahp-empty-completions-');
		writeFileSync(join(workspace, 'visible.txt'), 'visible\n');
		const sessionUri = await createSession('empty-completions', workspace);

		const result = await getCompletions(sessionUri, 'plain text');

		assert.deepStrictEqual(result, { items: [] });
	});

	conformanceTest(context, 'workspace file completion replaces only the token before the cursor', async function () {
		const workspace = createWorkspace('ahp-file-completion-range-');
		writeFileSync(join(workspace, 'alpha.ts'), 'alpha');
		const sessionUri = await createSession('file-completion-range', workspace);
		const text = 'review @alp trailing';

		const result = await getCompletions(sessionUri, text, 'review @alp'.length);

		assert.deepStrictEqual(result.items.map(item => ({
			insertText: item.insertText,
			rangeStart: item.rangeStart,
			rangeEnd: item.rangeEnd,
		})), [{
			insertText: '@alpha.ts',
			rangeStart: 'review '.length,
			rangeEnd: 'review @alp'.length,
		}]);
	});

	conformanceTest(context, 'workspace file completion ignores embedded at signs', async function () {
		const workspace = createWorkspace('ahp-file-completion-embedded-');
		writeFileSync(join(workspace, 'example.txt'), 'example');
		const sessionUri = await createSession('file-completion-embedded', workspace);

		const result = await getCompletions(sessionUri, 'email@example');

		assert.deepStrictEqual(result.items, []);
	});

	conformanceTest(context, 'workspace file completion accepts tab and newline delimiters', async function () {
		const workspace = createWorkspace('ahp-file-completion-whitespace-');
		writeFileSync(join(workspace, 'alpha.txt'), 'alpha');
		const sessionUri = await createSession('file-completion-whitespace', workspace);

		const [tab, newline] = await Promise.all([
			getCompletions(sessionUri, 'review\t@alp'),
			getCompletions(sessionUri, 'review\n#alp'),
		]);

		assert.deepStrictEqual({
			tab: tab.items.map(item => item.insertText),
			newline: newline.items.map(item => item.insertText),
		}, {
			tab: ['@alpha.txt'],
			newline: ['#alpha.txt'],
		});
	});

	conformanceTest(context, 'workspace file completion disambiguates duplicate basenames', async function () {
		const workspace = createWorkspace('ahp-file-completion-duplicates-');
		mkdirSync(join(workspace, 'one'));
		mkdirSync(join(workspace, 'two'));
		writeFileSync(join(workspace, 'one', 'same.ts'), 'one');
		writeFileSync(join(workspace, 'two', 'same.ts'), 'two');
		const sessionUri = await createSession('file-completion-duplicates', workspace);

		const result = await getCompletions(sessionUri, '@same');

		assert.deepStrictEqual(result.items.map(item => item.attachment?.label).sort(), [
			`${basename(URI.file(workspace))} \u2022 one/same.ts`,
			`${basename(URI.file(workspace))} \u2022 two/same.ts`,
		]);
	});

	conformanceTest(context, 'workspace file completion matches nested relative paths', async function () {
		const workspace = createWorkspace('ahp-file-completion-nested-');
		mkdirSync(join(workspace, 'feature'));
		writeFileSync(join(workspace, 'feature', 'target.ts'), 'nested');
		writeFileSync(join(workspace, 'target.ts'), 'root');
		const sessionUri = await createSession('file-completion-nested', workspace);

		const result = await getCompletions(sessionUri, '@feature/target');

		assert.deepStrictEqual(result.items.map(item => item.attachment?.type === MessageAttachmentKind.Resource ? item.attachment.uri : undefined), [
			URI.file(join(workspace, 'feature', 'target.ts')).toString(),
		]);
	});

	conformanceTest(context, 'workspace file completion caps an empty query at fifty results', async function () {
		const workspace = createWorkspace('ahp-file-completion-limit-');
		for (let index = 0; index < 60; index++) {
			writeFileSync(join(workspace, `file-${String(index).padStart(2, '0')}.txt`), String(index));
		}
		const sessionUri = await createSession('file-completion-limit', workspace);

		const result = await getCompletions(sessionUri, '@');

		assert.strictEqual(result.items.length, 50);
	});

	conformanceTest(context, 'workspace file completion supports a trigger at the start of input', async function () {
		const workspace = createWorkspace('ahp-file-completion-start-');
		writeFileSync(join(workspace, 'alpha.ts'), 'alpha');
		const sessionUri = await createSession('file-completion-start', workspace);

		const result = await getCompletions(sessionUri, '#alp');

		assert.deepStrictEqual(result.items.map(item => ({
			insertText: item.insertText,
			rangeStart: item.rangeStart,
			rangeEnd: item.rangeEnd,
		})), [{
			insertText: '#alpha.ts',
			rangeStart: 0,
			rangeEnd: 4,
		}]);
	});

	conformanceTest(context, 'workspace file completion ignores a token separated from the cursor', async function () {
		const workspace = createWorkspace('ahp-file-completion-separated-');
		writeFileSync(join(workspace, 'alpha.ts'), 'alpha');
		const sessionUri = await createSession('file-completion-separated', workspace);

		const result = await getCompletions(sessionUri, 'review @alpha later');

		assert.deepStrictEqual(result.items, []);
	});

	conformanceTest(context, 'workspace file completion matches file names case-insensitively', async function () {
		const workspace = createWorkspace('ahp-file-completion-case-');
		writeFileSync(join(workspace, 'MixedCase.ts'), 'mixed');
		const sessionUri = await createSession('file-completion-case', workspace);

		const result = await getCompletions(sessionUri, '@mixedcase');

		assert.deepStrictEqual(result.items.map(item => item.insertText), ['@MixedCase.ts']);
	});

	conformanceTest(context, 'workspace file completion fuzzy matches a basename', async function () {
		const workspace = createWorkspace('ahp-file-completion-fuzzy-');
		writeFileSync(join(workspace, 'agentHostCoverage.ts'), 'coverage');
		const sessionUri = await createSession('file-completion-fuzzy', workspace);

		const result = await getCompletions(sessionUri, '@agcov');

		assert.deepStrictEqual(result.items.map(item => item.insertText), ['@agentHostCoverage.ts']);
	});

	conformanceTest(context, 'workspace file completion ignores a token after the cursor', async function () {
		const workspace = createWorkspace('ahp-file-completion-offset-');
		writeFileSync(join(workspace, 'alpha.ts'), 'alpha');
		const sessionUri = await createSession('file-completion-offset', workspace);

		const result = await getCompletions(sessionUri, 'prefix @alpha', 'prefix'.length);

		assert.deepStrictEqual(result.items, []);
	});

	copilotMultiRootTest('multi-root file completion returns matches from every workspace root', async function () {
		const first = createWorkspace('ahp-file-completion-multi-first-');
		const second = createWorkspace('ahp-file-completion-multi-second-');
		writeFileSync(join(first, 'first-target.txt'), 'first');
		writeFileSync(join(second, 'second-target.txt'), 'second');
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-multi', [URI.file(first), URI.file(second)]);

		const result = await getCompletions(sessionUri, '@target');

		assert.deepStrictEqual(completionResourceUris(result).sort(), [
			URI.file(join(first, 'first-target.txt')).toString(),
			URI.file(join(second, 'second-target.txt')).toString(),
		]);
	});

	copilotMultiRootTest('empty multi-root file completion fairly interleaves roots before its result cap', async function () {
		const first = createWorkspace('ahp-file-completion-fair-first-');
		const second = createWorkspace('ahp-file-completion-fair-second-');
		for (let index = 0; index < 40; index++) {
			writeFileSync(join(first, `first-${String(index).padStart(2, '0')}.txt`), 'first');
			writeFileSync(join(second, `second-${String(index).padStart(2, '0')}.txt`), 'second');
		}
		const firstRoot = URI.file(first);
		const secondRoot = URI.file(second);
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-fair', [firstRoot, secondRoot]);

		const result = await getCompletions(sessionUri, '@');
		const counts = completionResourceUris(result).reduce((value, resourceValue) => {
			const resource = URI.parse(resourceValue);
			if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, firstRoot)) {
				value.first++;
			} else if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, secondRoot)) {
				value.second++;
			}
			return value;
		}, { first: 0, second: 0 });

		assert.deepStrictEqual({ total: result.items.length, ...counts }, { total: 50, first: 25, second: 25 });
	});

	copilotMultiRootTest('duplicate basenames in separate roots include their owning root labels', async function () {
		const first = createWorkspace('ahp-file-completion-label-first-');
		const second = createWorkspace('ahp-file-completion-label-second-');
		writeFileSync(join(first, 'same.txt'), 'first');
		writeFileSync(join(second, 'same.txt'), 'second');
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-labels', [URI.file(first), URI.file(second)]);

		const result = await getCompletions(sessionUri, '@same');

		assert.deepStrictEqual(result.items.map(item => item.attachment.label).sort(), [
			`${basename(URI.file(first))} \u2022 same.txt`,
			`${basename(URI.file(second))} \u2022 same.txt`,
		].sort());
	});

	copilotMultiRootTest('duplicate working directory URIs do not duplicate file completions', async function () {
		const workspace = createWorkspace('ahp-file-completion-duplicate-root-');
		writeFileSync(join(workspace, 'unique.txt'), 'unique');
		const root = URI.file(workspace);
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-duplicate-root', [root, root, URI.parse(`${root.toString()}/`)]);

		const result = await getCompletions(sessionUri, '@unique');

		assert.deepStrictEqual(completionResourceUris(result), [URI.file(join(workspace, 'unique.txt')).toString()]);
	});

	copilotMultiRootTest('overlapping roots attribute duplicate basenames to the deepest owner', async function () {
		const outer = createWorkspace('ahp-file-completion-overlap-owner-');
		const inner = join(outer, 'nested');
		mkdirSync(inner);
		writeFileSync(join(outer, 'same.txt'), 'outer');
		writeFileSync(join(inner, 'same.txt'), 'inner');
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-overlap-owner', [URI.file(outer), URI.file(inner)]);

		const result = await getCompletions(sessionUri, '@same');

		assert.deepStrictEqual(result.items.map(item => item.attachment.label).sort(), [
			`${basename(URI.file(outer))} \u2022 same.txt`,
			`${basename(URI.file(inner))} \u2022 same.txt`,
		].sort());
	});

	copilotMultiRootTest('overlapping roots enumerate a shared physical file only once', async function () {
		const outer = createWorkspace('ahp-file-completion-overlap-dedupe-');
		const inner = join(outer, 'nested');
		mkdirSync(inner);
		writeFileSync(join(inner, 'shared-target.txt'), 'shared');
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-overlap-dedupe', [URI.file(outer), URI.file(inner)]);

		const result = await getCompletions(sessionUri, '@shared-target');

		assert.deepStrictEqual(completionResourceUris(result), [URI.file(join(inner, 'shared-target.txt')).toString()]);
	});

	copilotMultiRootTest('non-file roots are ignored while file roots still provide completions', async function () {
		const workspace = createWorkspace('ahp-file-completion-non-file-root-');
		writeFileSync(join(workspace, 'local-target.txt'), 'local');
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-non-file-root', [
			URI.parse('vscode-remote://ssh-remote+example/workspace'),
			URI.file(workspace),
		]);

		const result = await getCompletions(sessionUri, '@local-target');

		assert.deepStrictEqual(completionResourceUris(result), [URI.file(join(workspace, 'local-target.txt')).toString()]);
	});

	conformanceTest(context, 'workspace file completion includes hidden files outside git metadata', async function () {
		const workspace = createWorkspace('ahp-file-completion-hidden-');
		writeFileSync(join(workspace, '.hidden-target.txt'), 'hidden');
		const sessionUri = await createSession('file-completion-hidden', workspace);

		const result = await getCompletions(sessionUri, '@hidden-target');

		assert.deepStrictEqual(result.items.map(item => item.insertText), ['@.hidden-target.txt']);
	});

	conformanceTest(context, 'workspaceless sessions return no file completions', async function () {
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-workspaceless', []);

		const result = await getCompletions(sessionUri, '@target');

		assert.deepStrictEqual(result.items, []);
	});

	conformanceTest(context, 'workspace file completion honors dot-ignore files', async function () {
		const workspace = createWorkspace('ahp-file-completion-dot-ignore-');
		writeFileSync(join(workspace, 'ignored-target.txt'), 'ignored');
		writeFileSync(join(workspace, '.ignore'), 'ignored-target.txt\n');
		const sessionUri = await createSession('file-completion-dot-ignore', workspace);

		const result = await getCompletions(sessionUri, '@ignored-target');

		assert.deepStrictEqual(result.items, []);
	});

	copilotMultiRootTest('colliding root basenames produce distinct shortened completion labels', async function () {
		const firstParent = createWorkspace('ahp-file-completion-collision-first-');
		const secondParent = createWorkspace('ahp-file-completion-collision-second-');
		const first = join(firstParent, 'workspace');
		const second = join(secondParent, 'workspace');
		mkdirSync(first);
		mkdirSync(second);
		writeFileSync(join(first, 'same.txt'), 'first');
		writeFileSync(join(second, 'same.txt'), 'second');
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-colliding-labels', [URI.file(first), URI.file(second)]);

		const result = await getCompletions(sessionUri, '@same');
		const labels = result.items.map(item => item.attachment.label);

		assert.deepStrictEqual({
			count: labels.length,
			unique: new Set(labels).size,
			hasRelativeFile: labels.every(label => label.endsWith('\u2022 same.txt')),
		}, {
			count: 2,
			unique: 2,
			hasRelativeFile: true,
		});
	});

	copilotMultiRootTest('multi-root relative path query selects the matching owner path', async function () {
		const first = createWorkspace('ahp-file-completion-path-first-');
		const second = createWorkspace('ahp-file-completion-path-second-');
		mkdirSync(join(first, 'feature'));
		mkdirSync(join(second, 'other'));
		writeFileSync(join(first, 'feature', 'target.ts'), 'first');
		writeFileSync(join(second, 'other', 'target.ts'), 'second');
		const sessionUri = await createSessionWithWorkingDirectories('file-completion-owner-path', [URI.file(first), URI.file(second)]);

		const result = await getCompletions(sessionUri, '@feature/target');

		assert.deepStrictEqual(completionResourceUris(result), [URI.file(join(first, 'feature', 'target.ts')).toString()]);
	});

	conformanceTest(context, 'rename completion appears after a locally renamed turn', async function () {

		const sessionUri = await createSession('rename-completion');
		const before = await getCompletions(sessionUri, '/r');

		context.client.clearReceived();
		context.client.clearAhpSnapshot();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-rename', '/rename Coverage Session', 1);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-rename',
		);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);

		const after = await getCompletions(sessionUri, '/r');
		const session = await fetchSessionWithChat(context.client, sessionUri);

		assert.deepStrictEqual({
			before: before.items.some(item => item.insertText === '/rename '),
			after: after.items.some(item => item.insertText === '/rename '),
			title: session.title,
		}, {
			before: false,
			after: true,
			title: 'Coverage Session',
		});
		assert.match(getMarkdownResponseText(context.client), /Renamed: Coverage Session/);
	});

	conformanceTest(context, 'an empty rename command completes without changing the title', async function () {

		const sessionUri = await createSession('empty-rename');
		const before = await fetchSessionWithChat(context.client, sessionUri);

		context.client.clearReceived();
		context.client.clearAhpSnapshot();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-empty-rename', '/rename', 1);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-empty-rename',
		);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);

		const after = await fetchSessionWithChat(context.client, sessionUri);
		assert.deepStrictEqual({
			titleBefore: before.title,
			titleAfter: after.title,
			responseText: getMarkdownResponseText(context.client),
		}, {
			titleBefore: before.title,
			titleAfter: before.title,
			responseText: '',
		});
	});

	conformanceTest(context, 'a bang command runs locally and exposes terminal output', async function () {

		const sessionUri = await createSession('bang-success');
		const chatUri = buildDefaultChatUri(sessionUri);

		context.client.clearReceived();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-bang-success', '!echo BANG_OUTPUT_42', 1);
		const toolComplete = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-success',
			30_000,
		);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-success',
			30_000,
		);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);

		const result = (getActionEnvelope(toolComplete).action as { result: { success: boolean; content?: readonly ToolResultContent[] } }).result;
		const content = result.content ?? [];
		const terminalUri = terminalResourceFromContent(content);
		assert.ok(terminalUri, 'bang command should expose a terminal resource');
		const terminal = await context.client.call<SubscribeResult>('subscribe', { channel: terminalUri });
		const terminalState = terminal.snapshot!.state as TerminalState;
		const terminalContainsOutput = terminalState.content.some(part =>
			(part.type === 'command' ? part.output : part.value).includes('BANG_OUTPUT_42'));
		const ready = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
			.map(n => getActionEnvelope(n).action as { turnId: string; confirmed?: string })
			.find(action => action.turnId === 'turn-bang-success');

		assert.deepStrictEqual({
			success: result.success,
			confirmation: ready?.confirmed,
			resultContainsOutput: textFromContent(content).includes('BANG_OUTPUT_42'),
			terminalContainsOutput,
		}, {
			success: true,
			confirmation: ToolCallConfirmationReason.NotNeeded,
			resultContainsOutput: true,
			terminalContainsOutput: true,
		});
	}, !isWindows);

	conformanceTest(context, 'a failing bang command reports its exit code', async function () {

		const sessionUri = await createSession('bang-failure');

		context.client.clearReceived();
		context.client.beginAhpSnapshotRound();
		dispatchTurn(context.client, sessionUri, 'turn-bang-failure', '!node -e "process.exit(7)"', 1);
		const toolComplete = await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/toolCallComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-failure',
			30_000,
		);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& (getActionEnvelope(n).action as { turnId: string }).turnId === 'turn-bang-failure',
			30_000,
		);
		await assertRecordedAhpSnapshot(this.test!, context.client, behaviorSnapshot);

		const result = (getActionEnvelope(toolComplete).action as { result: { success: boolean; pastTenseMessage?: string } }).result;
		const ready = context.client.receivedNotifications(n => isActionNotification(n, 'chat/toolCallReady'))
			.map(n => getActionEnvelope(n).action as { turnId: string; confirmed?: string })
			.find(action => action.turnId === 'turn-bang-failure');
		assert.deepStrictEqual({
			success: result.success,
			confirmation: ready?.confirmed,
			reportsExitCode: /(?:^|\D)7(?:\D|$)/.test(result.pastTenseMessage ?? ''),
		}, {
			success: false,
			confirmation: ToolCallConfirmationReason.NotNeeded,
			reportsExitCode: true,
		});
	});

	conformanceTest(context, 'session configuration resolves and completes git branches', async function () {

		const workspace = createWorkspace('ahp-config-completions-');
		initTestGitRepo(workspace);
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		execSync('git branch feature/coverage-target', { cwd: workspace });
		await createSession('config-completions', workspace);
		const workingDirectory = URI.file(workspace).toString();

		const resolved = await context.client.call<ResolveSessionConfigResult>('resolveSessionConfig', {
			channel: ROOT_STATE_URI,
			provider: config.provider,
			workingDirectory,
			config: { isolation: 'worktree' },
		});
		const completions = await context.client.call<SessionConfigCompletionsResult>('sessionConfigCompletions', {
			channel: ROOT_STATE_URI,
			provider: config.provider,
			workingDirectory,
			config: { isolation: 'worktree' },
			property: 'branch',
			query: 'coverage-target',
		});

		assert.deepStrictEqual({
			isolation: resolved.values.isolation,
			branchIsDynamic: resolved.schema.properties.branch.enumDynamic,
			completions: completions.items,
		}, {
			isolation: 'worktree',
			branchIsDynamic: true,
			completions: [{
				value: 'feature/coverage-target',
				label: 'feature/coverage-target',
			}],
		});
	});

	conformanceTest(context, 'branch completions without a working directory are empty', async function () {
		await createSession('branch-completion-no-working-directory');
		const result = await getBranchCompletions(undefined);

		assert.deepStrictEqual(result.items, []);
	});

	conformanceTest(context, 'branch completions for a non-git directory are empty', async function () {
		const workspace = createWorkspace('ahp-branch-completion-non-git-');
		await createSession('branch-completion-non-git', workspace);

		const result = await getBranchCompletions(URI.file(workspace).toString());

		assert.deepStrictEqual(result.items, []);
	});

	conformanceTest(context, 'branch completion queries are case insensitive', async function () {
		const workspace = createWorkspace('ahp-branch-completion-case-');
		initTestGitRepo(workspace);
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		execSync('git branch Feature/MixedCase', { cwd: workspace });
		await createSession('branch-completion-case', workspace);

		const result = await getBranchCompletions(URI.file(workspace).toString(), 'feature/mixed');

		assert.deepStrictEqual(result.items, [{ value: 'Feature/MixedCase', label: 'Feature/MixedCase' }]);
	});

	conformanceTest(context, 'branch completions prioritize the current branch', async function () {
		const workspace = createWorkspace('ahp-branch-completion-current-');
		initTestGitRepo(workspace);
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		execSync('git branch alpha', { cwd: workspace });
		execSync('git checkout -q -b current-target', { cwd: workspace });
		execSync('git branch omega', { cwd: workspace });
		await createSession('branch-completion-current', workspace);

		const result = await getBranchCompletions(URI.file(workspace).toString());

		assert.strictEqual(result.items[0]?.value, 'current-target');
	});

	conformanceTest(context, 'branch completions prioritize the default branch after the current branch', async function () {
		const workspace = createWorkspace('ahp-branch-completion-default-');
		const remote = createWorkspace('ahp-branch-completion-default-remote-');
		initTestGitRepo(workspace);
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		execSync('git branch -M main', { cwd: workspace });
		execSync('git init --bare -q', { cwd: remote });
		execSync(`git remote add origin ${JSON.stringify(remote)}`, { cwd: workspace });
		execSync('git push -q -u origin main', { cwd: workspace });
		execSync('git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main', { cwd: workspace });
		execSync('git checkout -q -b current-target', { cwd: workspace });
		execSync('git branch other', { cwd: workspace });
		await createSession('branch-completion-default', workspace);

		const result = await getBranchCompletions(URI.file(workspace).toString());

		assert.deepStrictEqual(result.items.slice(0, 2).map(item => item.value), ['current-target', 'main']);
	});

	conformanceTest(context, 'branch completions are capped at twenty-five items', async function () {
		const workspace = createWorkspace('ahp-branch-completion-limit-');
		initTestGitRepo(workspace);
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		for (let index = 0; index < 30; index++) {
			execSync(`git branch branch-${String(index).padStart(2, '0')}`, { cwd: workspace });
		}
		await createSession('branch-completion-limit', workspace);

		const result = await getBranchCompletions(URI.file(workspace).toString());

		assert.strictEqual(result.items.length, 25);
	});

	conformanceTest(context, 'branch completions return an empty result when no branch matches', async function () {
		const workspace = createWorkspace('ahp-branch-completion-no-match-');
		initTestGitRepo(workspace);
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		execSync('git branch feature/available', { cwd: workspace });
		await createSession('branch-completion-no-match', workspace);

		const result = await getBranchCompletions(URI.file(workspace).toString(), 'missing-branch');

		assert.deepStrictEqual(result.items, []);
	});

	conformanceTest(context, 'detached HEAD branch completions still return local branches', async function () {
		const workspace = createWorkspace('ahp-branch-completion-detached-');
		initTestGitRepo(workspace);
		execSync('git commit --allow-empty -m "initial"', { cwd: workspace });
		execSync('git branch available-one', { cwd: workspace });
		execSync('git branch available-two', { cwd: workspace });
		execSync('git checkout -q --detach HEAD', { cwd: workspace });
		await createSession('branch-completion-detached', workspace);

		const result = await getBranchCompletions(URI.file(workspace).toString(), 'available');

		assert.deepStrictEqual(result.items.map(item => item.value).sort(), ['available-one', 'available-two']);
	});

}
