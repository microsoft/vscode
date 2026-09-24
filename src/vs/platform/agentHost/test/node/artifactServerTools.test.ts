/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ArtifactServerToolName, LEGACY_ARTIFACT_SERVER_TOOL_NAMES } from '../../common/serverToolNames.js';
import { readSessionArtifacts, SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import { ARTIFACT_TOOLS_INSTRUCTION, artifactServerToolDefinitions, createArtifactServerToolGroup, type IArtifactServerToolAccessor } from '../../node/shared/artifactServerTools.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

suite('Artifact Server Tools', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const group = createArtifactServerToolGroup();
	const display = (toolName: string, args: unknown, result?: { text: string; success: boolean }) => group.getDisplay?.(toolName, args, result);

	function createHarness(accessor?: Partial<IArtifactServerToolAccessor>) {
		const sessionUri = 'copilot:/artifacts';
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'Artifacts',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		const persisted: (readonly ISessionArtifact[])[] = [];
		const host = new AgentServerToolHost(stateManager, [createArtifactServerToolGroup({
			isEnabled: () => true,
			persist: (_session, artifacts) => { persisted.push(artifacts); },
			...accessor,
		})]);
		return {
			sessionUri, stateManager, host, persisted,
			artifacts: () => readSessionArtifacts(stateManager.getSessionState(sessionUri)?._meta),
			execute: async (name: string, args?: unknown) => host.executeTool(buildDefaultChatUri(sessionUri), name, args),
		};
	}

	test('names what was recorded, from the isArtifact flag', () => {
		assert.deepStrictEqual({
			artifact: display(ArtifactServerToolName.AddArtifactOrReference, { label: 'Fix login', isArtifact: true }),
			reference: display(ArtifactServerToolName.AddArtifactOrReference, { label: 'Broken commit', isArtifact: false }),
			batch: display(ArtifactServerToolName.AddArtifactOrReference, { items: [{ label: 'Fix login', isArtifact: true }, { label: 'Docs', isArtifact: false }] }),
			unlabelled: display(ArtifactServerToolName.AddArtifactOrReference, { isArtifact: false }),
			malformed: display(ArtifactServerToolName.AddArtifactOrReference, undefined),
		}, {
			artifact: { displayName: 'Add Artifact', invocationMessage: 'Add artifact "Fix login"', pastTenseMessage: 'Added artifact "Fix login"' },
			reference: { displayName: 'Add Reference', invocationMessage: 'Add reference "Broken commit"', pastTenseMessage: 'Added reference "Broken commit"' },
			batch: { displayName: 'Add Artifacts or References', invocationMessage: 'Add 2 artifacts or references', pastTenseMessage: 'Added 2 artifacts or references' },
			unlabelled: { displayName: 'Add Reference', invocationMessage: 'Add reference', pastTenseMessage: 'Added reference' },
			malformed: { displayName: 'Add Artifact or Reference', invocationMessage: 'Add artifact or reference', pastTenseMessage: 'Added artifact or reference' },
		});
	});

	test('requires model-provided file paths to be absolute URIs', () => {
		const addDefinition = artifactServerToolDefinitions.find(definition => definition.name === ArtifactServerToolName.AddArtifactOrReference);
		const items = addDefinition?.inputSchema?.properties?.items as {
			readonly type?: string;
			readonly minItems?: number;
			readonly description?: string;
			readonly items?: { readonly properties?: Record<string, object>; readonly required?: readonly string[] };
		} | undefined;

		assert.deepStrictEqual({
			required: addDefinition?.inputSchema?.required,
			type: items?.type,
			minItems: items?.minItems,
			description: items?.description,
			itemRequired: items?.items?.required,
			uri: items?.items?.properties?.uri,
		}, {
			required: ['items'],
			type: 'array',
			minItems: 1,
			description: 'Artifacts and references to record in this call. Batch related entries when practical.',
			itemRequired: ['type', 'label', 'isArtifact'],
			uri: {
				type: 'string',
				description: 'Absolute URI including its scheme. For a local file, pass a file URI such as `file:///C:/path/to/file`, not a plain file system path such as `C:\\path\\to\\file`. Required for the `file` and `resource` kinds.',
			},
		});
	});

	test('keeps the full eligibility contract on the eager add tool for restored chats', () => {
		const addDefinition = artifactServerToolDefinitions.find(definition => definition.name === ArtifactServerToolName.AddArtifactOrReference);
		const clauses = [
			'Registration is optional',
			'default to no registration',
			'you create or attempt to fix, change, or unblock is an artifact',
			'inspection or review alone makes it a reference',
			'deliverables the user requested',
			'reopen, download, or reuse',
			'References are noteworthy existing resources',
			'batch related entries in one call',
			'routine files, scratch files, caches, logs, intermediate results, or configuration snapshots unless the user asked for them as deliverables',
			'persistence or location outside the workspace is not an eligibility signal',
			'incidental resources, commits you create unless the user asks',
			'sessions and chats created with session-management tools',
			'Never create, copy, or relocate a file solely to have an artifact to register',
			'promotes a matching reference, preserving its id',
			'never downgrade artifacts',
		];

		assert.deepStrictEqual({
			deferLoading: addDefinition?.deferLoading,
			missingClauses: clauses.filter(clause => !addDefinition?.description?.includes(clause)),
		}, {
			deferLoading: false,
			missingClauses: [],
		});
	});

	test('keeps classification guidance in the input schema and names the registered discovery tools', () => {
		const addDefinition = artifactServerToolDefinitions.find(definition => definition.name === ArtifactServerToolName.AddArtifactOrReference);
		const items = addDefinition?.inputSchema?.properties?.items as {
			readonly items?: { readonly properties?: Record<string, { readonly type?: string; readonly description?: string }> };
		} | undefined;
		const classificationInput = items?.items?.properties?.isArtifact;

		assert.deepStrictEqual({
			inputType: classificationInput?.type,
			inputClassification: classificationInput?.description?.includes('attempt to fix, change, or unblock'),
			instructionClassification: ARTIFACT_TOOLS_INSTRUCTION.includes('attempt to fix, change, or unblock'),
			toolMentions: artifactServerToolDefinitions.map(tool => ARTIFACT_TOOLS_INSTRUCTION.split(`\`${tool.name}\``).length - 1),
			discovery: ARTIFACT_TOOLS_INSTRUCTION.includes('discover if needed'),
			optional: ARTIFACT_TOOLS_INSTRUCTION.includes('default to no registration'),
			batch: ARTIFACT_TOOLS_INSTRUCTION.includes('Batch related entries'),
			endOnly: ARTIFACT_TOOLS_INSTRUCTION.includes('at the end'),
		}, {
			inputType: 'boolean',
			inputClassification: true,
			instructionClassification: true,
			toolMentions: [1, 1, 1],
			discovery: true,
			optional: true,
			batch: true,
			endOnly: false,
		});
	});

	test('keeps deferral metadata local while advertising every enabled tool', () => {
		const { host, stateManager, sessionUri } = createHarness();
		host.advertise(sessionUri);

		assert.deepStrictEqual({
			deferrals: host.getDefinitionsForSession(sessionUri).map(({ name, deferLoading }) => ({ name, deferLoading })),
			advertised: stateManager.getSessionState(sessionUri)?.serverTools,
		}, {
			deferrals: [
				{ name: ArtifactServerToolName.AddArtifactOrReference, deferLoading: false },
				{ name: ArtifactServerToolName.RemoveArtifactOrReference, deferLoading: true },
				{ name: ArtifactServerToolName.ListArtifactsAndReferences, deferLoading: true },
			],
			advertised: artifactServerToolDefinitions.map(({ deferLoading: _deferLoading, ...definition }) => definition),
		});
	});

	test('gates advertisement and execution of current and legacy tools off and on', async () => {
		let enabled = false;
		const { host, stateManager, sessionUri, execute } = createHarness({ isEnabled: () => enabled });
		const names = artifactServerToolDefinitions.map(tool => tool.name);
		const legacyNames = [...LEGACY_ARTIFACT_SERVER_TOOL_NAMES.keys()];
		for (const value of [false, true, false]) {
			enabled = value;
			host.advertise(sessionUri);
			assert.deepStrictEqual({
				definitions: host.getDefinitionsForSession(sessionUri).map(tool => tool.name),
				advertised: stateManager.getSessionState(sessionUri)?.serverTools?.map(tool => tool.name),
				routableNames: host.toolNames,
			}, {
				definitions: enabled ? names : [],
				advertised: enabled ? names : [],
				routableNames: enabled ? [...names, ...legacyNames] : [],
			});
			if (enabled) {
				assert.strictEqual(await execute(ArtifactServerToolName.ListArtifactsAndReferences), 'No artifacts or references recorded for this session.');
			} else {
				for (const name of [...names, ...legacyNames]) {
					await assert.rejects(() => execute(name, {}), /is disabled/);
				}
			}
		}
	});

	test('adds a batch atomically and persists it once', async () => {
		const sessionUri = 'copilot:/batch';
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'Batch',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		let persistCalls = 0;
		const group = createArtifactServerToolGroup({
			isEnabled: () => true,
			persist: () => { persistCalls++; },
		});

		const result = await group.execute(stateManager, { sessionUri, chatUri: buildDefaultChatUri(sessionUri), turnId: 'turn-1' }, ArtifactServerToolName.AddArtifactOrReference, {
			items: [
				{ type: 'website', label: 'Docs', isArtifact: false, link: 'https://example.com/docs' },
				{ type: 'file', label: 'Report', isArtifact: true, uri: 'file:///repo/report.md' },
				{ type: 'website', label: 'Docs again', isArtifact: false, link: 'https://example.com/docs' },
			],
		});
		const artifacts = readSessionArtifacts(stateManager.getSessionState(sessionUri)?._meta);

		assert.deepStrictEqual({
			messages: result.split('\n'),
			persistCalls,
			artifacts: artifacts.map(({ id: _id, ...artifact }) => artifact),
		}, {
			messages: [`Added reference: ${artifacts[0].id}`, `Added artifact: ${artifacts[1].id}`, `Already recorded: ${artifacts[0].id}`],
			persistCalls: 1,
			artifacts: [
				{ type: 'website', label: 'Docs', isArtifact: false, link: 'https://example.com/docs' },
				{ type: 'file', label: 'Report', isArtifact: true, uri: 'file:///repo/report.md' },
			],
		});
	});

	test('promotes an existing reference in one batch without changing its id or downgrading it', async () => {
		const { execute, artifacts, persisted } = createHarness();
		const reference = { type: 'issue', label: 'Investigated issue', isArtifact: false, link: 'https://github.com/microsoft/vscode/issues/1' };
		await execute(ArtifactServerToolName.AddArtifactOrReference, { items: [reference] });
		const id = artifacts()[0].id;
		const artifact = { ...reference, label: 'Fixed issue', isArtifact: true };

		const result = await execute(ArtifactServerToolName.AddArtifactOrReference, {
			items: [artifact, artifact, reference],
		});
		const repeated = await execute(ArtifactServerToolName.AddArtifactOrReference, { items: [artifact] });

		assert.deepStrictEqual({
			result,
			repeated,
			artifacts: artifacts(),
			persistCalls: persisted.length,
		}, {
			result: [`Promoted artifact: ${id}`, `Already recorded: ${id}`, `Already recorded: ${id}`].join('\n'),
			repeated: `Already recorded: ${id}`,
			artifacts: [{ ...artifact, id, isGitHub: true }],
			persistCalls: 2,
		});
	});

	test('deduplicates and promotes entries within the same atomic batch', async () => {
		const { execute, artifacts, persisted } = createHarness();
		const reference = { type: 'file', label: 'Report', isArtifact: false, uri: 'file:///repo/report.md' };
		const result = await execute(ArtifactServerToolName.AddArtifactOrReference, {
			items: [reference, { ...reference, isArtifact: true }, reference],
		});
		const id = artifacts()[0].id;

		assert.deepStrictEqual({ result, artifacts: artifacts(), persisted }, {
			result: [`Added reference: ${id}`, `Promoted artifact: ${id}`, `Already recorded: ${id}`].join('\n'),
			artifacts: [{ ...reference, id, isArtifact: true }],
			persisted: [[{ ...reference, id, isArtifact: true }]],
		});
	});

	test('rejects malformed URI batches without partially promoting or persisting entries', async () => {
		const { execute, artifacts, persisted } = createHarness();
		const reference = { type: 'website', label: 'Docs', isArtifact: false, link: 'https://example.com' };
		await execute(ArtifactServerToolName.AddArtifactOrReference, { items: [reference] });
		const before = artifacts();
		for (const uri of ['report.md', '/repo/report.md', 'C:\\repo\\report.md', 'foo/bar:baz']) {
			await assert.rejects(() => execute(ArtifactServerToolName.AddArtifactOrReference, {
				items: [{ ...reference, isArtifact: true }, { type: 'file', label: 'Report', isArtifact: true, uri }],
			}), /items\[1\]\.uri must be an absolute URI including its scheme/);
		}

		assert.deepStrictEqual({ artifacts: artifacts(), persisted }, { artifacts: before, persisted: [before] });
	});

	test('reports persistence errors without publishing a promotion', async () => {
		const error = new Error('Disk full');
		const { execute, stateManager, sessionUri, artifacts } = createHarness({ persist: async () => { throw error; } });
		const reference: ISessionArtifact = { id: 'restored-id', type: SessionArtifactType.File, label: 'Report', isArtifact: false, uri: 'file:///repo/report.md' };
		stateManager.setSessionMeta(sessionUri, withSessionArtifacts(undefined, [reference]));

		await assert.rejects(() => execute(ArtifactServerToolName.AddArtifactOrReference, {
			items: [{ ...reference, isArtifact: true }],
		}), error);
		assert.deepStrictEqual(artifacts(), [reference]);
	});

	test('restored legacy tool names and single-entry inputs still add, list, promote and remove', async () => {
		const { execute, artifacts } = createHarness();
		const reference = { type: 'file', label: 'Report', isArtifact: false, uri: 'file:///repo/report.md' };
		await execute('add_artifact', reference);
		const id = artifacts()[0].id;
		const listed = await execute('list_artifacts');
		const promoted = await execute('add_artifact', { ...reference, isArtifact: true });
		const removed = await execute('remove_artifact', { id });
		const missing = await execute(ArtifactServerToolName.RemoveArtifactOrReference, { id });

		assert.deepStrictEqual({ listed, promoted, removed, missing, artifacts: artifacts() }, {
			listed: `${id} (file, reference) Report — file:///repo/report.md`,
			promoted: `Promoted artifact: ${id}`,
			removed: `Removed artifact: ${id}`,
			missing: `No artifact or reference with id ${id}.`,
			artifacts: [],
		});
	});

	test('removes a reference with a compact result and retains its display', async () => {
		const { execute, artifacts } = createHarness();
		await execute(ArtifactServerToolName.AddArtifactOrReference, { items: [{ type: 'website', label: 'Docs', isArtifact: false, link: 'https://example.com' }] });
		const id = artifacts()[0].id;
		const result = await execute(ArtifactServerToolName.RemoveArtifactOrReference, { id });

		assert.deepStrictEqual({
			result,
			display: display(ArtifactServerToolName.RemoveArtifactOrReference, { id }, { text: result, success: true }),
			artifacts: artifacts(),
		}, {
			result: `Removed reference: ${id}`,
			display: { displayName: 'Remove Artifact or Reference', invocationMessage: 'Remove artifact or reference', pastTenseMessage: 'Removed reference' },
			artifacts: [],
		});
	});

	test('reports actionable input errors without registering anything', async () => {
		const { execute, artifacts, persisted } = createHarness();
		await assert.rejects(() => execute(ArtifactServerToolName.AddArtifactOrReference, { items: [] }), /items must be a non-empty array/);
		await assert.rejects(() => execute(ArtifactServerToolName.AddArtifactOrReference, {
			items: [{ type: 'website', label: 'Docs', isArtifact: 'false', link: 'https://example.com' }],
		}), /items\[0\]\.isArtifact must be a boolean/);
		await assert.rejects(() => execute(ArtifactServerToolName.AddArtifactOrReference, {
			items: [{ type: 'website', label: 'Docs', isArtifact: false, link: 'file:///repo/docs.md' }],
		}), /items\[0\]\.link must be an http\(s\) URL/);
		await assert.rejects(() => execute(ArtifactServerToolName.RemoveArtifactOrReference, { id: '' }), /id must be a non-empty string/);
		assert.deepStrictEqual({ artifacts: artifacts(), persisted }, { artifacts: [], persisted: [] });
	});

	test('rejects session-management links during execution', async () => {
		const sessionUri = 'copilot:/caller';
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'Caller',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		let persisted = false;
		const group = createArtifactServerToolGroup({
			isEnabled: () => true,
			persist: () => { persisted = true; },
		});

		let errorMessage: string | undefined;
		try {
			await group.execute(stateManager, { sessionUri, chatUri: buildDefaultChatUri(sessionUri), turnId: 'turn-1' }, ArtifactServerToolName.AddArtifactOrReference, {
				type: 'resource',
				label: 'Spawned session',
				isArtifact: true,
				uri: 'agent-host-session://copilot/spawned',
			});
		} catch (error) {
			errorMessage = getErrorMessage(error);
		}

		assert.deepStrictEqual({ errorMessage, persisted }, {
			errorMessage: 'Invalid add_artifact_or_reference input: sessions and chats created with session-management tools must not be recorded as artifacts or references.',
			persisted: false,
		});
	});

	test('names what a completed removal actually removed', () => {
		const removed = (text: string) => display(ArtifactServerToolName.RemoveArtifactOrReference, { id: 'id-1' }, { text, success: true })?.pastTenseMessage;

		assert.deepStrictEqual({
			running: display(ArtifactServerToolName.RemoveArtifactOrReference, { id: 'id-1' }),
			artifact: removed('Removed artifact: id-1 (file, artifact) Plan — file:///repo/plan.md'),
			reference: removed('Removed reference: id-1 (website, reference) Docs — https://example.com'),
			missing: removed('No artifact or reference with id id-1.'),
		}, {
			running: { displayName: 'Remove Artifact or Reference', invocationMessage: 'Remove artifact or reference' },
			artifact: 'Removed artifact',
			reference: 'Removed reference',
			missing: undefined,
		});
	});

	test('keeps the display of a call restored under a pre-rename tool name', () => {
		const displayName = (toolName: string) => getServerToolDisplay(toolName, { label: 'Fix login', isArtifact: true })?.displayName;

		assert.deepStrictEqual({
			current: displayName(ArtifactServerToolName.AddArtifactOrReference),
			legacyAdd: displayName('add_artifact'),
			legacyRemove: getServerToolDisplay('remove_artifact', { id: 'id-1' })?.displayName,
			legacyList: getServerToolDisplay('list_artifacts', undefined)?.displayName,
			// Claude prefixes server tools on the wire; the suffix still resolves.
			transportPrefixed: displayName('mcp__vscode__add_artifact'),
			unknown: displayName('not_a_tool'),
		}, {
			current: 'Add Artifact',
			legacyAdd: 'Add Artifact',
			legacyRemove: 'Remove Artifact or Reference',
			legacyList: 'List Artifacts and References',
			transportPrefixed: 'Add Artifact',
			unknown: undefined,
		});
	});
});
