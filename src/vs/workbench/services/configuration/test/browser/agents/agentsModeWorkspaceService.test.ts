/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../base/common/errors.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullPolicyService } from '../../../../../../platform/policy/common/policy.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { UriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { FileUserDataProvider } from '../../../../../../platform/userData/common/fileUserDataProvider.js';
import { toUserDataProfile, UserDataProfilesService } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceContextService, IWorkspaceIdentifier, toWorkspaceIdentifier, WorkbenchMode, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { TestEnvironmentService, TestTextFileService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITextFileService } from '../../../../textfile/common/textfiles.js';
import { TextModelResolverService } from '../../../../textmodelResolver/common/textModelResolverService.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { RemoteAgentService } from '../../../../remote/browser/remoteAgentService.js';
import { IRemoteAgentService } from '../../../../remote/common/remoteAgentService.js';
import { UserDataProfileService } from '../../../../userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../../../../userDataProfile/common/userDataProfile.js';
import { AGENTS_MODE_ENABLED_SETTING, agentsModeEnabledConfiguration, AgentsModeWorkspaceService } from '../../../browser/agents/agentsModeWorkspaceService.js';
import { WorkspaceService } from '../../../browser/configurationService.js';
import { IConfigurationCache } from '../../../common/configuration.js';
import { ConfigurationEditingError, ConfigurationEditingErrorCode } from '../../../common/configurationEditing.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

suite('AgentsModeWorkspaceService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const configurationCache: IConfigurationCache = { needsCaching: () => false, read: async () => '', write: async () => { }, remove: async () => { } };

	let fileService: FileService;
	let applicationSettingsResource: URI;
	let profileSettingsResource: URI;
	let testObject: AgentsModeWorkspaceService;
	let userDataProfileService: UserDataProfileService;

	suiteSetup(() => {
		configurationRegistry.registerConfiguration(agentsModeEnabledConfiguration);
		configurationRegistry.registerConfiguration({
			id: '_test_agentsMode',
			type: 'object',
			properties: {
				'agentsMode.modeDefault': { type: 'boolean', default: false, agentsMode: { default: true }, agentsWindow: { default: false } },
				'agentsMode.agentsDefault': { type: 'string', default: 'editor', agentsWindow: { default: 'agents' } },
				'agentsMode.userWins': { type: 'boolean', default: false, agentsMode: { default: true } },
				'agentsMode.readOnly': { type: 'string', default: 'editor', agentsWindow: { default: 'agents', readOnly: true } },
				'agentsMode.modeReadOnly': { type: 'string', default: 'editor', agentsMode: { default: 'mode', readOnly: true } },
				'agentsMode.application': { type: 'string', default: 'isSet', scope: ConfigurationScope.APPLICATION },
				'agentsMode.applicationReadOnly': { type: 'string', default: 'editor', scope: ConfigurationScope.APPLICATION, agentsMode: { default: 'mode', readOnly: true } },
				'agentsMode.folderSetting': { type: 'string', default: 'default', scope: ConfigurationScope.RESOURCE },
				'agentsMode.languageSetting': { type: 'string', default: 'default', scope: ConfigurationScope.LANGUAGE_OVERRIDABLE },
			}
		});
	});

	suiteTeardown(() => configurationRegistry.deregisterConfigurations([agentsModeEnabledConfiguration]));

	setup(async () => {
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const environmentService = TestEnvironmentService;
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService))));
		// A non-default profile, so that application settings come from the default profile's settings
		userDataProfileService = disposables.add(new UserDataProfileService(toUserDataProfile('custom', 'custom', joinPath(environmentService.userRoamingDataHome, 'profiles', 'custom'), joinPath(environmentService.cacheHome, 'profilesCache'))));
		applicationSettingsResource = userDataProfilesService.defaultProfile.settingsResource;
		profileSettingsResource = userDataProfileService.currentProfile.settingsResource;
		await fileService.writeFile(applicationSettingsResource, VSBuffer.fromString('{ "agentsMode.application": "applicationValue", "agentsMode.applicationReadOnly": "user" }'));
		await fileService.writeFile(profileSettingsResource, VSBuffer.fromString('{ "agentsMode.userWins": false, "agentsMode.readOnly": "user", "agentsMode.modeReadOnly": "user" }'));

		const policyService = new NullPolicyService();
		const editor = disposables.add(new WorkspaceService({ configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService));
		const emptyWorkspace = { id: 'empty-window' };
		await editor.initialize(emptyWorkspace);
		testObject = disposables.add(new AgentsModeWorkspaceService(editor, { userDataProfileService, userDataProfilesService, uriIdentityService, fileService, policyService, logService, configurationCache, environmentService }));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, testObject);
		instantiationService.stub(IConfigurationService, testObject);
		// Settings editing in the editor goes through the text file stack, so it must use this file service and profile
		instantiationService.stub(IUserDataProfileService, userDataProfileService);
		instantiationService.stub(ITextFileService, disposables.add(instantiationService.createInstance(TestTextFileService)));
		instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
		testObject.acquireInstantiationService(instantiationService);
	});

	function snapshot() {
		return {
			mode: testObject.isAgentsMode,
			workspaceId: testObject.getWorkspace().id,
			state: testObject.getWorkbenchState(),
			scope: testObject.getWorkbenchScope(),
			workbenchMode: testObject.getWorkbenchMode(),
			modeDefault: testObject.getValue('agentsMode.modeDefault'),
			agentsDefault: testObject.getValue('agentsMode.agentsDefault'),
			userWins: testObject.getValue('agentsMode.userWins'),
			readOnly: testObject.getValue('agentsMode.readOnly'),
			modeReadOnly: testObject.getValue('agentsMode.modeReadOnly'),
		};
	}

	test('switches in place with the same workspace identity and fires change events', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const events: string[] = [];
		disposables.add(testObject.onDidChangeWorkbenchState(state => events.push(`state:${state}`)));
		disposables.add(testObject.onDidChangeWorkbenchScope(scope => events.push(`scope:${scope}`)));
		disposables.add(testObject.onDidChangeWorkbenchMode(mode => events.push(`workbenchMode:${mode}`)));
		disposables.add(testObject.onWillChangeAgentsMode(enabled => events.push(`willMode:${enabled}`)));
		disposables.add(testObject.onDidChangeAgentsMode(enabled => events.push(`mode:${enabled}`)));
		disposables.add(testObject.onDidChangeConfiguration(e => {
			for (const key of ['agentsMode.modeDefault', 'agentsMode.agentsDefault', 'agentsMode.userWins', 'agentsMode.readOnly', 'agentsMode.modeReadOnly']) {
				if (e.affectsConfiguration(key)) {
					events.push(`config:${key}`);
				}
			}
		}));

		const before = snapshot();
		await testObject.setAgentsMode(true);
		const inMode = snapshot();
		await testObject.setAgentsMode(false);
		const after = snapshot();

		assert.deepStrictEqual({ before, inMode, after, events }, {
			before: { mode: false, workspaceId: 'empty-window', state: WorkbenchState.EMPTY, scope: undefined, workbenchMode: WorkbenchMode.Editor, modeDefault: false, agentsDefault: 'editor', userWins: false, readOnly: 'user', modeReadOnly: 'user' },
			// About all sessions (no scope) as the empty window is; only agentsMode overrides apply: a default (the user's value still wins) and a read-only default (the user's value does not); Agents window overrides do not
			inMode: { mode: true, workspaceId: 'empty-window', state: WorkbenchState.WORKSPACE, scope: undefined, workbenchMode: WorkbenchMode.Agents, modeDefault: true, agentsDefault: 'editor', userWins: false, readOnly: 'user', modeReadOnly: 'mode' },
			after: { mode: false, workspaceId: 'empty-window', state: WorkbenchState.EMPTY, scope: undefined, workbenchMode: WorkbenchMode.Editor, modeDefault: false, agentsDefault: 'editor', userWins: false, readOnly: 'user', modeReadOnly: 'user' },
			events: [
				'willMode:true', `state:${WorkbenchState.WORKSPACE}`, `workbenchMode:${WorkbenchMode.Agents}`, 'config:agentsMode.modeDefault', 'config:agentsMode.modeReadOnly', 'mode:true',
				'willMode:false', `state:${WorkbenchState.EMPTY}`, `workbenchMode:${WorkbenchMode.Editor}`, 'config:agentsMode.modeDefault', 'config:agentsMode.modeReadOnly', 'mode:false',
			],
		});
	}));

	test('refuses writing a setting that is read-only in Agents mode, only in the mode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.setAgentsMode(true);
		const inMode = await testObject.updateValue('agentsMode.modeReadOnly', 'changed').then(() => 'written', error => error.message);
		await testObject.setAgentsMode(false);
		await testObject.updateValue('agentsMode.modeReadOnly', 'changed');
		assert.deepStrictEqual({ inMode, editor: testObject.getValue('agentsMode.modeReadOnly') }, {
			inMode: 'Unable to write agentsMode.modeReadOnly because it is read-only in Agents mode.',
			editor: 'changed',
		});
	}));

	test('keeps the editor scope apart from the mode scope, fires only on a change, and is about all sessions again on entering the mode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const events: string[] = [];
		disposables.add(testObject.onDidChangeWorkbenchScope(scope => events.push(`scope:${scope?.path}`)));
		const scope = URI.file('/work/app');

		testObject.setWorkbenchScope(scope);
		const editor = testObject.getWorkbenchScope()?.path;
		await testObject.setAgentsMode(true);
		testObject.setWorkbenchScope(scope);
		testObject.setWorkbenchScope(URI.file('/work/app'));
		const inMode = testObject.getWorkbenchScope()?.path;
		await testObject.setAgentsMode(false);
		const left = testObject.getWorkbenchScope()?.path;
		await testObject.setAgentsMode(true);
		const entered = testObject.getWorkbenchScope()?.path;
		await testObject.setAgentsMode(false);

		assert.deepStrictEqual({ editor, inMode, left, entered, events }, {
			editor: '/work/app',
			inMode: '/work/app',
			left: '/work/app',
			entered: undefined,
			events: ['scope:/work/app', 'scope:undefined', 'scope:/work/app', 'scope:undefined', 'scope:/work/app'],
		});
	}));

	test('completes the switch when a change listener throws', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const errors: string[] = [];
		const events: string[] = [];
		const unexpectedErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => errors.push(error.message));
		try {
			disposables.add(testObject.onDidChangeWorkbenchState(() => { throw new Error('state listener failed'); }));
			disposables.add(testObject.onDidChangeWorkbenchMode(mode => events.push(`workbenchMode:${mode}`)));
			disposables.add(testObject.onDidChangeAgentsMode(enabled => events.push(`mode:${enabled}`)));

			await testObject.setAgentsMode(true);

			assert.deepStrictEqual({ workbenchMode: testObject.getWorkbenchMode(), events, errors }, {
				workbenchMode: WorkbenchMode.Agents,
				events: [`workbenchMode:${WorkbenchMode.Agents}`, 'mode:true'],
				errors: ['state listener failed'],
			});
		} finally {
			setUnexpectedErrorHandler(unexpectedErrorHandler);
		}
	}));

	test('reads and writes application settings of a non-default profile in the mode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.setAgentsMode(true);
		const read = testObject.getValue('agentsMode.application');
		await testObject.updateValue('agentsMode.application', 'written', ConfigurationTarget.USER);

		assert.deepStrictEqual({
			read,
			readBack: testObject.getValue('agentsMode.application'),
			applicationSettings: JSON.parse((await fileService.readFile(applicationSettingsResource)).value.toString()),
		}, {
			read: 'applicationValue',
			readBack: 'written',
			applicationSettings: { 'agentsMode.application': 'written', 'agentsMode.applicationReadOnly': 'user' },
		});
	}));

	test('ignores the user\'s value of an application setting that is read-only in the mode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const editor = testObject.getValue('agentsMode.applicationReadOnly');
		await testObject.setAgentsMode(true);
		assert.deepStrictEqual({ editor, inMode: testObject.getValue('agentsMode.applicationReadOnly') }, { editor: 'user', inMode: 'mode' });
	}));

	test('refuses workspace settings writes in the mode like an empty window', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.setAgentsMode(true);

		await assert.rejects(testObject.updateValue('agentsMode.modeDefault', 'written', ConfigurationTarget.WORKSPACE), (error: ConfigurationEditingError) => error.code === ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED);
	}));

	test('keeps the mounted folders when the profile changes in the mode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.setAgentsMode(true);
		const folder = joinPath(ROOT, 'folder');
		await testObject.addFolders([{ uri: folder }]);
		const folderEvents: number[] = [];
		disposables.add(testObject.onDidChangeWorkspaceFolders(e => folderEvents.push(e.added.length + e.removed.length)));

		await userDataProfileService.updateCurrentProfile(toUserDataProfile('other', 'other', joinPath(TestEnvironmentService.userRoamingDataHome, 'profiles', 'other'), joinPath(TestEnvironmentService.cacheHome, 'profilesCache')));

		assert.deepStrictEqual({ folders: testObject.getWorkspace().folders.map(f => f.uri.toString()), folderEvents }, { folders: [folder.toString()], folderEvents: [] });
	}));

	test('keeps the empty window identity with one mounted folder in the mode', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.setAgentsMode(true);
		await testObject.addFolders([{ uri: joinPath(ROOT, 'folder') }]);

		assert.deepStrictEqual(toWorkspaceIdentifier(testObject.getWorkspace()), { id: 'empty-window' });
	}));

	test('leaving the mode unmounts a moved folder without moving it back first or clearing history', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.setAgentsMode(true);
		const folder = joinPath(ROOT, 'repo');
		const worktree = joinPath(ROOT, 'repo.worktrees', 'first');
		await fileService.createFolder(folder);
		await fileService.createFolder(worktree);
		await testObject.addFolders([{ uri: folder }]);
		const moved = await testObject.setFolderLocation(worktree, { folder });
		const events: { added: string[]; removed: string[]; isFolderLocationChange: boolean | undefined }[] = [];
		disposables.add(testObject.onWillChangeWorkspaceFolders(e => events.push({ added: e.changes.added.map(f => f.uri.path), removed: e.changes.removed.map(f => f.uri.path), isFolderLocationChange: e.isFolderLocationChange })));
		// The rule the session folder mount clears recently opened editors by: folders removed in the Agents mode
		let historyClears = 0;
		disposables.add(testObject.onDidChangeWorkspaceFolders(e => {
			if (e.removed.length > 0 && testObject.getWorkbenchMode() === WorkbenchMode.Agents) {
				historyClears++;
			}
		}));

		await testObject.setAgentsMode(false);

		assert.deepStrictEqual({ moved, events, historyClears }, { moved: true, events: [], historyClears: 0 });
	}));

	test('leaves the mode before initializing another workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.setAgentsMode(true);
		await testObject.initialize({ id: 'empty-window' });

		assert.deepStrictEqual({ mode: testObject.isAgentsMode, state: testObject.getWorkbenchState() }, { mode: false, state: WorkbenchState.EMPTY });
	}));

	test('enters the mode under the window\'s current workspace id, not the startup one', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.initialize({ id: 'another-empty-window' });
		await testObject.setAgentsMode(true);

		assert.deepStrictEqual({ mode: testObject.isAgentsMode, id: testObject.getWorkspace().id }, { mode: true, id: 'another-empty-window' });
	}));

	/** A window opened on `workspace`, whose `folder` sets `agentsMode.folderSetting` to `folder`, and `agentsMode.languageSetting` to `markdown` for Markdown only. */
	async function createWindowWithFolderSetting(workspace: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier, folder: URI): Promise<AgentsModeWorkspaceService> {
		const logService = new NullLogService();
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const environmentService = TestEnvironmentService;
		const remoteAgentService = disposables.add(instantiationService.createInstance(RemoteAgentService));
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		const policyService = new NullPolicyService();
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "agentsMode.folderSetting": "folder", "[markdown]": { "agentsMode.languageSetting": "markdown" } }'));
		const editor = disposables.add(new WorkspaceService({ configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService));
		await editor.initialize(workspace);
		const window = disposables.add(new AgentsModeWorkspaceService(editor, { userDataProfileService, userDataProfilesService, uriIdentityService, fileService, policyService, logService, configurationCache, environmentService }));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IWorkspaceContextService, window);
		instantiationService.stub(IConfigurationService, window);
		window.acquireInstantiationService(instantiationService);
		return window;
	}

	/** The values of `agentsMode.folderSetting` for `resource` that `window`'s change events announce for it. */
	function recordFolderSettingEvents(window: AgentsModeWorkspaceService, resource: URI): string[] {
		const events: string[] = [];
		disposables.add(window.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agentsMode.folderSetting', { resource })) {
				events.push(String(window.getValue('agentsMode.folderSetting', { resource })));
			}
		}));
		return events;
	}

	test('a folder window switches in place to no folders under its own identity and gets its folders back on leaving', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folderUri = joinPath(ROOT, 'folder');
		const folderObject = await createWindowWithFolderSetting({ id: 'folder-window', uri: folderUri }, folderUri);

		const folderSnapshot = () => ({
			workspaceId: folderObject.getWorkspace().id,
			configuration: folderObject.getWorkspace().configuration?.toString(),
			folders: folderObject.getWorkspace().folders.map(folder => folder.uri.toString()),
			state: folderObject.getWorkbenchState(),
			windowFolders: folderObject.windowFolders.map(folder => folder.toString()),
			folderSetting: folderObject.getValue('agentsMode.folderSetting', { resource: joinPath(folderUri, 'a.txt') }),
		});
		const folderSettingEvents = recordFolderSettingEvents(folderObject, joinPath(folderUri, 'a.txt'));
		const before = folderSnapshot();
		await folderObject.setAgentsMode(true);
		const inMode = folderSnapshot();
		await folderObject.setAgentsMode(false);
		const after = folderSnapshot();

		assert.deepStrictEqual({ before, inMode, after, folderSettingEvents }, {
			before: { workspaceId: 'folder-window', configuration: undefined, folders: [folderUri.toString()], state: WorkbenchState.FOLDER, windowFolders: [folderUri.toString()], folderSetting: 'folder' },
			// Same identity (storage, backups), with no workspace file of its own: the folders follow the sessions
			inMode: { workspaceId: 'folder-window', configuration: undefined, folders: [], state: WorkbenchState.WORKSPACE, windowFolders: [folderUri.toString()], folderSetting: 'default' },
			after: { workspaceId: 'folder-window', configuration: undefined, folders: [folderUri.toString()], state: WorkbenchState.FOLDER, windowFolders: [folderUri.toString()], folderSetting: 'folder' },
			folderSettingEvents: ['default', 'folder'],
		});
	}));

	test('a folder window that mounts its own folder in the mode hears the workspace name change on entering and leaving', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folderUri = joinPath(ROOT, 'folder');
		const folderObject = await createWindowWithFolderSetting({ id: 'folder-window', uri: folderUri }, folderUri);
		const events: string[] = [];
		disposables.add(folderObject.onDidChangeWorkspaceName(() => events.push(`name:${folderObject.getWorkbenchState()}`)));
		disposables.add(folderObject.onDidChangeWorkspaceFolders(e => events.push(`folders:+${e.added.length}-${e.removed.length}`)));

		await folderObject.setAgentsMode(true);
		await folderObject.addFolders([{ uri: folderUri }]);
		await folderObject.setAgentsMode(false);

		assert.deepStrictEqual(events, [
			`name:${WorkbenchState.WORKSPACE}`, 'folders:+0-1',
			'folders:+1-0',
			`name:${WorkbenchState.FOLDER}`,
		]);
	}));

	test('editors open in a folder of a multi-root window hear that its folder settings stop and start applying', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const [first, second] = [joinPath(ROOT, 'first'), joinPath(ROOT, 'second')];
		await fileService.createFolder(second);
		const configPath = joinPath(ROOT, 'multi.code-workspace');
		await fileService.writeFile(configPath, VSBuffer.fromString(JSON.stringify({ folders: [{ path: first.path }, { path: second.path }] })));
		const window = await createWindowWithFolderSetting({ id: 'multi-root-window', configPath }, first);
		const resource = joinPath(first, 'a.txt');
		// A folder's settings are not the workspace's in a multi-root window: they apply only to resources in that folder
		const value = () => ({ workspace: window.getValue('agentsMode.folderSetting'), resource: window.getValue('agentsMode.folderSetting', { resource }) });
		const events = recordFolderSettingEvents(window, resource);

		const before = value();
		await window.setAgentsMode(true);
		const inMode = value();
		await window.setAgentsMode(false);
		const after = value();

		assert.deepStrictEqual({ before, inMode, after, events }, {
			before: { workspace: 'default', resource: 'folder' },
			inMode: { workspace: 'default', resource: 'default' },
			after: { workspace: 'default', resource: 'folder' },
			events: ['default', 'folder'],
		});
	}));

	test('editors of a language hear that its folder settings stop and start applying', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'folder');
		const window = await createWindowWithFolderSetting({ id: 'folder-window', uri: folder }, folder);
		const overrides = { resource: joinPath(folder, 'README.md'), overrideIdentifier: 'markdown' };
		const events: string[] = [];
		disposables.add(window.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agentsMode.languageSetting', overrides)) {
				events.push(String(window.getValue('agentsMode.languageSetting', overrides)));
			}
		}));

		await window.setAgentsMode(true);
		await window.setAgentsMode(false);

		assert.deepStrictEqual(events, ['default', 'markdown']);
	}));

	test('is only supported in local editor windows with a backup path, outside Stable, and the Agents mode setting on', () => {
		const insider = { quality: 'insider' };
		const local = { remoteAuthority: undefined, isExtensionDevelopment: false, isSessionsWindow: false };
		const reads: string[] = [];
		const settings = (values: Record<string, unknown>) => ({
			getValue: <T>(key?: unknown, _overrides?: unknown) => { reads.push(key as string); return values[key as string] as T; },
		});
		const setting = (value: unknown) => settings({ [AGENTS_MODE_ENABLED_SETTING]: value });

		const supported = {
			enabled: AgentsModeWorkspaceService.supportsAgentsMode(insider, local, setting(true), true),
			dev: AgentsModeWorkspaceService.supportsAgentsMode({ quality: undefined }, local, setting(true), true),
			settingOff: AgentsModeWorkspaceService.supportsAgentsMode(insider, local, setting(false), true),
			settingUnset: AgentsModeWorkspaceService.supportsAgentsMode(insider, local, setting(undefined), true),
			settingTruthy: AgentsModeWorkspaceService.supportsAgentsMode(insider, local, setting('true'), true),
			noBackup: AgentsModeWorkspaceService.supportsAgentsMode(insider, local, setting(true), false),
			workspacesFilterOnly: AgentsModeWorkspaceService.supportsAgentsMode(insider, local, settings({ 'sessions.list.workspacesFilter.enabled': true }), true),
			remote: AgentsModeWorkspaceService.supportsAgentsMode(insider, { ...local, remoteAuthority: 'ssh-remote+host' }, setting(true), true),
			extensionDevelopment: AgentsModeWorkspaceService.supportsAgentsMode(insider, { ...local, isExtensionDevelopment: true }, setting(true), true),
			agentsWindow: AgentsModeWorkspaceService.supportsAgentsMode(insider, { ...local, isSessionsWindow: true }, setting(true), true),
		};
		reads.length = 0;
		const stable = AgentsModeWorkspaceService.supportsAgentsMode({ quality: 'stable' }, local, setting(true), true);

		assert.deepStrictEqual({ supported, stable, stableReads: reads }, {
			supported: { enabled: true, dev: true, settingOff: false, settingUnset: false, settingTruthy: false, noBackup: false, workspacesFilterOnly: false, remote: false, extensionDevelopment: false, agentsWindow: false },
			stable: false,
			stableReads: [],
		});
	});

	test('the setting is not registered in Stable, and is registered in Insiders and dev builds', () => {
		const registered = (quality: string | undefined) => {
			configurationRegistry.deregisterConfigurations([agentsModeEnabledConfiguration]);
			AgentsModeWorkspaceService.registerEnabledConfiguration(configurationRegistry, quality);
			return configurationRegistry.getConfigurationProperties()[AGENTS_MODE_ENABLED_SETTING] !== undefined;
		};

		assert.deepStrictEqual({ stable: registered('stable'), insider: registered('insider'), dev: registered(undefined) }, { stable: false, insider: true, dev: true });
	});

	test('a window in a non-default profile reads the Agents mode setting from the default profile', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(applicationSettingsResource, VSBuffer.fromString(`{ "${AGENTS_MODE_ENABLED_SETTING}": true }`));
		await testObject.reloadConfiguration();

		assert.strictEqual(AgentsModeWorkspaceService.supportsAgentsMode({ quality: 'insider' }, { remoteAuthority: undefined, isExtensionDevelopment: false, isSessionsWindow: false }, testObject, true), true);
	}));
});
