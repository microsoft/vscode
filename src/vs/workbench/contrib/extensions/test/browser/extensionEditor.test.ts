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
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IAllowedExtensionsService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IAuthenticationUsageService } from '../../../../services/authentication/browser/authenticationUsageService.js';
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

	/**
	 * Creates an editor, with what its actions and widgets use to show extensions that aren't installed, which shows the
	 * actions that `getMenuActions` returns for the context menu of extensions in its Manage action.
	 */
	function createEditor(getMenuActions: () => [string, MenuItemAction[]][] = () => []) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
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
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState() { return false; }
		});
		instantiationService.stub(IAllowedExtensionsService, new class extends mock<IAllowedExtensionsService>() {
			override readonly onDidChangeAllowedExtensionsConfigValue = Event.None;
			override isAllowed() { return true as const; }
		});
		instantiationService.stub(IExtensionFeaturesManagementService, new class extends mock<IExtensionFeaturesManagementService>() {
			override readonly onDidChangeAccessData = Event.None;
		});
		instantiationService.stub(IAuthenticationUsageService, new class extends mock<IAuthenticationUsageService>() {
			override async extensionUsesAuth() { return false; }
		});
		instantiationService.stub(IWorkbenchThemeService, 'getColorThemes', async () => []);
		instantiationService.stub(IWorkbenchThemeService, 'getFileIconThemes', async () => []);
		instantiationService.stub(IWorkbenchThemeService, 'getProductIconThemes', async () => []);
		instantiationService.stub(IMenuService, 'getMenuActions', getMenuActions);
		const container = mainWindow.document.body.appendChild($('div'));
		disposables.add(toDisposable(() => container.remove()));
		const editor = disposables.add(instantiationService.createInstance(ExtensionEditor, new class extends mock<IEditorGroup>() {
			override readonly windowId = mainWindow.vscodeWindowId;
		}()));
		editor.create(container);
		return { editor, container };
	}

	test('shows the extension that it shows last, and stops showing extensions once cleared, when the manifest of an extension that it showed before arrives later', async () => {
		const { editor, container } = createEditor();
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

	test('hides its Manage action while the context menu of extensions has no actions for the extension that it shows, such as in windows that register none', async () => {
		let menuActions: [string, MenuItemAction[]][] = [];
		const { editor, container } = createEditor(() => menuActions);
		const manifest: IExtensionManifest = { name: 'extension', publisher: 'pub', version: '1.0.0', engines: { vscode: '*' } };
		const anExtension = (id: string) => new class extends mock<IExtension>() {
			override readonly identifier = { id };
			override readonly displayName = id;
			override readonly description = '';
			override readonly state = ExtensionState.Uninstalled;
			override readonly dependencies: string[] = [];
			override readonly categories: string[] = [];
			override readonly telemetryData = {};
			override async getManifest() { return manifest; }
			override getReadme() { return Promise.reject(new Error('No README')); }
			override hasChangelog() { return false; }
		}();
		const showsManageAction = async (extension: IExtension) => {
			await editor.setInput(disposables.add(new ExtensionsInput(extension)), { preserveFocus: true }, {}, CancellationToken.None);
			// The action looks up its actions once the editor shows the extension.
			await timeout(0);
			const manage = container.querySelector('.extension-editor .action-label.manage');
			return !!manage && !manage.classList.contains('hide');
		};

		const withoutActions = await showsManageAction(anExtension('pub.without'));
		menuActions = [['1_copy', [new class extends mock<MenuItemAction>() { }()]]];
		const withActions = await showsManageAction(anExtension('pub.with'));

		assert.deepStrictEqual({ withoutActions, withActions }, { withoutActions: false, withActions: true });
	});
});
