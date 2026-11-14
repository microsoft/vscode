/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { marked } from '../../../../base/common/marked/marked.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TargetPlatform } from '../../../extensions/common/extensions.js';
import { IProductService } from '../../../product/common/productService.js';
import { CommontExtensionManagementService } from '../../common/abstractExtensionManagementService.js';
import { IAllowedExtensionsService, IGalleryExtension } from '../../common/extensionManagement.js';

suite('CommontExtensionManagementService - canInstall', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const learnMoreLink = isWeb ? 'https://aka.ms/vscode-web-extensions-guide' : 'https://aka.ms/vscode-platform-specific-extensions';

	type ServiceConstructor = new (productService: IProductService, allowedExtensionsService: IAllowedExtensionsService) => CommontExtensionManagementService;

	function createService(targetPlatform: TargetPlatform): CommontExtensionManagementService {
		const productService = { nameLong: 'Test Product', quality: 'stable' } as IProductService;
		const allowedExtensionsService = { isAllowed: () => true } as unknown as IAllowedExtensionsService;
		const service = disposables.add(new (CommontExtensionManagementService as unknown as ServiceConstructor)(productService, allowedExtensionsService));
		service.getTargetPlatform = async () => targetPlatform;
		return service;
	}

	function aGalleryExtension(displayName: string, allTargetPlatforms: TargetPlatform[]): IGalleryExtension {
		return {
			identifier: { id: 'publisher.name' },
			displayName,
			allTargetPlatforms
		} as IGalleryExtension;
	}

	test('returns true when the extension supports the current platform', async () => {
		const service = createService(TargetPlatform.DARWIN_ARM64);
		assert.strictEqual(await service.canInstall(aGalleryExtension('Example', [TargetPlatform.DARWIN_ARM64])), true);
	});

	test('platform incompatibility message links only to the learn more page whatever the display name contains', async () => {
		const service = createService(TargetPlatform.DARWIN_ARM64);
		const displayNames = [
			'Example',
			'Example [Learn Why](command:workbench.action.files.newUntitledFile)',
			'Example <command:workbench.action.files.newUntitledFile?%5B%5D>'
		];

		const rendered: Record<string, { links: string[]; hasImage: boolean; hasThemeIcon: boolean }> = {};
		for (const displayName of displayNames) {
			const result = await service.canInstall(aGalleryExtension(displayName, [TargetPlatform.WIN32_X64]));
			assert.notStrictEqual(result, true);
			const html = marked.parse((result as IMarkdownString).value, { async: false });
			rendered[displayName] = {
				links: [...html.matchAll(/<a href="([^"]*)"/g)].map(match => match[1]),
				hasImage: html.includes('<img'),
				hasThemeIcon: /(?<!\\)\$\(/.test(html)
			};
		}

		const learnMore = { links: [learnMoreLink], hasImage: false, hasThemeIcon: false };
		assert.deepStrictEqual(rendered, Object.fromEntries(displayNames.map(displayName => [displayName, learnMore])));
	});

	test('platform incompatibility message keeps the display name text', async () => {
		const service = createService(TargetPlatform.DARWIN_ARM64);
		const result = await service.canInstall(aGalleryExtension('Example Extension', [TargetPlatform.WIN32_X64]));
		assert.strictEqual((result as IMarkdownString).value, `The 'Example Extension' extension is not available in Test Product for the Mac Silicon platform. [Learn Why](${learnMoreLink})`);
	});
});
