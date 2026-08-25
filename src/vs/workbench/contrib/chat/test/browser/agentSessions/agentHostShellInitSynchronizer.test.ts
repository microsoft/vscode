/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostShellToolLoadUserProfileSettingId, AgentHostShellToolPythonActivationSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { IShellInitSnippet } from '../../../../../../platform/agentHost/common/shellInitSnippets.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionEnvelope, ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService, type IConfigurationOverrides } from '../../../../../../platform/configuration/common/configuration.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { EnvironmentVariableMutatorType, type IEnvironmentVariableCollection, type IEnvironmentVariableMutator } from '../../../../../../platform/terminal/common/environmentVariable.js';
import { MergedEnvironmentVariableCollection } from '../../../../../../platform/terminal/common/environmentVariableCollection.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IEnvironmentVariableService } from '../../../../terminal/common/environmentVariable.js';
import { AgentHostShellInitSynchronizer } from '../../../browser/agentSessions/agentHost/agentHostShellInitSynchronizer.js';

const PYTHON_EXT = 'ms-python.vscode-python-envs';
const ACTIVATION_VARIABLE = isWindows ? 'VSCODE_PYTHON_PWSH_ACTIVATE' : 'VSCODE_PYTHON_BASH_ACTIVATE';
const FALLBACK_VARIABLE = 'VSCODE_PYTHON_ZSH_ACTIVATE';

class TestSubscription extends Disposable implements IAgentSubscription<SessionState> {
	private readonly _onDidChange = this._register(new Emitter<SessionState>());
	readonly onDidChange = this._onDidChange.event;
	readonly onWillApplyAction = Event.None as Event<ActionEnvelope>;
	readonly onDidApplyAction = Event.None as Event<ActionEnvelope>;

	constructor(private _state: SessionState | undefined) {
		super();
	}

	get value(): SessionState | undefined { return this._state; }
	get verifiedValue(): SessionState | undefined { return this._state; }

	set(state: SessionState): void {
		this._state = state;
		this._onDidChange.fire(state);
	}
}

suite('AgentHostShellInitSynchronizer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const session = URI.parse('copilot:/session');
	const folderA = URI.file('/workspace/a');
	const folderB = URI.file('/workspace/b');

	/** Builds a merged collection holding one activation variable per folder index. */
	function mergedCollection(entries: ReadonlyArray<{ variable: string; value: string; folderIndex?: number; extension?: string }>): MergedEnvironmentVariableCollection {
		const byExtension = new Map<string, Map<string, IEnvironmentVariableMutator>>();
		for (const entry of entries) {
			const extension = entry.extension ?? PYTHON_EXT;
			let existing = byExtension.get(extension);
			if (!existing) {
				existing = new Map<string, IEnvironmentVariableMutator>();
				byExtension.set(extension, existing);
			}
			existing.set(`${entry.variable}:${entry.folderIndex ?? 'global'}`, {
				variable: entry.variable,
				value: entry.value,
				type: EnvironmentVariableMutatorType.Replace,
				...(entry.folderIndex === undefined ? {} : { scope: { workspaceFolder: folder(entry.folderIndex) } }),
			});
		}
		const collections = new Map<string, IEnvironmentVariableCollection>();
		for (const [extension, map] of byExtension) {
			collections.set(extension, { map } as IEnvironmentVariableCollection);
		}
		return new MergedEnvironmentVariableCollection(collections);
	}

	function folder(index: number): IWorkspaceFolder {
		const uri = index === 0 ? folderA : folderB;
		return { uri, index, name: uri.path, toResource: path => URI.joinPath(uri, path) } as IWorkspaceFolder;
	}

	function createSynchronizer(options?: {
		collection?: MergedEnvironmentVariableCollection;
		folders?: readonly IWorkspaceFolder[];
		settings?: Record<string, unknown>;
		onDidChangeCollections?: Event<MergedEnvironmentVariableCollection>;
	}) {
		const dispatched: Array<{ session: string; config: Record<string, unknown> }> = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			override dispatch(sessionUri: string, action: Parameters<IAgentHostService['dispatch']>[1]): void {
				if (action.type === ActionType.SessionConfigChanged) {
					dispatched.push({ session: sessionUri, config: action.config });
				}
			}
		};
		const configurationService = new class extends mock<IConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override getValue<T>(section?: string | IConfigurationOverrides): T {
				return (typeof section === 'string' ? options?.settings?.[section] : undefined) as T;
			}
		};
		const environmentVariableService = new class extends mock<IEnvironmentVariableService>() {
			override readonly onDidChangeCollections = options?.onDidChangeCollections ?? Event.None;
			override get mergedCollection() { return options?.collection ?? mergedCollection([]); }
		};
		const folders = options?.folders ?? [folder(0)];
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace(): IWorkspace {
				return { id: 'workspace', folders: [...folders] } as IWorkspace;
			}
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				return folders.find(candidate => resource.path.startsWith(candidate.uri.path)) ?? null;
			}
		};
		const synchronizer = disposables.add(new AgentHostShellInitSynchronizer(
			agentHostService,
			configurationService,
			environmentVariableService,
			workspaceContextService,
			new NullLogService(),
		));
		return { synchronizer, dispatched };
	}

	function createState(options?: { schema?: boolean; values?: Record<string, unknown>; workingDirectory?: URI; project?: URI }): SessionState {
		return {
			resource: session.toString(),
			config: {
				schema: {
					type: 'object',
					properties: options?.schema === false ? {} : { [SessionConfigKey.ShellInitSnippets]: { type: 'array' } },
				},
				values: options?.values ?? {},
			},
			workingDirectories: options?.workingDirectory ? [options.workingDirectory.toString()] : [folderA.toString()],
			...(options?.project ? { project: { uri: options.project.toString(), displayName: 'p' } } : {}),
		} as unknown as SessionState;
	}

	/** Registers a session and lets the coalescing scheduler run. */
	async function publish(synchronizer: AgentHostShellInitSynchronizer, state: SessionState | undefined): Promise<TestSubscription> {
		const subscription = disposables.add(new TestSubscription(state));
		disposables.add(synchronizer.register({ session, subscription }));
		await timeout(0);
		return subscription;
	}

	function snippetSources(dispatched: ReadonlyArray<{ config: Record<string, unknown> }>): string[][] {
		return dispatched.map(entry => (entry.config[SessionConfigKey.ShellInitSnippets] as IShellInitSnippet[]).map(snippet => snippet.source));
	}

	test('publishes profile and python snippets for the session folder', async () => {
		const { synchronizer, dispatched } = createSynchronizer({
			collection: mergedCollection([{ variable: ACTIVATION_VARIABLE, value: 'source /workspace/a/.venv/bin/activate', folderIndex: 0 }]),
		});
		await publish(synchronizer, createState());

		assert.deepStrictEqual(snippetSources(dispatched), [['user-profile', 'python-env']]);
		const snippets = dispatched[0].config[SessionConfigKey.ShellInitSnippets] as IShellInitSnippet[];
		assert.ok(snippets[1].script.includes('/workspace/a/.venv/bin/activate'), snippets[1].script);
	});

	test('omits the python snippet when the folder has no activation', async () => {
		const { synchronizer, dispatched } = createSynchronizer();
		await publish(synchronizer, createState());

		assert.deepStrictEqual(snippetSources(dispatched), [['user-profile']]);
	});

	test('matches the activation variable to the session folder in a multi-root workspace', async () => {
		const { synchronizer, dispatched } = createSynchronizer({
			folders: [folder(0), folder(1)],
			collection: mergedCollection([
				{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folderIndex: 0 },
				{ variable: ACTIVATION_VARIABLE, value: 'activate-b', folderIndex: 1 },
			]),
		});
		await publish(synchronizer, createState({ workingDirectory: folderB }));

		const snippets = dispatched[0].config[SessionConfigKey.ShellInitSnippets] as IShellInitSnippet[];
		assert.ok(snippets.some(snippet => snippet.script.includes('activate-b')), JSON.stringify(snippets));
		assert.ok(!snippets.some(snippet => snippet.script.includes('activate-a')), JSON.stringify(snippets));
	});

	test('resolves a worktree-isolated session through its originating project', async () => {
		const { synchronizer, dispatched } = createSynchronizer({
			collection: mergedCollection([{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folderIndex: 0 }]),
		});
		// The worktree path is not a workspace folder, but the interpreter was
		// selected against the project the session came from.
		await publish(synchronizer, createState({ workingDirectory: URI.file('/tmp/worktree-1'), project: folderA }));

		const snippets = dispatched[0].config[SessionConfigKey.ShellInitSnippets] as IShellInitSnippet[];
		assert.ok(snippets.some(snippet => snippet.script.includes('activate-a')), JSON.stringify(snippets));
	});

	test('ignores an activation variable published by another extension', async () => {
		const { synchronizer, dispatched } = createSynchronizer({
			collection: mergedCollection([{ variable: ACTIVATION_VARIABLE, value: 'rm -rf /', folderIndex: 0, extension: 'some.other-extension' }]),
		});
		await publish(synchronizer, createState());

		assert.deepStrictEqual(snippetSources(dispatched), [['user-profile']]);
	});

	test('does not publish when the host does not advertise the key', async () => {
		const { synchronizer, dispatched } = createSynchronizer();
		await publish(synchronizer, createState({ schema: false }));

		assert.deepStrictEqual(dispatched, []);
	});

	test('publishes once the schema arrives after hydration', async () => {
		const { synchronizer, dispatched } = createSynchronizer();
		const subscription = await publish(synchronizer, createState({ schema: false }));
		assert.deepStrictEqual(dispatched, []);

		subscription.set(createState());
		await timeout(0);

		assert.deepStrictEqual(snippetSources(dispatched), [['user-profile']]);
	});

	test('does not redispatch a value the session already holds', async () => {
		const { synchronizer, dispatched } = createSynchronizer();
		const subscription = await publish(synchronizer, createState());
		assert.strictEqual(dispatched.length, 1);

		// Simulates the host echoing the value back, or another window having
		// published it first. Redispatching would start a cross-window loop.
		subscription.set(createState({ values: dispatched[0].config }));
		await timeout(0);

		assert.strictEqual(dispatched.length, 1);
	});

	test('does not publish an empty list to a session that never had one', async () => {
		const { synchronizer, dispatched } = createSynchronizer({
			settings: {
				[AgentHostShellToolLoadUserProfileSettingId]: false,
				[AgentHostShellToolPythonActivationSettingId]: false,
			},
		});
		await publish(synchronizer, createState());

		assert.deepStrictEqual(dispatched, []);
	});

	test('clears a previously published value when both settings are disabled', async () => {
		const { synchronizer, dispatched } = createSynchronizer({
			settings: {
				[AgentHostShellToolLoadUserProfileSettingId]: false,
				[AgentHostShellToolPythonActivationSettingId]: false,
			},
		});
		await publish(synchronizer, createState({ values: { [SessionConfigKey.ShellInitSnippets]: [{ shell: 'bash', script: 'x', source: 'python-env' }] } }));

		assert.deepStrictEqual(dispatched.map(entry => entry.config), [{ [SessionConfigKey.ShellInitSnippets]: [] }]);
	});

	test('republishes when the environment collection changes', async () => {
		const onDidChange = disposables.add(new Emitter<MergedEnvironmentVariableCollection>());
		let collection = mergedCollection([]);
		const { synchronizer, dispatched } = createSynchronizer({
			onDidChangeCollections: onDidChange.event,
			get collection() { return collection; },
		} as Parameters<typeof createSynchronizer>[0]);
		await publish(synchronizer, createState());
		assert.deepStrictEqual(snippetSources(dispatched), [['user-profile']]);

		collection = mergedCollection([{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folderIndex: 0 }]);
		onDidChange.fire(collection);
		await timeout(0);

		assert.deepStrictEqual(snippetSources(dispatched), [['user-profile'], ['user-profile', 'python-env']]);
	});

	(isWindows ? test.skip : test)('falls back to the zsh variable when only it is published', async () => {
		const { synchronizer, dispatched } = createSynchronizer({
			collection: mergedCollection([{ variable: FALLBACK_VARIABLE, value: 'source /workspace/a/.venv/bin/activate', folderIndex: 0 }]),
		});
		await publish(synchronizer, createState());

		// The extension emits identical text for bash and zsh, so the fallback is
		// safe for the bash shell the tool actually spawns.
		const snippets = dispatched[0].config[SessionConfigKey.ShellInitSnippets] as IShellInitSnippet[];
		assert.ok(snippets.some(snippet => snippet.script.includes('/workspace/a/.venv/bin/activate')), JSON.stringify(snippets));
	});

	test('stops publishing once the registration is disposed', async () => {
		const onDidChange = disposables.add(new Emitter<MergedEnvironmentVariableCollection>());
		const { synchronizer, dispatched } = createSynchronizer({ onDidChangeCollections: onDidChange.event });
		const subscription = disposables.add(new TestSubscription(createState()));
		const registration = synchronizer.register({ session, subscription });
		await timeout(0);
		const afterFirst = dispatched.length;

		registration.dispose();
		onDidChange.fire(mergedCollection([]));
		await timeout(0);

		assert.strictEqual(dispatched.length, afterFirst);
	});
});
