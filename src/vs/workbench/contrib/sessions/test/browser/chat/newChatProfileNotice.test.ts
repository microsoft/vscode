/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { basename, extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../../../../../platform/chat/common/agentsWindowInvitation.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILocalExtension, InstallExtensionResult, InstallOperation } from '../../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { AGENTS_WINDOW_PROFILE_ID, IUserDataProfile, IUserDataProfilesService, toUserDataProfile, UseDefaultProfileFlags } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../chat/common/aiCustomizationWorkspaceService.js';
import { getPromptFileType } from '../../../../chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../../chat/common/promptSyntax/service/promptsService.js';
import { IMcpCopilotGlobalConfigurationService } from '../../../../mcp/common/mcpCopilotGlobalConfigurationService.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchExtensionManagementService } from '../../../../../services/extensionManagement/common/extensionManagement.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { ISession, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { FOLDER_PROFILE_NOTICE_DISMISSED_STORAGE_KEY, NewChatProfileNotice } from '../../../browser/chat/newChatProfileNotice.js';
import { NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS, NewSessionBanners } from '../../../common/newSessionBanners.js';

const cacheHome = URI.file('/cache');
const defaultProfile: IUserDataProfile = { ...toUserDataProfile('__default__profile__', 'Default', URI.file('/User'), cacheHome), isDefault: true };
const sharedFlags: UseDefaultProfileFlags = { extensions: true, mcp: true, prompts: true };
const agentsProfile = toUserDataProfile(AGENTS_WINDOW_PROFILE_ID, 'Agents', URI.file('/User/profiles/agents'), cacheHome, { useDefaultFlags: sharedFlags }, defaultProfile);
const workFolder = URI.file('/work/app');
const otherWorkFolder = URI.file('/work/api');
const sharedFolder = URI.file('/shared/app');
const workProfile = toUserDataProfile('work', 'Work', URI.file('/User/profiles/work'), cacheHome, { icon: 'briefcase', workspaces: [workFolder, otherWorkFolder] });
const sharedProfile = toUserDataProfile('shared', 'Shared', URI.file('/User/profiles/shared'), cacheHome, { useDefaultFlags: sharedFlags, workspaces: [sharedFolder] }, defaultProfile);

function createSession(sessionId: string, root: URI | undefined): ISession {
	const workspace = root ? upcastPartial<ISessionWorkspace>({
		uri: root,
		folders: [upcastPartial<ISessionFolder>({ root, workingDirectory: root, name: basename(root) })],
	}) : undefined;
	return new class extends mock<ISession>() {
		override readonly sessionId = sessionId;
		override readonly workspace = constObservable(workspace);
		override readonly status = constObservable(SessionStatus.Untitled);
		override readonly loading = constObservable(false);
	}();
}

suite('NewChatProfileNotice', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function setup() {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(workProfile.mcpResource, VSBuffer.fromString(JSON.stringify({ servers: { jira: { command: 'jira' } } })));
		await fileService.writeFile(extUri.joinPath(workProfile.promptsHome, 'reviewer.agent.md'), VSBuffer.fromString(''));
		const toolsExtension = new class extends mock<ILocalExtension>() {
			override readonly identifier = { id: 'acme.tools' };
			override readonly manifest = { name: 'tools', publisher: 'acme', version: '1.0.0', engines: { vscode: '*' }, displayName: 'Acme Tools', contributes: { languageModelTools: [{ name: 'acme', displayName: 'Acme', modelDescription: 'Acme' }] } };
		}();

		const installed = new Map<string, ILocalExtension[]>([[workProfile.extensionsResource.toString(), [toolsExtension]]]);
		const didInstallExtensions = store.add(new Emitter<readonly InstallExtensionResult[]>());
		const userCustomizations: URI[] = [];
		const didChangeCustomAgents = store.add(new Emitter<void>());

		const instantiation = store.add(new TestInstantiationService());
		const storage = store.add(new InMemoryStorageService());
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const session = observableValue<ISession | undefined>('session', createSession('draft', workFolder));
		const actions: string[] = [];
		const details: string[][] = [];
		let pickLabel: string | undefined;
		let focusCount = 0;
		instantiation.stub(IUserDataProfilesService, upcastPartial<IUserDataProfilesService>({ profiles: [defaultProfile, agentsProfile, workProfile, sharedProfile], onDidChangeProfiles: Event.None }));
		instantiation.stub(IUserDataProfileService, upcastPartial<IUserDataProfileService>({ currentProfile: agentsProfile }));
		instantiation.stub(IWorkbenchExtensionManagementService, upcastPartial<IWorkbenchExtensionManagementService>({
			getInstalled: async (_type, profileLocation) => installed.get(profileLocation!.toString()) ?? [],
			onProfileAwareDidInstallExtensions: didInstallExtensions.event,
			onProfileAwareDidUninstallExtension: Event.None,
			onProfileAwareDidUpdateExtensionMetadata: Event.None,
		}));
		instantiation.stub(IPromptsService, upcastPartial<IPromptsService>({
			listPromptFilesForStorage: async (type: PromptsType, storage: PromptsStorage) => storage === PromptsStorage.user
				? userCustomizations.filter(uri => getPromptFileType(uri) === type).map(uri => ({ uri, storage: PromptsStorage.user, type }))
				: [],
			onDidChangeCustomAgents: didChangeCustomAgents.event,
			onDidChangeInstructions: Event.None,
			onDidChangeSlashCommands: Event.None,
		}));
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IMcpResourceScannerService, store.add(new McpResourceScannerService(fileService, upcastPartial<IUriIdentityService>({ extUri, asCanonicalUri: uri => uri }))));
		instantiation.stub(IMcpCopilotGlobalConfigurationService, upcastPartial<IMcpCopilotGlobalConfigurationService>({ getConfigurationResource: async () => undefined }));
		instantiation.stub(IFileService, fileService);
		instantiation.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }));
		instantiation.stub(IQuickInputService, upcastPartial<IQuickInputService>({
			pick: (async (picks: QuickPickInput<IQuickPickItem>[]) => {
				details.push(picks.map(item => item.type === 'separator' ? `--- ${item.label}` : `${item.label} (${item.description})`));
				return picks.find((item): item is IQuickPickItem => item.type !== 'separator' && item.label === pickLabel);
			}) as IQuickInputService['pick'],
		}));
		instantiation.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (id: string, ...args: unknown[]) => { actions.push(`${id} ${JSON.stringify(args)}`); return undefined; },
		}));
		instantiation.stub(IEditorService, upcastPartial<IEditorService>({
			openEditor: (async (editor: { resource: URI }) => { actions.push(`open ${editor.resource.path}`); return undefined; }) as IEditorService['openEditor'],
		}));
		instantiation.stub(ILogService, new NullLogService());
		const banners = store.add(new NewSessionBanners(storage));
		const container = mainWindow.document.body.appendChild(document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const create = async () => {
			const notice = store.add(instantiation.createInstance(NewChatProfileNotice, container, banners, session, () => focusCount++));
			await timeout(0);
			return notice;
		};
		const read = (notice: NewChatProfileNotice) => notice.element.style.display === 'none'
			? undefined
			: { icon: notice.element.firstElementChild?.className, message: notice.element.querySelector('.new-session-folder-profile-notice-message')?.textContent };
		const showDetails = async (notice: NewChatProfileNotice, label: string) => {
			pickLabel = label;
			notice.element.querySelector<HTMLElement>('.monaco-button')!.click();
			await timeout(0);
		};
		// Adds what the folder's profile has to the Agents window, as Show Details leads to.
		const addToAgentsWindow = {
			extension: async (extension: ILocalExtension) => {
				installed.set(defaultProfile.extensionsResource.toString(), [extension]);
				didInstallExtensions.fire([{ identifier: extension.identifier, operation: InstallOperation.Install, local: extension, profileLocation: defaultProfile.extensionsResource }]);
				await timeout(0);
			},
			customization: async (resource: URI) => {
				userCustomizations.push(resource);
				didChangeCustomAgents.fire();
				await timeout(0);
			},
		};
		const writeFile = async (resource: URI, content: string) => {
			const didChange = Event.toPromise(Event.filter(fileService.onDidFilesChange, e => e.contains(resource)));
			await fileService.writeFile(resource, VSBuffer.fromString(content));
			await didChange;
			await timeout(0);
		};
		return { create, read, showDetails, session, sentiment, storage, actions, details, toolsExtension, addToAgentsWindow, writeFile, get focusCount() { return focusCount; } };
	}

	test('names what the folder\'s profile has that the Agents window does not, and leads to where each can be added or seen', async () => {
		const env = await setup();
		const notice = await env.create();
		const shown = env.read(notice);
		await env.showDetails(notice, 'Acme Tools');
		await env.showDetails(notice, 'jira');
		await env.showDetails(notice, 'reviewer');
		assert.deepStrictEqual({ shown, details: env.details[0], actions: env.actions }, {
			shown: {
				icon: 'codicon codicon-briefcase',
				message: 'In VS Code, app uses your \'Work\' profile, which has 1 extension, 1 MCP server and 1 agent that the Agents window doesn\'t. The Agents window uses your Default profile.',
			},
			details: ['--- Extensions', 'Acme Tools (Tools)', '--- MCP Servers', 'jira (mcp.json)', '--- Agents', 'reviewer (reviewer.agent.md)'],
			actions: [
				`${AICustomizationManagementCommands.OpenEditor} ${JSON.stringify([{ section: AICustomizationManagementSection.Extensions, searchQuery: 'acme.tools' }])}`,
				'open /User/profiles/work/mcp.json',
				'open /User/profiles/work/prompts/reviewer.agent.md',
			],
		});
	});

	test('updates as the user adds what the folder\'s profile has to the Agents window, and when the profile gets more', async () => {
		const env = await setup();
		const notice = await env.create();
		const summaries: (string | undefined)[] = [];
		const record = () => summaries.push(env.read(notice)?.message?.match(/which has (?<summary>.+) that the Agents window/)?.groups?.summary);
		record();
		await env.addToAgentsWindow.extension(env.toolsExtension);
		record();
		await env.writeFile(defaultProfile.mcpResource, JSON.stringify({ servers: { jira: { command: 'jira' } } }));
		record();
		// A personal folder that every profile uses, such as ~/.copilot/agents.
		await env.addToAgentsWindow.customization(URI.file('/home/.copilot/agents/reviewer.agent.md'));
		record();
		await env.writeFile(extUri.joinPath(workProfile.promptsHome, 'team/style.instructions.md'), '');
		record();
		assert.deepStrictEqual(summaries, [
			'1 extension, 1 MCP server and 1 agent',
			'1 MCP server and 1 agent',
			'1 agent',
			undefined,
			'1 instructions file',
		]);
	});

	test('stays hidden for folders without another profile, profiles that share the Default profile\'s setup, folders of other machines, and hidden AI features', async () => {
		const env = await setup();
		const notice = await env.create();
		const states: Record<string, boolean> = {};
		const check = async (name: string, session: ISession | undefined) => {
			env.session.set(session, undefined);
			await timeout(0);
			states[name] = !!env.read(notice);
		};
		await check('work folder', createSession('a', workFolder));
		await check('folder without a profile', createSession('b', URI.file('/elsewhere')));
		await check('shared profile', createSession('c', sharedFolder));
		await check('remote folder', createSession('d', workFolder.with({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host' })));
		await check('no folder', createSession('e', undefined));
		env.sentiment.set({ hidden: true }, undefined);
		await check('hidden AI features', createSession('f', workFolder));
		assert.deepStrictEqual(states, {
			'work folder': true,
			'folder without a profile': false,
			'shared profile': false,
			'remote folder': false,
			'no folder': false,
			'hidden AI features': false,
		});
	});

	test('Escape hides the notice for the session being started, and Don\'t Show Again hides it for the profile after restarting', async () => {
		const env = await setup();
		const notice = await env.create();
		// The Show Details button handles Escape itself, and focus returns to the input when the notice hides.
		const button = notice.element.querySelector<HTMLElement>('.monaco-button')!;
		button.focus();
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		const afterEscape = { shown: !!env.read(notice), focusedInput: env.focusCount };
		env.session.set(createSession('next', workFolder), undefined);
		await timeout(0);
		const nextSession = !!env.read(notice);
		notice.element.querySelector<HTMLElement>('.monaco-action-bar .action-label')!.click();
		await timeout(0);
		const afterDismissal = !!env.read(notice);
		env.session.set(createSession('other folder', otherWorkFolder), undefined);
		await timeout(0);
		const otherFolderOfProfile = !!env.read(notice);
		notice.dispose();
		const restarted = await env.create();
		assert.deepStrictEqual({
			afterEscape,
			nextSession,
			afterDismissal,
			otherFolderOfProfile,
			afterRestart: !!env.read(restarted),
			dismissed: env.storage.get(FOLDER_PROFILE_NOTICE_DISMISSED_STORAGE_KEY, StorageScope.PROFILE),
		}, {
			afterEscape: { shown: false, focusedInput: 1 },
			nextSession: true,
			afterDismissal: false,
			otherFolderOfProfile: false,
			afterRestart: false,
			dismissed: '["work"]',
		});
	});
});
