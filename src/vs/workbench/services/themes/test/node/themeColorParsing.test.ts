/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess, Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionResourceLoaderService } from 'vs/platform/extensionResourceLoader/common/extensionResourceLoaderService';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { IRequestService } from 'vs/platform/request/common/request';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { TestProductService, mock } from 'vs/workbench/test/common/workbenchTestServices';
import * as assert from 'assert';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { getColorRegistry } from 'vs/platform/theme/common/colorRegistry';


suite('Theme color parsing', () => {
	const fileService = new FileService(new NullLogService());
	const requestService = new (mock<IRequestService>())();
	const storageService = new (mock<IStorageService>())();
	const environmentService = new (mock<IEnvironmentService>())();
	const configurationService = new (mock<IConfigurationService>())();
	const extensionResourceLoaderService = new ExtensionResourceLoaderService(fileService, storageService, TestProductService, environmentService, configurationService, requestService);

	const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);

	teardown(() => {
		diskFileSystemProvider.dispose();
	});


	test('parse with palette', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('bar');
		themeData.location = FileAccess.asFileUri('vs/workbench/services/themes/test/node/color-theme-with-pallet.json');
		await themeData.ensureLoaded(extensionResourceLoaderService);
		const colorRegistry = getColorRegistry();

		assert.strictEqual(themeData.isLoaded, true);
		assert.strictEqual(themeData.getColor('editorGroup.emptyBackground')?.toString(), '#4e321a');
		assert.strictEqual(themeData.getColor('statusBar.border')?.toString(), '#110802');
		assert.strictEqual(themeData.getColor('focusBorder')?.toString(), '#0400ff');
		assert.strictEqual(themeData.getColor('badge.background')?.toString(), '#fce566');

		const defaultBadgeForeground = colorRegistry.resolveDefaultColor('badge.foreground', themeData);
		assert.strictEqual(themeData.getColor('badge.foreground')?.toString(), defaultBadgeForeground?.toString());
		const defaultEditorGroupDropBackground = colorRegistry.resolveDefaultColor('editorGroup.dropBackground', themeData);
		assert.strictEqual(themeData.getColor('editorGroup.dropBackground')?.toString(), defaultEditorGroupDropBackground);

	});

	test('parse without palette', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('bar');
		themeData.location = FileAccess.asFileUri('vs/workbench/services/themes/test/node/color-theme-without-pallet.json');
		await themeData.ensureLoaded(extensionResourceLoaderService);
		const colorRegistry = getColorRegistry();

		assert.strictEqual(themeData.isLoaded, true);
		const defaultEditorGroupEmptyBackground = colorRegistry.resolveDefaultColor('editorGroup.emptyBackground', themeData);
		assert.strictEqual(themeData.getColor('editorGroup.emptyBackground')?.toString(), defaultEditorGroupEmptyBackground?.toString());

		const defaultStatusBarBorder = colorRegistry.resolveDefaultColor('statusBar.border', themeData);
		assert.strictEqual(themeData.getColor('statusBar.border')?.toString(), defaultStatusBarBorder?.toString());

		assert.strictEqual(themeData.getColor('focusBorder')?.toString(), '#0400ff');
		assert.strictEqual(themeData.getColor('badge.background')?.toString(), '#fce566');

		const defaultBadgeForeground = colorRegistry.resolveDefaultColor('badge.foreground', themeData);
		assert.strictEqual(themeData.getColor('badge.foreground')?.toString(), defaultBadgeForeground?.toString());

		const defaultEditorGroupDropBackground = colorRegistry.resolveDefaultColor('editorGroup.dropBackground', themeData);
		assert.strictEqual(themeData.getColor('editorGroup.dropBackground')?.toString(), defaultEditorGroupDropBackground?.toString());

	});

});
