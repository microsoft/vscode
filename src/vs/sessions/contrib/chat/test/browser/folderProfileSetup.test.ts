/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionType, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IExtensionManagementService, ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { AGENTS_WINDOW_PROFILE_ID, IUserDataProfile, toUserDataProfile, UseDefaultProfileFlags } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IMcpCopilotGlobalConfigurationService } from '../../../../../workbench/contrib/mcp/common/mcpCopilotGlobalConfigurationService.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { FolderProfileSetupResolver, getFolderProfile } from '../../browser/folderProfileSetup.js';

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
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const work = toUserDataProfile('work', 'Work', URI.file('/User/profiles/work'), cacheHome);
		const shared = toUserDataProfile('shared', 'Shared', URI.file('/User/profiles/shared'), cacheHome, { useDefaultFlags: sharedFlags }, defaultProfile);
		const copilotGlobal = URI.file('/home/.copilot/mcp-config.json');
		const write = (resource: URI, content: string) => fileService.writeFile(resource, VSBuffer.fromString(content));
		await Promise.all([
			write(work.mcpResource, JSON.stringify({ servers: { jira: { command: 'jira' }, github: { command: 'gh' }, shared: { command: 'shared' } } })),
			write(defaultProfile.mcpResource, JSON.stringify({ servers: { shared: { command: 'shared' } } })),
			write(copilotGlobal, JSON.stringify({ mcpServers: { github: { command: 'gh' } } })),
			...['reviewer.agent.md', 'style.instructions.md', 'release.prompt.md', 'notes.txt', 'shared.agent.md'].map(name => write(extUri.joinPath(work.promptsHome, name), '')),
			write(extUri.joinPath(defaultProfile.promptsHome, 'shared.agent.md'), ''),
		]);
		const installed = new Map<string, ILocalExtension[]>([
			[work.extensionsResource.toString(), [
				createExtension('acme.tools', { languageModelTools: [{ name: 'acme', displayName: 'Acme', modelDescription: 'Acme' }] }),
				createExtension('acme.theme', { themes: [{ label: 'Acme' }] }),
				createExtension('acme.servers', { mcpServerDefinitionProviders: [{ id: 'acme', label: 'Acme' }] }),
			]],
			[defaultProfile.extensionsResource.toString(), [
				createExtension('acme.servers', { mcpServerDefinitionProviders: [{ id: 'acme', label: 'Acme' }] }),
			]],
		]);
		const reads: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IUserDataProfileService, { currentProfile: agentsProfile });
		instantiationService.stub(IExtensionManagementService, {
			getInstalled: async (type?: ExtensionType, profileLocation?: URI) => {
				reads.push(`${type === ExtensionType.User ? 'user' : 'all'} extensions of ${profileLocation?.path}`);
				return installed.get(profileLocation!.toString()) ?? [];
			},
		});
		instantiationService.stub(IMcpResourceScannerService, store.add(new McpResourceScannerService(fileService, new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
			override asCanonicalUri(uri: URI): URI { return uri; }
		}())));
		instantiationService.stub(IMcpCopilotGlobalConfigurationService, { getConfigurationResource: async () => copilotGlobal });
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUriIdentityService, { extUri });
		instantiationService.stub(ILogService, new NullLogService());
		const resolver = instantiationService.createInstance(FolderProfileSetupResolver);

		const setup = await resolver.resolve(work);
		const sharedSetup = await resolver.resolve(shared);
		assert.deepStrictEqual({
			extensions: setup.extensions,
			mcpServers: setup.mcpServers.map(server => ({ name: server.name, resource: server.resource.path })),
			customizations: setup.customizations.map(customization => ({ type: customization.type, name: customization.name })),
			// A profile that uses the Default profile's extensions, MCP servers, and prompt files has nothing more to read.
			shared: { extensions: sharedSetup.extensions.length, mcpServers: sharedSetup.mcpServers.length, customizations: sharedSetup.customizations.length },
			reads,
		}, {
			extensions: [{ id: 'acme.tools', displayName: 'tools display', contributions: ['Tools'] }],
			mcpServers: [{ name: 'jira', resource: '/User/profiles/work/mcp.json' }],
			customizations: [
				{ type: PromptsType.prompt, name: 'release' },
				{ type: PromptsType.agent, name: 'reviewer' },
				{ type: PromptsType.instructions, name: 'style' },
			],
			shared: { extensions: 0, mcpServers: 0, customizations: 0 },
			reads: ['user extensions of /User/profiles/work/extensions.json', 'user extensions of /User/extensions.json'],
		});
	});
});
