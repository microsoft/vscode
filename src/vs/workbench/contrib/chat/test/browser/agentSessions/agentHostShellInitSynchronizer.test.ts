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
import { AgentHostShellToolInitScriptEnabledSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { createShellInitScript, type IShellInitScript, type ShellInitScriptShell } from '../../../../../../platform/agentHost/common/shellInitScript.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionEnvelope, ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService, type IConfigurationOverrides } from '../../../../../../platform/configuration/common/configuration.js';
import { EnvironmentVariableMutatorType, type IEnvironmentVariableCollection, type IEnvironmentVariableMutator } from '../../../../../../platform/terminal/common/environmentVariable.js';
import { MergedEnvironmentVariableCollection } from '../../../../../../platform/terminal/common/environmentVariableCollection.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IEnvironmentVariableService } from '../../../../terminal/common/environmentVariable.js';
import { AgentHostShellInitSynchronizer } from '../../../browser/agentSessions/agentHost/agentHostShellInitSynchronizer.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

const PYTHON_EXTENSION = 'ms-python.vscode-python-envs';
const ACTIVATION_VARIABLE = isWindows ? 'VSCODE_PYTHON_PWSH_ACTIVATE' : 'VSCODE_PYTHON_BASH_ACTIVATE';
const TOOL_SHELL: ShellInitScriptShell = isWindows ? 'powershell' : 'bash';

class TestSubscription extends Disposable implements IAgentSubscription<SessionState> {
	private readonly _onDidChange = this._register(new Emitter<SessionState>());
	readonly onDidChange = this._onDidChange.event;
	readonly onWillApplyAction = Event.None as Event<ActionEnvelope>;
	readonly onDidApplyAction = Event.None as Event<ActionEnvelope>;

	constructor(private _state: SessionState) { super(); }
	get value(): SessionState { return this._state; }
	get verifiedValue(): SessionState { return this._state; }
	set(state: SessionState): void { this._state = state; this._onDidChange.fire(state); }
}

suite('AgentHostShellInitSynchronizer', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('copilot:/session');
	const folderA = folder('/workspace/a', 0);
	const folderB = folder('/workspace/b', 1);

	function folder(path: string, index: number): IWorkspaceFolder {
		const uri = URI.file(path);
		return { uri, index, name: path, toResource: relative => URI.joinPath(uri, relative) } as IWorkspaceFolder;
	}

	function collection(entries: ReadonlyArray<{ variable: string; value: string; folder: IWorkspaceFolder; extension?: string }>): MergedEnvironmentVariableCollection {
		const collections = new Map<string, IEnvironmentVariableCollection>();
		for (const entry of entries) {
			const extension = entry.extension ?? PYTHON_EXTENSION;
			const existing = collections.get(extension)?.map as Map<string, IEnvironmentVariableMutator> | undefined ?? new Map();
			existing.set(`${entry.variable}:${entry.folder.index}`, {
				variable: entry.variable,
				value: entry.value,
				type: EnvironmentVariableMutatorType.Replace,
				scope: { workspaceFolder: entry.folder },
			});
			collections.set(extension, { map: existing } as IEnvironmentVariableCollection);
		}
		return new MergedEnvironmentVariableCollection(collections);
	}

	function state(options?: { schema?: boolean; values?: Record<string, unknown>; cwd?: URI; project?: URI }): SessionState {
		return {
			resource: session.toString(),
			config: {
				schema: {
					type: 'object',
					properties: options?.schema === false ? {} : { [SessionConfigKey.ShellInitScripts]: { type: 'array' } },
				},
				values: options?.values ?? {},
			},
			workingDirectories: [(options?.cwd ?? folderA.uri).toString()],
			...(options?.project ? { project: { uri: options.project.toString(), displayName: 'project' } } : {}),
		} as unknown as SessionState;
	}

	function create(options?: {
		collection?: MergedEnvironmentVariableCollection;
		folders?: readonly IWorkspaceFolder[];
		enabled?: boolean;
		sessionsWindow?: boolean;
		remoteAuthority?: string;
		onDidChangeCollections?: Event<MergedEnvironmentVariableCollection>;
		onDispatch?: (config: Record<string, unknown>) => void;
		getCollection?: () => MergedEnvironmentVariableCollection;
	}) {
		const dispatched: Record<string, unknown>[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			override dispatch(_uri: string, action: Parameters<IAgentHostService['dispatch']>[1]): void {
				if (action.type === ActionType.SessionConfigChanged) {
					dispatched.push(action.config);
					options?.onDispatch?.(action.config);
				}
			}
		};
		const configurationService = new class extends mock<IConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override getValue<T>(section?: string | IConfigurationOverrides): T {
				return (section === AgentHostShellToolInitScriptEnabledSettingId ? options?.enabled ?? false : undefined) as T;
			}
		};
		const environmentService = new class extends mock<IEnvironmentVariableService>() {
			override readonly onDidChangeCollections = options?.onDidChangeCollections ?? Event.None;
			override get mergedCollection() { return options?.getCollection?.() ?? options?.collection ?? collection([]); }
		};
		const folders = options?.folders ?? [folderA];
		const workspaceService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				return folders.find(candidate => resource.path.startsWith(candidate.uri.path)) ?? null;
			}
		};
		return {
			dispatched,
			synchronizer: disposables.add(new AgentHostShellInitSynchronizer(
				agentHostService,
				configurationService,
				environmentService,
				workspaceService,
				{ isSessionsWindow: options?.sessionsWindow === true, remoteAuthority: options?.remoteAuthority } as IWorkbenchEnvironmentService,
			)),
		};
	}

	async function register(synchronizer: AgentHostShellInitSynchronizer, initial: SessionState): Promise<TestSubscription> {
		const subscription = disposables.add(new TestSubscription(initial));
		disposables.add(synchronizer.register(session, subscription));
		await timeout(0);
		return subscription;
	}

	function scripts(dispatched: readonly Record<string, unknown>[]): readonly IShellInitScript[] {
		return dispatched.at(-1)?.[SessionConfigKey.ShellInitScripts] as readonly IShellInitScript[];
	}

	test('publishes one combined script with the folder-scoped Python activation', async () => {
		const { synchronizer, dispatched } = create({
			enabled: true,
			collection: collection([{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folder: folderA }]),
		});
		await register(synchronizer, state());
		const published = scripts(dispatched)[0];
		const profileMarker = isWindows ? '$PROFILE.CurrentUserAllHosts' : '.bashrc';
		const activationMarker = isWindows ? 'FromBase64String' : 'activate-a';
		assert.deepStrictEqual({
			scripts: scripts(dispatched),
			profileBeforeActivation: published.script.includes(profileMarker)
				&& published.script.includes(activationMarker)
				&& published.script.indexOf(profileMarker) < published.script.indexOf(activationMarker),
		}, {
			scripts: [createShellInitScript(TOOL_SHELL, 'activate-a')],
			profileBeforeActivation: true,
		});
	});

	test('publishes a changed activation when environment collections change', async () => {
		let currentCollection = collection([{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folder: folderA }]);
		const collectionsChanged = disposables.add(new Emitter<MergedEnvironmentVariableCollection>());
		const { synchronizer, dispatched } = create({
			enabled: true,
			getCollection: () => currentCollection,
			onDidChangeCollections: collectionsChanged.event,
		});
		const subscription = await register(synchronizer, state());
		subscription.set(state({ values: dispatched[0] }));
		await timeout(0);

		currentCollection = collection([{ variable: ACTIVATION_VARIABLE, value: 'activate-b', folder: folderA }]);
		collectionsChanged.fire(currentCollection);
		await timeout(0);

		assert.deepStrictEqual({
			dispatches: dispatched.length,
			scripts: scripts(dispatched),
		}, {
			dispatches: 2,
			scripts: [createShellInitScript(TOOL_SHELL, 'activate-b')],
		});
	});

	test('reconcile publishes synchronously before the first turn', () => {
		const { synchronizer, dispatched } = create({ enabled: true });
		const subscription = disposables.add(new TestSubscription(state()));
		disposables.add(synchronizer.register(session, subscription));

		synchronizer.reconcile(session);

		assert.strictEqual(dispatched.length, 1);
	});

	test('uses the session folder in a multi-root workspace and project for worktrees', async () => {
		const { synchronizer, dispatched } = create({
			enabled: true,
			folders: [folderA, folderB],
			collection: collection([
				{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folder: folderA },
				{ variable: ACTIVATION_VARIABLE, value: 'activate-b', folder: folderB },
			]),
		});
		await register(synchronizer, state({ cwd: URI.file('/tmp/worktree'), project: folderB.uri }));
		assert.deepStrictEqual(scripts(dispatched), [createShellInitScript(TOOL_SHELL, 'activate-b')]);
	});

	test('ignores activation published by another extension', async () => {
		const { synchronizer, dispatched } = create({
			enabled: true,
			collection: collection([{ variable: ACTIVATION_VARIABLE, value: 'unsafe', folder: folderA, extension: 'other.extension' }]),
		});
		await register(synchronizer, state());
		assert.ok(!scripts(dispatched)[0].script.includes('unsafe'));
	});

	test('waits for schema hydration and does not redispatch the echoed value', async () => {
		const { synchronizer, dispatched } = create({ enabled: true });
		const subscription = await register(synchronizer, state({ schema: false }));
		assert.deepStrictEqual(dispatched, []);

		subscription.set(state());
		await timeout(0);
		assert.strictEqual(dispatched.length, 1);

		subscription.set(state({ values: dispatched[0] }));
		await timeout(0);
		assert.strictEqual(dispatched.length, 1);
	});

	test('two same-folder windows with different activation do not ping-pong on echoes', async () => {
		const subscriptionA = disposables.add(new TestSubscription(state()));
		const subscriptionB = disposables.add(new TestSubscription(state()));
		const echo = (config: Record<string, unknown>) => {
			subscriptionA.set(state({ values: config }));
			subscriptionB.set(state({ values: config }));
		};
		const windowA = create({
			enabled: true,
			collection: collection([{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folder: folderA }]),
			onDispatch: echo,
		});
		const windowB = create({
			enabled: true,
			collection: collection([{ variable: ACTIVATION_VARIABLE, value: 'activate-b', folder: folderA }]),
			onDispatch: echo,
		});
		disposables.add(windowA.synchronizer.register(session, subscriptionA));
		disposables.add(windowB.synchronizer.register(session, subscriptionB));

		await timeout(0);
		await timeout(0);

		// Each initial local publish may win once. Echoes do not schedule a
		// counter-publish, so the count remains bounded and converges.
		assert.strictEqual(windowA.dispatched.length + windowB.dispatched.length, 2);
	});

	test('does not publish from a window that does not own the session folder', async () => {
		const { synchronizer, dispatched } = create({ enabled: true, folders: [folderB] });
		await register(synchronizer, state());
		assert.deepStrictEqual(dispatched, []);
	});

	test('the single setting clears the script when disabled', async () => {
		const { synchronizer, dispatched } = create({ enabled: false });
		await register(synchronizer, state({
			values: { [SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'old' }] },
		}));
		assert.deepStrictEqual(dispatched, [{ [SessionConfigKey.ShellInitScripts]: [] }]);
	});

	test('the experimental setting is disabled by default', async () => {
		const { synchronizer, dispatched } = create();
		await register(synchronizer, state());
		assert.deepStrictEqual(dispatched, []);
	});

	test('a non-owning local window can clear the script when disabled', async () => {
		const { synchronizer, dispatched } = create({ enabled: false, folders: [folderB] });
		await register(synchronizer, state({
			values: { [SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'old' }] },
		}));
		assert.deepStrictEqual(dispatched, [{ [SessionConfigKey.ShellInitScripts]: [] }]);
	});

	test('does not publish a script from the Agents window even when it owns the session folder', async () => {
		// The Agents window mounts the active session folder into its workspace,
		// so folder ownership alone would otherwise qualify it as a publisher.
		const { synchronizer, dispatched } = create({
			enabled: true,
			sessionsWindow: true,
			folders: [folderA],
			collection: collection([{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folder: folderA }]),
		});
		await register(synchronizer, state());
		assert.deepStrictEqual(dispatched, []);
	});

	test('the Agents window can clear a stale script when disabled', async () => {
		const { synchronizer, dispatched } = create({ enabled: false, sessionsWindow: true, folders: [] });
		await register(synchronizer, state({
			values: { [SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'old' }] },
		}));
		assert.deepStrictEqual(dispatched, [{ [SessionConfigKey.ShellInitScripts]: [] }]);
	});

	test('does not publish when the Agent Host can run on a remote OS', async () => {
		const { synchronizer, dispatched } = create({ enabled: true, remoteAuthority: 'ssh-remote+host' });
		await register(synchronizer, state());
		assert.deepStrictEqual(dispatched, []);
	});

	(isWindows ? test.skip : test)('ignores the zsh activation value under bash', async () => {
		const { synchronizer, dispatched } = create({
			enabled: true,
			collection: collection([{ variable: 'VSCODE_PYTHON_ZSH_ACTIVATE', value: 'activate-zsh', folder: folderA }]),
		});
		await register(synchronizer, state());
		assert.ok(!scripts(dispatched)[0].script.includes('activate-zsh'));
	});
});
