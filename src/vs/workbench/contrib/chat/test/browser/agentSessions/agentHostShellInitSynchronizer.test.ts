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
import type { IShellInitScript } from '../../../../../../platform/agentHost/common/shellInitScript.js';
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
					properties: options?.schema === false ? {} : { [SessionConfigKey.ShellInitSnippets]: { type: 'array' } },
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
	}) {
		const dispatched: Record<string, unknown>[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			override dispatch(_uri: string, action: Parameters<IAgentHostService['dispatch']>[1]): void {
				if (action.type === ActionType.SessionConfigChanged) {
					dispatched.push(action.config);
				}
			}
		};
		const configurationService = new class extends mock<IConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override getValue<T>(section?: string | IConfigurationOverrides): T {
				return (section === AgentHostShellToolInitScriptEnabledSettingId ? options?.enabled : undefined) as T;
			}
		};
		const environmentService = new class extends mock<IEnvironmentVariableService>() {
			override readonly onDidChangeCollections = options?.onDidChangeCollections ?? Event.None;
			override readonly mergedCollection = options?.collection ?? collection([]);
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
		return dispatched.at(-1)?.[SessionConfigKey.ShellInitSnippets] as readonly IShellInitScript[];
	}

	test('publishes one combined script with the folder-scoped Python activation', async () => {
		const { synchronizer, dispatched } = create({
			collection: collection([{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folder: folderA }]),
		});
		await register(synchronizer, state());
		assert.strictEqual(scripts(dispatched).length, 1);
		assert.ok(scripts(dispatched)[0].script.includes('activate-a'));
		assert.ok(scripts(dispatched)[0].script.indexOf('.bashrc') < scripts(dispatched)[0].script.indexOf('activate-a'));
	});

	test('reconcile publishes synchronously before the first turn', () => {
		const { synchronizer, dispatched } = create();
		const subscription = disposables.add(new TestSubscription(state()));
		disposables.add(synchronizer.register(session, subscription));

		synchronizer.reconcile(session);

		assert.strictEqual(dispatched.length, 1);
	});

	test('uses the session folder in a multi-root workspace and project for worktrees', async () => {
		const { synchronizer, dispatched } = create({
			folders: [folderA, folderB],
			collection: collection([
				{ variable: ACTIVATION_VARIABLE, value: 'activate-a', folder: folderA },
				{ variable: ACTIVATION_VARIABLE, value: 'activate-b', folder: folderB },
			]),
		});
		await register(synchronizer, state({ cwd: URI.file('/tmp/worktree'), project: folderB.uri }));
		assert.ok(scripts(dispatched)[0].script.includes('activate-b'));
		assert.ok(!scripts(dispatched)[0].script.includes('activate-a'));
	});

	test('ignores activation published by another extension', async () => {
		const { synchronizer, dispatched } = create({
			collection: collection([{ variable: ACTIVATION_VARIABLE, value: 'unsafe', folder: folderA, extension: 'other.extension' }]),
		});
		await register(synchronizer, state());
		assert.ok(!scripts(dispatched)[0].script.includes('unsafe'));
	});

	test('waits for schema hydration and does not redispatch the echoed value', async () => {
		const { synchronizer, dispatched } = create();
		const subscription = await register(synchronizer, state({ schema: false }));
		assert.deepStrictEqual(dispatched, []);

		subscription.set(state());
		await timeout(0);
		assert.strictEqual(dispatched.length, 1);

		subscription.set(state({ values: dispatched[0] }));
		await timeout(0);
		assert.strictEqual(dispatched.length, 1);
	});

	test('does not publish from a window that does not own the session folder', async () => {
		const { synchronizer, dispatched } = create({ folders: [folderB] });
		await register(synchronizer, state());
		assert.deepStrictEqual(dispatched, []);
	});

	test('the single setting clears the script when disabled', async () => {
		const { synchronizer, dispatched } = create({ enabled: false });
		await register(synchronizer, state({
			values: { [SessionConfigKey.ShellInitSnippets]: [{ shell: 'bash', script: 'old' }] },
		}));
		assert.deepStrictEqual(dispatched, [{ [SessionConfigKey.ShellInitSnippets]: [] }]);
	});

	test('a non-owning window with the setting disabled does not clear the script', async () => {
		// A clearing dispatch from a non-owning window would fight the owning
		// window, which re-publishes its script on every echoed update.
		const { synchronizer, dispatched } = create({ enabled: false, folders: [folderB] });
		await register(synchronizer, state({
			values: { [SessionConfigKey.ShellInitSnippets]: [{ shell: 'bash', script: 'old' }] },
		}));
		assert.deepStrictEqual(dispatched, []);
	});

	test('does not publish from the Agents window', async () => {
		const { synchronizer, dispatched } = create({ sessionsWindow: true });
		await register(synchronizer, state());
		assert.deepStrictEqual(dispatched, []);
	});

	test('does not publish when the Agent Host can run on a remote OS', async () => {
		const { synchronizer, dispatched } = create({ remoteAuthority: 'ssh-remote+host' });
		await register(synchronizer, state());
		assert.deepStrictEqual(dispatched, []);
	});

	(isWindows ? test.skip : test)('ignores the zsh activation value under bash', async () => {
		const { synchronizer, dispatched } = create({
			collection: collection([{ variable: 'VSCODE_PYTHON_ZSH_ACTIVATE', value: 'activate-zsh', folder: folderA }]),
		});
		await register(synchronizer, state());
		assert.ok(!scripts(dispatched)[0].script.includes('activate-zsh'));
	});
});
