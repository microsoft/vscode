/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionType, IExtensionManifest } from '../../../../../../platform/extensions/common/extensions.js';
import { ILocalExtension, InstallExtensionResult, InstallOperation } from '../../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { AGENTS_WINDOW_PROFILE_ID, IUserDataProfile, toUserDataProfile, UseDefaultProfileFlags } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { getPromptFileType } from '../../../../chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../../chat/common/promptSyntax/service/promptsService.js';
import { IMcpCopilotGlobalConfigurationService } from '../../../../mcp/common/mcpCopilotGlobalConfigurationService.js';
import { IWorkbenchExtensionManagementService } from '../../../../../services/extensionManagement/common/extensionManagement.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { FolderProfileSetupResolver, getFolderProfile } from '../../../browser/chat/folderProfileSetup.js';

const cacheHome = URI.file('/cache');
const defaultProfile: IUserDataProfile = { ...toUserDataProfile('__default__profile__', 'Default', URI.file('/User'), cacheHome), isDefault: true };
const sharedFlags: UseDefaultProfileFlags = { extensions: true, mcp: true, prompts: true };
const agentsProfile = toUserDataProfile(AGENTS_WINDOW_PROFILE_ID, 'Agents', URI.file('/User/profiles/agents'), cacheHome, { useDefaultFlags: sharedFlags }, defaultProfile);

function createExtension(id: string, contributes: IExtensionManifest['contributes']): ILocalExtension {
	const [publisher, name] = id.split('.');
	return new class extends mock<ILocalExtension>() {
		override readonly identifier = { id };
		override readonly manifest: IExtensionManifest = { name, publisher, version: '1.0.0', engines: { vscode: '*' }, displayName: `${name} display`, contributes };
	}();
}

suite('FolderProfileSetup', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const workProfile = toUserDataProfile('work', 'Work', URI.file('/User/profiles/work'), cacheHome);
	const copilotGlobal = URI.file('/home/.copilot/mcp-config.json');

	/** The customization files that the prompts service of the Agents window lists: those of the Default profile and the personal folders. */
	const userCustomizations = [extUri.joinPath(defaultProfile.promptsHome, 'shared.agent.md'), URI.file('/home/.copilot/agents/personal.agent.md')];

	function createResolver(installed: ReadonlyMap<string, ILocalExtension[]> = new Map()) {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const configurationService = new TestConfigurationService();
		const didInstallExtensions = store.add(new Emitter<readonly InstallExtensionResult[]>());
		const didChangeCustomAgents = store.add(new Emitter<void>());
		const reads: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IUserDataProfileService, upcastPartial<IUserDataProfileService>({ currentProfile: agentsProfile }));
		instantiationService.stub(IWorkbenchExtensionManagementService, upcastPartial<IWorkbenchExtensionManagementService>({
			getInstalled: async (type?: ExtensionType, profileLocation?: URI) => {
				reads.push(`${type === ExtensionType.User ? 'user' : 'all'} extensions of ${profileLocation?.path}`);
				return installed.get(profileLocation!.toString()) ?? [];
			},
			onProfileAwareDidInstallExtensions: didInstallExtensions.event,
			onProfileAwareDidUninstallExtension: Event.None,
			onProfileAwareDidUpdateExtensionMetadata: Event.None,
		}));
		instantiationService.stub(IMcpResourceScannerService, store.add(new McpResourceScannerService(fileService, upcastPartial<IUriIdentityService>({ extUri, asCanonicalUri: uri => uri }))));
		instantiationService.stub(IMcpCopilotGlobalConfigurationService, upcastPartial<IMcpCopilotGlobalConfigurationService>({ getConfigurationResource: async () => copilotGlobal }));
		instantiationService.stub(IPromptsService, upcastPartial<IPromptsService>({
			listPromptFilesForStorage: async (type: PromptsType, storage: PromptsStorage) => storage === PromptsStorage.user
				? userCustomizations.filter(uri => getPromptFileType(uri) === type).map(uri => ({ uri, storage: PromptsStorage.user, type }))
				: [],
			onDidChangeCustomAgents: didChangeCustomAgents.event,
			onDidChangeInstructions: Event.None,
			onDidChangeSlashCommands: Event.None,
		}));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(ILogService, new NullLogService());
		const write = (resource: URI, content = '') => fileService.writeFile(resource, VSBuffer.fromString(content));
		return { resolver: instantiationService.createInstance(FolderProfileSetupResolver), fileService, configurationService, write, reads, didInstallExtensions, didChangeCustomAgents };
	}

	test('finds the profile that VS Code opens a folder with, except the Default, Agents window, and temporary profiles', () => {
		const work = URI.file('/work/app');
		const temporary = URI.file('/temporary/app');
		const personal = URI.file('/personal/app');
		const profiles = [
			{ ...defaultProfile, workspaces: [personal] },
			{ ...agentsProfile, workspaces: [work] },
			toUserDataProfile('temporary', 'Temporary', URI.file('/User/profiles/temporary'), cacheHome, { transient: true, workspaces: [temporary] }),
			toUserDataProfile('work', 'Work', URI.file('/User/profiles/work'), cacheHome, { workspaces: [work] }),
		];
		assert.deepStrictEqual([work, temporary, personal, URI.file('/elsewhere')].map(folder => getFolderProfile(profiles, folder, extUri)?.name), ['Work', undefined, undefined, undefined]);
	});

	test('reports agent extensions, MCP servers, and customization files that the Agents window does not have', async () => {
		const { resolver, configurationService, write, reads } = createResolver(new Map([
			[workProfile.extensionsResource.toString(), [
				createExtension('acme.tools', { languageModelTools: [{ name: 'acme', displayName: 'Acme', modelDescription: 'Acme' }] }),
				createExtension('acme.theme', { themes: [{ label: 'Acme' }] }),
				createExtension('acme.servers', { mcpServerDefinitionProviders: [{ id: 'acme', label: 'Acme' }] }),
			]],
			[defaultProfile.extensionsResource.toString(), [
				createExtension('acme.servers', { mcpServerDefinitionProviders: [{ id: 'acme', label: 'Acme' }] }),
			]],
		]));
		const shared = toUserDataProfile('shared', 'Shared', URI.file('/User/profiles/shared'), cacheHome, { useDefaultFlags: sharedFlags }, defaultProfile);
		await Promise.all([
			write(workProfile.mcpResource, JSON.stringify({ servers: { jira: { command: 'jira' }, github: { command: 'gh' }, shared: { command: 'shared' } } })),
			write(defaultProfile.mcpResource, JSON.stringify({ servers: { shared: { command: 'shared' } } })),
			write(copilotGlobal, JSON.stringify({ mcpServers: { github: { command: 'gh' } } })),
			...[
				'reviewer.agent.md', 'style.instructions.md', 'release.prompt.md', 'notes.txt', 'shared.agent.md', 'personal.agent.md',
				// Like the prompt files locator, only instructions files are read from subfolders, up to its depth.
				'team/review.instructions.md', 'team/nested.agent.md', 'a/b/c/d/e/deepest.instructions.md', 'a/b/c/d/e/f/too-deep.instructions.md',
			].map(path => write(extUri.joinPath(workProfile.promptsHome, path))),
		]);

		const setup = await resolver.resolve(workProfile);
		const sharedSetup = await resolver.resolve(shared);
		const extensionReads = [...reads];
		// A policy that limits agents and instructions to plugins applies to the folder's profile too.
		await configurationService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
		const lockedDown = await resolver.resolve(workProfile);
		assert.deepStrictEqual({
			extensions: setup.extensions,
			mcpServers: setup.mcpServers.map(server => ({ name: server.name, resource: server.resource.path })),
			customizations: setup.customizations.map(customization => ({ type: customization.type, name: customization.name, path: customization.resource.path })),
			// A profile that uses the Default profile's extensions, MCP servers, and prompt files has nothing more to read.
			shared: { extensions: sharedSetup.extensions.length, mcpServers: sharedSetup.mcpServers.length, customizations: sharedSetup.customizations.length },
			lockedDown: lockedDown.customizations.map(customization => customization.name),
			extensionReads,
		}, {
			extensions: [{ id: 'acme.tools', displayName: 'tools display', contributions: ['Tools'] }],
			mcpServers: [{ name: 'jira', resource: '/User/profiles/work/mcp.json' }],
			customizations: [
				{ type: PromptsType.instructions, name: 'deepest', path: '/User/profiles/work/prompts/a/b/c/d/e/deepest.instructions.md' },
				{ type: PromptsType.prompt, name: 'release', path: '/User/profiles/work/prompts/release.prompt.md' },
				{ type: PromptsType.instructions, name: 'review', path: '/User/profiles/work/prompts/team/review.instructions.md' },
				{ type: PromptsType.agent, name: 'reviewer', path: '/User/profiles/work/prompts/reviewer.agent.md' },
				{ type: PromptsType.instructions, name: 'style', path: '/User/profiles/work/prompts/style.instructions.md' },
			],
			shared: { extensions: 0, mcpServers: 0, customizations: 0 },
			lockedDown: ['release'],
			extensionReads: ['user extensions of /User/profiles/work/extensions.json', 'user extensions of /User/extensions.json'],
		});
	});

	test('tells when either profile changes what the Agents window lacks', async () => {
		const { resolver, fileService, write, didInstallExtensions, didChangeCustomAgents } = createResolver();
		const other = toUserDataProfile('other', 'Other', URI.file('/User/profiles/other'), cacheHome);
		const changed = new Set<string>();
		let step = '';
		const watcher = resolver.watch(workProfile, () => changed.add(step));
		const run = async (name: string, change: () => unknown) => {
			step = name;
			await change();
		};
		const writeFile = (name: string, resource: URI) => run(name, async () => {
			const didChange = Event.toPromise(Event.filter(fileService.onDidFilesChange, e => e.contains(resource)));
			await write(resource);
			await didChange;
		});
		const installIn = (profileLocation: URI, applicationScoped?: boolean) => () => didInstallExtensions.fire([{ identifier: { id: 'acme.tools' }, operation: InstallOperation.Install, profileLocation, applicationScoped }]);

		await run('extension installed in the folder\'s profile', installIn(workProfile.extensionsResource));
		await run('extension installed in another profile', installIn(other.extensionsResource));
		await run('extension installed in another profile for all profiles', installIn(other.extensionsResource, true));
		await writeFile('MCP server added to the Agents window', defaultProfile.mcpResource);
		await writeFile('MCP server added to Copilot Global', copilotGlobal);
		await writeFile('instructions file added to a subfolder of the folder\'s profile', extUri.joinPath(workProfile.promptsHome, 'team/style.instructions.md'));
		await writeFile('MCP server added to another profile', other.mcpResource);
		await run('agent added to the Agents window', () => didChangeCustomAgents.fire());
		watcher.dispose();
		await writeFile('MCP server added to the folder\'s profile after watching', workProfile.mcpResource);

		assert.deepStrictEqual([...changed], [
			'extension installed in the folder\'s profile',
			'extension installed in another profile for all profiles',
			'MCP server added to the Agents window',
			'MCP server added to Copilot Global',
			'instructions file added to a subfolder of the folder\'s profile',
			'agent added to the Agents window',
		]);
	});
});
