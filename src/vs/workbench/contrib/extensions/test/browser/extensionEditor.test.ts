/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IAllowedExtensionsService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IExtensionFeaturesManagementService } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionManagementServerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ExtensionEditor } from '../../browser/extensionEditor.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../common/extensions.js';
import { ExtensionsInput } from '../../common/extensionsInput.js';

suite('ExtensionEditor', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the extension that it shows last, and stops showing extensions once cleared, when the manifest of an extension that it showed before arrives later', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		// What the editor's actions and widgets use to show extensions that aren't installed.
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly onChange = Event.None;
			override readonly local = [];
			override canSetLanguage() { return false; }
			override async canInstall() { return true as const; }
			override isAutoUpdateEnabledFor() { return false; }
			override getAutoUpdateValue() { return 'off' as const; }
		});
		instantiationService.stub(IExtensionRecommendationsService, new class extends mock<IExtensionRecommendationsService>() {
			override readonly onDidChangeRecommendations = Event.None;
			override getAllRecommendationsWithReason() { return {}; }
		});
		instantiationService.stub(IExtensionIgnoredRecommendationsService, new class extends mock<IExtensionIgnoredRecommendationsService>() {
			override readonly globalIgnoredRecommendations = [];
		});
		instantiationService.stub(IExtensionGalleryManifestService, new class extends mock<IExtensionGalleryManifestService>() {
			override async getExtensionGalleryManifest() { return null; }
		});
		instantiationService.stub(IExtensionManagementServerService, new class extends mock<IExtensionManagementServerService>() {
			override readonly localExtensionManagementServer = null;
			override readonly remoteExtensionManagementServer = null;
			override readonly webExtensionManagementServer = null;
		});
		instantiationService.stub(IWorkbenchExtensionManagementService, new class extends mock<IWorkbenchExtensionManagementService>() { });
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() { });
		instantiationService.stub(IAllowedExtensionsService, new class extends mock<IAllowedExtensionsService>() {
			override readonly onDidChangeAllowedExtensionsConfigValue = Event.None;
		});
		instantiationService.stub(IExtensionFeaturesManagementService, new class extends mock<IExtensionFeaturesManagementService>() {
			override readonly onDidChangeAccessData = Event.None;
		});
		instantiationService.stub(IWorkbenchThemeService, 'getColorThemes', async () => []);
		instantiationService.stub(IWorkbenchThemeService, 'getFileIconThemes', async () => []);
		instantiationService.stub(IWorkbenchThemeService, 'getProductIconThemes', async () => []);
		const container = mainWindow.document.body.appendChild($('div'));
		disposables.add(toDisposable(() => container.remove()));
		const editor = disposables.add(instantiationService.createInstance(ExtensionEditor, new class extends mock<IEditorGroup>() {
			override readonly windowId = mainWindow.vscodeWindowId;
		}()));
		editor.create(container);

		// The extensions whose READMEs the editor requested, which it does once it shows their details.
		const readmes: string[] = [];
		// The editor shows a Changelog tab for extensions that have a changelog, which shows the extension whose tabs it shows.
		const anExtension = (id: string, displayName: string, manifest: Promise<IExtensionManifest>, changelog: boolean) => new class extends mock<IExtension>() {
			override readonly identifier = { id };
			override readonly displayName = displayName;
			override readonly description = '';
			override readonly state = ExtensionState.Uninstalled;
			override readonly dependencies: string[] = [];
			override readonly categories: string[] = [];
			override readonly telemetryData = {};
			override getManifest() { return manifest; }
			override getReadme() {
				readmes.push(id);
				return Promise.reject(new Error('No README'));
			}
			override hasChangelog() { return changelog; }
		}();
		const show = (extension: IExtension) => editor.setInput(disposables.add(new ExtensionsInput(extension)), { preserveFocus: true }, {}, CancellationToken.None);
		const shown = () => ({
			name: container.querySelector('.extension-editor .header .name')?.textContent,
			tabs: [...container.querySelectorAll('.extension-editor .navbar .action-label')].map(tab => tab.textContent),
			readmes: readmes.splice(0),
		});
		const manifest: IExtensionManifest = { name: 'extension', publisher: 'pub', version: '1.0.0', engines: { vscode: '*' } };

		const slowManifest = new DeferredPromise<IExtensionManifest>();
		const showingSlow = show(anExtension('pub.slow', 'Slow', slowManifest.p, true));
		// While the editor waits for the manifest.
		await timeout(0);
		await show(anExtension('pub.fast', 'Fast', Promise.resolve(manifest), false));
		await slowManifest.complete(manifest);
		await showingSlow;
		const superseded = shown();

		const clearedManifest = new DeferredPromise<IExtensionManifest>();
		const showingCleared = show(anExtension('pub.cleared', 'Cleared', clearedManifest.p, true));
		await timeout(0);
		editor.clearInput();
		await clearedManifest.complete(manifest);
		await showingCleared;
		const cleared = { readmes: readmes.splice(0) };

		assert.deepStrictEqual({ superseded, cleared }, {
			superseded: { name: 'Fast', tabs: ['Details', 'Features'], readmes: ['pub.fast'] },
			cleared: { readmes: [] },
		});
	});
});
