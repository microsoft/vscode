/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { AbstractExtensionManagementService } from '../../common/abstractExtensionManagementService.js';
import { EXTENSION_IDENTIFIER_PATTERN, EXTENSION_PUBLISHER_IDENTIFIER_PATTERN, ExtensionBlockingOrigin, ExtensionBlockingScope, ExtensionManagementError, ExtensionManagementErrorCode, IAllowedExtensionsService, IExtensionBlockingInfo, IExtensionGalleryService, IGalleryExtension, IExtensionsControlManifest } from '../../common/extensionManagement.js';
import { ExtensionKey, getExtensionBlockedMessage } from '../../common/extensionManagementUtil.js';
import { TargetPlatform } from '../../../extensions/common/extensions.js';

suite('Extension Identifier Pattern', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extension identifier pattern', () => {
		const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
		assert.strictEqual(true, regEx.test('publisher.name'));
		assert.strictEqual(true, regEx.test('publiSher.name'));
		assert.strictEqual(true, regEx.test('publisher.Name'));
		assert.strictEqual(true, regEx.test('PUBLISHER.NAME'));
		assert.strictEqual(true, regEx.test('PUBLISHEr.NAMe'));
		assert.strictEqual(true, regEx.test('PUBLISHEr.N-AMe'));
		assert.strictEqual(true, regEx.test('PUB-LISHEr.NAMe'));
		assert.strictEqual(true, regEx.test('PUB-LISHEr.N-AMe'));
		assert.strictEqual(true, regEx.test('PUBLISH12Er90.N-A54Me123'));
		assert.strictEqual(true, regEx.test('111PUBLISH12Er90.N-1111A54Me123'));
		assert.strictEqual(false, regEx.test('publishername'));
		assert.strictEqual(false, regEx.test('-publisher.name'));
		assert.strictEqual(false, regEx.test('publisher.-name'));
		assert.strictEqual(false, regEx.test('-publisher.-name'));
		assert.strictEqual(false, regEx.test('publ_isher.name'));
		assert.strictEqual(false, regEx.test('publisher._name'));
	});

	test('extension identifier pattern and publisher identifier pattern are mutually exclusive (#327194)', () => {
		// Unanchored patterns let a compound key match both, failing array values against the publisher-only schema.
		const extensionIdRegEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
		const publisherRegEx = new RegExp(EXTENSION_PUBLISHER_IDENTIFIER_PATTERN);

		assert.strictEqual(extensionIdRegEx.test('ms-vscode.cpptools'), true);
		assert.strictEqual(publisherRegEx.test('ms-vscode.cpptools'), false);

		assert.strictEqual(extensionIdRegEx.test('ms-vscode'), false);
		assert.strictEqual(publisherRegEx.test('ms-vscode'), true);
	});

	test('extension key', () => {
		assert.strictEqual(new ExtensionKey({ id: 'pub.extension-name' }, '1.0.1').toString(), 'pub.extension-name-1.0.1');
		assert.strictEqual(new ExtensionKey({ id: 'pub.extension-name' }, '1.0.1', TargetPlatform.UNDEFINED).toString(), 'pub.extension-name-1.0.1');
		assert.strictEqual(new ExtensionKey({ id: 'pub.extension-name' }, '1.0.1', TargetPlatform.WIN32_X64).toString(), `pub.extension-name-1.0.1-${TargetPlatform.WIN32_X64}`);
	});

	test('extension key parsing', () => {
		assert.strictEqual(ExtensionKey.parse('pub.extension-name'), null);
		assert.strictEqual(ExtensionKey.parse('pub.extension-name@1.2.3'), null);
		assert.strictEqual(ExtensionKey.parse('pub.extension-name-1.0.1')?.toString(), 'pub.extension-name-1.0.1');
		assert.strictEqual(ExtensionKey.parse('pub.extension-name-1.0.1-win32-x64')?.toString(), 'pub.extension-name-1.0.1-win32-x64');
	});
});

suite('Extension Blocked Message', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the summary names the organization or the marketplace, per origin', () => {
		assert.deepStrictEqual(
			[ExtensionBlockingOrigin.Policy, ExtensionBlockingOrigin.Service]
				.map(origin => getExtensionBlockedMessage({ origin, scope: ExtensionBlockingScope.Extension }).value),
			[
				'This extension is not permitted by your organization\'s policy.',
				'This extension has been blocked by the Extension Marketplace and must not be used.'
			]);
	});

	test('canInstall returns the blocking message', async () => {
		const service = createExtensionManagementService();

		const result = await service.canInstall(aGalleryExtension({ origin: ExtensionBlockingOrigin.Policy, scope: ExtensionBlockingScope.Extension }));

		assert.strictEqual(result === true ? result : result.value, 'This extension is not permitted by your organization\'s policy.');
	});

	test('installFromGallery reports a blocked extension as not allowed', async () => {
		const service = createExtensionManagementService();

		await assert.rejects(
			() => service.installFromGallery(aGalleryExtension({ origin: ExtensionBlockingOrigin.Policy, scope: ExtensionBlockingScope.Extension })),
			error => error instanceof ExtensionManagementError
				&& error.code === ExtensionManagementErrorCode.NotAllowed
				&& error.message === 'This extension is not permitted by your organization\'s policy.'
		);
	});

	test('installFromGallery preserves the existing plain platform error for other canInstall failures', async () => {
		const service = createExtensionManagementService(new MarkdownString('it is not in the [allowed list](command:workbench.action.openSettings)'));

		await assert.rejects(
			() => service.installFromGallery(aGalleryExtension()),
			error => error instanceof ExtensionManagementError
				&& error.code === ExtensionManagementErrorCode.IncompatibleTargetPlatform
				&& !error.message.includes('[allowed list]')
		);
	});

	function createExtensionManagementService(allowed: true | MarkdownString = true): AbstractExtensionManagementService {
		const galleryService = new class extends mock<IExtensionGalleryService>() {
			override isEnabled(): boolean {
				return true;
			}

			override async getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
				return { malicious: [], deprecated: {}, search: [] };
			}
		};
		const allowedExtensionsService = new class extends mock<IAllowedExtensionsService>() {
			override isAllowed(): true | MarkdownString {
				return allowed;
			}
		};
		const service = Object.create(AbstractExtensionManagementService.prototype) as AbstractExtensionManagementService;
		Object.assign(service, {
			galleryService,
			telemetryService: NullTelemetryService,
			uriIdentityService: new class extends mock<IUriIdentityService>() { },
			logService: new NullLogService(),
			productService: { ...product, _serviceBrand: undefined } satisfies IProductService,
			allowedExtensionsService,
			userDataProfilesService: new class extends mock<IUserDataProfilesService>() { },
			getCurrentExtensionsManifestLocation: () => URI.file('extensions.json'),
			getTargetPlatform: async () => TargetPlatform.UNIVERSAL,
		});
		return service;
	}

	function aGalleryExtension(blockingInfo?: IExtensionBlockingInfo): IGalleryExtension {
		return Object.create({
			type: 'gallery',
			identifier: { id: 'publisher.extension', uuid: 'extension-uuid' },
			name: 'extension',
			displayName: 'Extension',
			description: '',
			publisherId: 'publisher-id',
			publisher: 'publisher',
			publisherDisplayName: 'Publisher',
			version: '1.0.0',
			installCount: 0,
			rating: 0,
			ratingCount: 0,
			categories: [],
			tags: [],
			releaseDate: 0,
			lastUpdated: 0,
			allTargetPlatforms: [TargetPlatform.UNIVERSAL],
			properties: {
				dependencies: [],
				isPreReleaseVersion: false,
				targetPlatform: TargetPlatform.UNIVERSAL,
			},
			assets: {},
			blockingInfo,
		}) as IGalleryExtension;
	}
});
