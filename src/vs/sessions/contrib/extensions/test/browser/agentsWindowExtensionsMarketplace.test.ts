/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { singlePagePager } from '../../../../../base/common/paging.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService, IPrompt } from '../../../../../platform/dialogs/common/dialogs.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionManagementError, ExtensionManagementErrorCode, IAllowedExtensionsService, IExtensionGalleryService, IQueryOptions } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { InstallDropdownAction } from '../../../../../workbench/contrib/extensions/browser/extensionsActions.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService, InstallExtensionOptions } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { IWorkbenchIssueService } from '../../../../../workbench/contrib/issue/common/issue.js';
import { IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { IWorkbenchThemeService } from '../../../../../workbench/services/themes/common/workbenchThemeService.js';
import { AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE, AgentsWindowMarketplaceSearch, IMarketplaceSearchResult, MarketplaceSearchStatus } from '../../browser/agentsWindowExtensionsMarketplace.js';

function aGalleryExtension(id: string, properties: Partial<IExtension> = {}): IExtension {
	return new class extends mock<IExtension>() {
		override readonly identifier = { id };
		override readonly displayName = id;
		override readonly state = ExtensionState.Uninstalled;
		override readonly isBuiltin = false;
		override readonly hasReleaseVersion = true;
		override readonly deprecationInfo = properties.deprecationInfo;
	}();
}

suite('AgentsWindowMarketplaceSearch', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSearch(queries: IQueryOptions[], status: () => ExtensionGalleryManifestStatus, onDidChangeStatus: Event<ExtensionGalleryManifestStatus> = Event.None): AgentsWindowMarketplaceSearch {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override async queryGallery(options: IQueryOptions | CancellationToken) {
				assert.ok(!CancellationToken.isCancellationToken(options));
				queries.push(options);
				if (options.text === 'offline') {
					throw new Error('The Marketplace is unreachable.');
				}
				return singlePagePager([aGalleryExtension(`pub.${options.text}`)]);
			}
		});
		instantiationService.stub(IExtensionGalleryManifestService, new class extends mock<IExtensionGalleryManifestService>() {
			override get extensionGalleryManifestStatus() { return status(); }
			override readonly onDidChangeExtensionGalleryManifestStatus = onDidChangeStatus;
		});
		instantiationService.stub(ILogService, new NullLogService());
		return disposables.add(instantiationService.createInstance(AgentsWindowMarketplaceSearch));
	}

	function summarize({ query, status, extensions }: IMarketplaceSearchResult) {
		return { query, status, extensions: extensions.map(extension => extension.identifier.id) };
	}

	test('searches the Marketplace for the latest search text after a delay, like the Extensions view does for plain text', () => runWithFakedTimers({}, async () => {
		const queries: IQueryOptions[] = [];
		const search = createSearch(queries, () => ExtensionGalleryManifestStatus.Available);

		search.search('  py  ');
		const searching = summarize(search.result.get());
		search.search('python');
		await timeout(1000);
		const found = summarize(search.result.get());
		search.search('offline');
		await timeout(1000);
		const failed = summarize(search.result.get());
		search.search('  ');

		assert.deepStrictEqual({ queries, searching, found, failed, cleared: summarize(search.result.get()) }, {
			// Searches that a newer search replaces before the delay don't query the Marketplace.
			queries: [{ text: 'python', source: AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE }, { text: 'offline', source: AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE }],
			searching: { query: 'py', status: MarketplaceSearchStatus.Searching, extensions: [] },
			found: { query: 'python', status: MarketplaceSearchStatus.Done, extensions: ['pub.python'] },
			failed: { query: 'offline', status: MarketplaceSearchStatus.Failed, extensions: [] },
			cleared: { query: '', status: MarketplaceSearchStatus.Idle, extensions: [] },
		});
	}));

	test('only searches the Marketplace while it can be searched, and searches for the current search text once it can', () => runWithFakedTimers({}, async () => {
		const queries: IQueryOptions[] = [];
		const onDidChangeStatus = disposables.add(new Emitter<ExtensionGalleryManifestStatus>());
		let status = ExtensionGalleryManifestStatus.Unavailable;
		const setStatus = (value: ExtensionGalleryManifestStatus) => {
			status = value;
			onDidChangeStatus.fire(value);
		};
		const search = createSearch(queries, () => status, onDidChangeStatus.event);

		search.search('python');
		await timeout(1000);
		const unavailable = summarize(search.result.get());
		// Like a private Marketplace once users sign in.
		setStatus(ExtensionGalleryManifestStatus.Available);
		await timeout(1000);
		const available = summarize(search.result.get());
		setStatus(ExtensionGalleryManifestStatus.RequiresSignIn);

		assert.deepStrictEqual({ queries, unavailable, available, requiresSignIn: summarize(search.result.get()), isAvailable: search.isAvailable }, {
			queries: [{ text: 'python', source: AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE }],
			unavailable: { query: 'python', status: MarketplaceSearchStatus.Idle, extensions: [] },
			available: { query: 'python', status: MarketplaceSearchStatus.Done, extensions: ['pub.python'] },
			requiresSignIn: { query: 'python', status: MarketplaceSearchStatus.Idle, extensions: [] },
			isAvailable: false,
		});
	}));
});

suite('Installing from the Agents window', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Installs an extension with the Extensions view's Install button, in the Agents window or in an editor window, which opens
	 * the extension in the Extensions editor. Installing it fails with `installError` the first time, and each prompt is answered
	 * with its first button.
	 */
	async function install(extension: IExtension, agentsWindow: boolean, installError?: Error) {
		const opened: string[] = [];
		const installed: string[] = [];
		const prompts: string[][] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override async canInstall() { return true as const; }
			override canSetLanguage() { return false; }
			override async open(extension: IExtension | string) { opened.push(typeof extension === 'string' ? extension : extension.identifier.id); }
			override async install(extension: IExtension | URI | string, options?: InstallExtensionOptions) {
				assert.ok(typeof extension !== 'string' && !URI.isUri(extension));
				const failed = !!installError && installed.length === 0;
				installed.push(`${extension.identifier.id}${options?.installPreReleaseVersion ? ' (pre-release)' : ''}${options?.donotVerifySignature ? ' (unverified)' : ''}${options?.enable ? ' (enable)' : ''}${failed ? ' failed' : ''}`);
				if (failed) {
					throw installError;
				}
				return extension;
			}
		});
		// Like Insiders and builds from source.
		instantiationService.stub(IWorkbenchExtensionManagementService, new class extends mock<IWorkbenchExtensionManagementService>() {
			override readonly preferPreReleases = true;
		});
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async prompt<T>(prompt: IPrompt<T>) {
				prompts.push((prompt.buttons ?? []).map(button => button.label));
				return { result: await prompt.buttons?.[0].run({ checkboxChecked: false }) };
			}
		});
		instantiationService.stub(IAllowedExtensionsService, new class extends mock<IAllowedExtensionsService>() {
			override readonly onDidChangeAllowedExtensionsConfigValue = Event.None;
			override isAllowed() { return true as const; }
		});
		instantiationService.stub(ILabelService, new class extends mock<ILabelService>() {
			override readonly onDidChangeFormatters = Event.None;
		});
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() { });
		instantiationService.stub(IWorkbenchThemeService, new class extends mock<IWorkbenchThemeService>() { });
		instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() { });
		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { });
		instantiationService.stub(IExtensionGalleryManifestService, new class extends mock<IExtensionGalleryManifestService>() { });
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		// Used to explain why installing failed.
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IProductService, new class extends mock<IProductService>() { });
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() { });
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
		instantiationService.stub(IExtensionManagementServerService, new class extends mock<IExtensionManagementServerService>() { });
		instantiationService.stub(IExtensionGalleryService, new class extends mock<IExtensionGalleryService>() { });
		instantiationService.stub(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() { });
		instantiationService.stub(IWorkbenchIssueService, new class extends mock<IWorkbenchIssueService>() { });

		const action = disposables.add(instantiationService.createInstance(InstallDropdownAction));
		// Like the Agents window, which has no Extensions editor and disables extensions that don't support it by default.
		action.opensExtensionEditor = !agentsWindow;
		action.enablesExtension = agentsWindow;
		action.extension = extension;
		await timeout(0);
		const button = { label: action.label, enabled: action.enabled };

		await action.run();
		return { button, opened, installed, prompts };
	}

	test('installs the version that an extension has when pre-releases are preferred, only opens the Extensions editor where it exists, and enables it in the Agents window', async () => {
		// Has no pre-release version, and is deprecated.
		const extension = aGalleryExtension('pub.old', { deprecationInfo: { disallowInstall: false, extension: { id: 'pub.new', displayName: 'New' } } });

		assert.deepStrictEqual({ editor: await install(extension, false), agentsWindow: await install(extension, true) }, {
			editor: { button: { label: 'Install', enabled: true }, opened: ['pub.old'], installed: ['pub.old'], prompts: [['Install Anyway', '&&Open New']] },
			agentsWindow: { button: { label: 'Install', enabled: true }, opened: [], installed: ['pub.old (enable)'], prompts: [['Install Anyway']] },
		});
	});

	test('installs again when users choose to after installing fails, like it installed the first time', async () => {
		const extension = aGalleryExtension('pub.unsigned');
		const notSigned = () => new ExtensionManagementError('The extension is not signed.', ExtensionManagementErrorCode.PackageNotSigned);

		assert.deepStrictEqual({ editor: await install(extension, false, notSigned()), agentsWindow: await install(extension, true, notSigned()) }, {
			editor: { button: { label: 'Install', enabled: true }, opened: ['pub.unsigned', 'pub.unsigned'], installed: ['pub.unsigned failed', 'pub.unsigned (unverified)'], prompts: [['Install Anyway']] },
			agentsWindow: { button: { label: 'Install', enabled: true }, opened: [], installed: ['pub.unsigned (enable) failed', 'pub.unsigned (unverified) (enable)'], prompts: [['Install Anyway']] },
		});
	});
});
