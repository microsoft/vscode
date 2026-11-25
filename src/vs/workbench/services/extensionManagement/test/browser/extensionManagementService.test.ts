/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { createCommandUri, IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { markdownEscapeEscapedIcons } from '../../../../../base/common/iconLabels.js';
import { marked, type Token } from '../../../../../base/common/marked/marked.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService, IPrompt } from '../../../../../platform/dialogs/common/dialogs.js';
import { AllowedExtensionsService } from '../../../../../platform/extensionManagement/common/allowedExtensionsService.js';
import { IAllowedExtensionsService, IExtensionGalleryService, IGalleryExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestContextService, TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { IExtensionManagementServer, IExtensionManagementServerService, IProfileAwareExtensionManagementService, IWorkbenchExtensionManagementService } from '../../common/extensionManagement.js';
import { ExtensionManagementService } from '../../common/extensionManagementService.js';

const injectedCommandUri = 'command:workbench.action.files.newUntitledFile';
const detailsLink = 'https://marketplace.example/items?itemName=pub.ext';
const publisherLink = 'https://marketplace.example/publishers/pub';
const verifyPublisherLink = 'https://aka.ms/vscode-verify-publisher';

function collectLinks(tokens: Token[] | undefined, links: string[] = []): string[] {
	for (const token of tokens ?? []) {
		if (token.type === 'link') {
			links.push(token.href);
		}
		collectLinks((token as { tokens?: Token[] }).tokens, links);
		collectLinks((token as { items?: Token[] }).items, links);
	}
	return links;
}

function aGalleryExtension(overrides: Partial<IGalleryExtension> = {}): IGalleryExtension {
	return {
		type: 'gallery',
		name: 'ext',
		identifier: { id: 'pub.ext' },
		version: '1.0.0',
		displayName: 'Ext',
		publisherId: 'pub-id',
		publisher: 'pub',
		publisherDisplayName: 'Pub',
		private: false,
		detailsLink,
		publisherLink,
		...overrides
	} as IGalleryExtension;
}

suite('ExtensionManagementService - publisher trust dialog', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let testObject: ExtensionManagementService;
	let prompts: IPrompt<void>[];
	let manifest: IExtensionManifest;
	let otherExtensions: IGalleryExtension[];

	setup(() => {
		prompts = [];
		manifest = { name: 'ext', publisher: 'pub', version: '1.0.0', engines: { vscode: '*' } };
		otherExtensions = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAllowedExtensionsService, disposables.add(new AllowedExtensionsService(TestProductService, instantiationService.get(IConfigurationService))));
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		const localServer: IExtensionManagementServer = {
			id: 'local',
			label: 'local',
			extensionManagementService: <IProfileAwareExtensionManagementService>{
				onInstallExtension: Event.None,
				onDidInstallExtensions: Event.None,
				onUninstallExtension: Event.None,
				onDidUninstallExtension: Event.None,
				onDidChangeProfile: Event.None,
				onDidUpdateExtensionMetadata: Event.None,
				onProfileAwareDidInstallExtensions: Event.None,
				onProfileAwareDidUninstallExtension: Event.None,
				onProfileAwareDidUpdateExtensionMetadata: Event.None,
			},
		};
		instantiationService.stub(IExtensionManagementServerService, <Partial<IExtensionManagementServerService>>{
			localExtensionManagementServer: localServer,
			remoteExtensionManagementServer: null,
			webExtensionManagementServer: null,
		});
		instantiationService.stub(IExtensionGalleryService, <Partial<IExtensionGalleryService>>{
			getManifest: async () => manifest,
			getExtensions: async () => otherExtensions
		});
		instantiationService.stub(IDialogService, <Partial<IDialogService>>{
			prompt: async <T>(prompt: IPrompt<T>) => {
				prompts.push(prompt as IPrompt<void>);
				return { result: undefined };
			}
		});
		testObject = disposables.add(instantiationService.createInstance(ExtensionManagementService));
		instantiationService.stub(IWorkbenchExtensionManagementService, testObject);
	});

	async function requestTrust(extension: IGalleryExtension): Promise<IMarkdownString> {
		prompts.length = 0;
		await testObject.requestPublisherTrust([{ extension, options: {} }]);
		assert.strictEqual(prompts.length, 1);
		const custom = prompts[0].custom;
		const markdown = custom && typeof custom === 'object' ? custom.markdownDetails?.[0].markdown : undefined;
		assert.ok(markdown);
		return markdown;
	}

	test('links the extension and the publisher to their gallery pages', async () => {
		const markdown = await requestTrust(aGalleryExtension({ displayName: 'My Extension', publisherDisplayName: 'My Publisher' }));

		assert.deepStrictEqual(collectLinks(marked.lexer(markdown.value)), [detailsLink, publisherLink, publisherLink, verifyPublisherLink]);
	});

	test('crafted names cannot add links', async () => {
		const names = [
			`Name](${injectedCommandUri})[x`,
			`Name](https://evil.example/login)[x`,
			`<${injectedCommandUri}>`,
			`<a href="https://evil.example">Name</a>`,
			'Name\n> quote',
			'Name\n1. item',
		];
		for (const name of names) {
			const markdown = await requestTrust(aGalleryExtension({ displayName: name, publisherDisplayName: name }));

			assert.deepStrictEqual(collectLinks(marked.lexer(markdown.value)), [detailsLink, publisherLink, publisherLink, verifyPublisherLink], name);
		}
	});

	test('crafted names cannot add links when the extension has no gallery links', async () => {
		const names = [
			`Name](${injectedCommandUri})[x`,
			'Visit https://evil.example/x now',
			'www.evil.example',
			'mail@evil.example',
		];
		for (const name of names) {
			const markdown = await requestTrust(aGalleryExtension({ displayName: name, publisherDisplayName: name, publisherLink: undefined }));

			assert.deepStrictEqual(collectLinks(marked.lexer(markdown.value)), [detailsLink, verifyPublisherLink], name);
		}
	});

	test('names cannot render theme icons', async () => {
		const markdown = await requestTrust(aGalleryExtension({ displayName: 'Name $(verified-filled)', publisherDisplayName: 'Name $(verified-filled)' }));

		const html = marked.parse(markdownEscapeEscapedIcons(markdown.value), { async: false });
		assert.ok(!/(^|[^\\])\$\(verified-filled\)/.test(html), html);
	});

	test('only the extension.open command is trusted and the link to packed extensions keeps working', async () => {
		manifest = { ...manifest, extensionPack: ['other.pack'] };
		otherExtensions = [aGalleryExtension({ identifier: { id: 'other.pack', uuid: 'other-uuid' }, name: 'pack', publisher: 'other', publisherDisplayName: 'Other', properties: {} as IGalleryExtension['properties'] })];
		const markdown = await requestTrust(aGalleryExtension({ publisherDisplayName: `Name](${injectedCommandUri})[x` }));

		assert.deepStrictEqual({ isTrusted: markdown.isTrusted, commandLinks: collectLinks(marked.lexer(markdown.value)).filter(link => link.startsWith('command:')) }, {
			isTrusted: { enabledCommands: ['extension.open'] },
			commandLinks: [createCommandUri('extension.open', 'pub.ext', 'extensionPack').toString()],
		});
	});
});
