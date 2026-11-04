/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { retry, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { singlePagePager } from '../../../../../base/common/paging.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IAllowedExtensionsService, IExtensionGalleryService, ILocalExtension, IQueryOptions } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionContributions, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { Separator } from '../../../../../base/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { ExtensionRuntimeActionType, ExtensionRuntimeState, ExtensionState, IExtension, IExtensionsWorkbenchService, InstallExtensionOptions } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService, SessionsWindowMissingFeature } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentsWindowExtensionGroup, AgentsWindowExtensionsWidget, getMissingFeaturesWarning, getSuggestedContributionLabels, groupAgentsWindowExtensions, IAgentsWindowExtensionsGroup } from '../../browser/agentsWindowExtensionsWidget.js';
import { AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE } from '../../browser/agentsWindowExtensionsMarketplace.js';
import { IAgentsWindowExtensionSuggestionsService } from '../../browser/agentsWindowExtensionSuggestions.js';

interface ITestExtensionOptions {
	readonly displayName: string;
	readonly publisher?: string;
	readonly description?: string;
	readonly isBuiltin?: boolean;
	readonly state?: ExtensionState;
	readonly installed?: boolean;
	readonly enablementState?: EnablementState;
	readonly contributes?: Record<string, unknown>;
	readonly runtimeState?: ExtensionRuntimeState;
	/** Whether the extension has a pre-release version, in addition to a release version. */
	readonly preRelease?: boolean;
	/** What the Marketplace says about an extension that isn't installed. */
	readonly marketplace?: { readonly installCount: number; readonly rating: number; readonly ratingCount: number; readonly verified: boolean };
}

function anExtension(id: string, options: ITestExtensionOptions): IExtension {
	const manifest: IExtensionManifest = { name: id, publisher: 'pub', version: '1.0.0', engines: { vscode: '*' }, contributes: options.contributes as IExtensionContributions };
	return new class extends mock<IExtension>() {
		override readonly identifier = { id };
		override readonly displayName = options.displayName;
		override readonly publisherDisplayName = options.publisher ?? 'Publisher';
		override readonly description = options.description ?? '';
		override readonly isBuiltin = options.isBuiltin ?? false;
		override readonly state = options.state ?? ExtensionState.Installed;
		override readonly enablementState = options.enablementState ?? EnablementState.DisabledWorkspace;
		override readonly runtimeState = options.runtimeState;
		override readonly hasReleaseVersion = true;
		override readonly hasPreReleaseVersion = options.preRelease ?? false;
		override readonly installCount = options.marketplace?.installCount;
		override readonly rating = options.marketplace?.rating;
		override readonly ratingCount = options.marketplace?.ratingCount;
		override readonly publisherDomain = options.marketplace ? { link: 'https://example.com', verified: options.marketplace.verified } : undefined;
		override readonly url = options.marketplace ? 'https://example.com' : undefined;
		override readonly local = options.installed === false ? undefined : new class extends mock<ILocalExtension>() {
			override readonly manifest = manifest;
		}();
	}();
}

/**
 * Stubs the services that searching the Marketplace and installing from it need, with the Marketplace unavailable unless requested.
 */
function stubMarketplaceServices(instantiationService: TestInstantiationService, marketplaceStatus: () => ExtensionGalleryManifestStatus = () => ExtensionGalleryManifestStatus.Unavailable, onDidChangeMarketplaceStatus: Event<ExtensionGalleryManifestStatus> = Event.None): void {
	instantiationService.stub(IExtensionGalleryService, new class extends mock<IExtensionGalleryService>() {
		override isEnabled() { return marketplaceStatus() === ExtensionGalleryManifestStatus.Available; }
	});
	instantiationService.stub(IWorkbenchExtensionManagementService, new class extends mock<IWorkbenchExtensionManagementService>() {
		// Like Insiders and builds from source.
		override readonly preferPreReleases = true;
	});
	instantiationService.stub(IAllowedExtensionsService, new class extends mock<IAllowedExtensionsService>() {
		override readonly onDidChangeAllowedExtensionsConfigValue = Event.None;
		override isAllowed() { return true as const; }
	});
	instantiationService.stub(IExtensionGalleryManifestService, new class extends mock<IExtensionGalleryManifestService>() {
		override get extensionGalleryManifestStatus() { return marketplaceStatus(); }
		override readonly onDidChangeExtensionGalleryManifestStatus = onDidChangeMarketplaceStatus;
	});
	instantiationService.stub(IPreferencesService, new class extends mock<IPreferencesService>() { });
	instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() { });
}

/**
 * Returns the accessible names of the rendered tree rows in order, once `predicate` holds for them.
 */
async function waitForRowLabels(container: HTMLElement, predicate: (labels: readonly string[]) => boolean): Promise<string[]> {
	// Browser tests load component CSS asynchronously, and the tree only renders its rows once the CSS gives it a height.
	return retry(async () => {
		const labels = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
			.sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
			.map(row => row.getAttribute('aria-label') ?? '');
		assert.ok(predicate(labels), labels.join('\n'));
		return labels;
	}, 100, 30);
}

function summarize(groups: readonly IAgentsWindowExtensionsGroup[]) {
	return groups.map(group => ({ group: group.group, entries: group.entries.map(entry => ({ id: entry.extension.identifier.id, nameMatches: entry.nameMatches })) }));
}

suite('AgentsWindowExtensionsWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const supportedIds = new Set(['pub.zeta', 'pub.alpha', 'pub.builtin']);
	const supportsAgentsWindow = (extension: IExtension) => supportedIds.has(extension.identifier.id);
	const isSuggested = (extension: IExtension) => extension.identifier.id === 'pub.python';

	const extensions = [
		anExtension('pub.zeta', { displayName: 'Zeta Theme' }),
		anExtension('pub.alpha', { displayName: 'Alpha Grammar' }),
		anExtension('pub.python', { displayName: 'Python', publisher: 'Microsoft', description: 'Python language support' }),
		anExtension('pub.eslint', { displayName: 'ESLint', description: 'Integrates ESLint JavaScript into VS Code.' }),
		anExtension('pub.builtin', { displayName: 'Built-in', isBuiltin: true }),
		anExtension('pub.uninstalling', { displayName: 'Uninstalling', state: ExtensionState.Uninstalling }),
		anExtension('pub.gallery', { displayName: 'Gallery Only', installed: false }),
	];

	test('groups installed non built-in extensions into suggested, supported, and other extensions', () => {
		assert.deepStrictEqual(summarize(groupAgentsWindowExtensions(extensions, '', supportsAgentsWindow, isSuggested)), [
			{ group: AgentsWindowExtensionGroup.Suggested, entries: [{ id: 'pub.python', nameMatches: undefined }] },
			{ group: AgentsWindowExtensionGroup.Supported, entries: [{ id: 'pub.alpha', nameMatches: undefined }, { id: 'pub.zeta', nameMatches: undefined }] },
			{ group: AgentsWindowExtensionGroup.Other, entries: [{ id: 'pub.eslint', nameMatches: undefined }] },
		]);
	});

	test('filters by name, identifier, publisher, and description', () => {
		assert.deepStrictEqual({
			name: summarize(groupAgentsWindowExtensions(extensions, ' theme ', supportsAgentsWindow, isSuggested)),
			identifier: summarize(groupAgentsWindowExtensions(extensions, 'pub.py', supportsAgentsWindow, isSuggested)),
			publisher: summarize(groupAgentsWindowExtensions(extensions, 'microsoft', supportsAgentsWindow, isSuggested)),
			description: summarize(groupAgentsWindowExtensions(extensions, 'javascript', supportsAgentsWindow, isSuggested)),
			excluded: summarize(groupAgentsWindowExtensions(extensions, 'built-in', supportsAgentsWindow, isSuggested)),
		}, {
			name: [
				{ group: AgentsWindowExtensionGroup.Suggested, entries: [] },
				{ group: AgentsWindowExtensionGroup.Supported, entries: [{ id: 'pub.zeta', nameMatches: [{ start: 5, end: 10 }] }] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [] },
			],
			identifier: [
				{ group: AgentsWindowExtensionGroup.Suggested, entries: [{ id: 'pub.python', nameMatches: undefined }] },
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [] },
			],
			publisher: [
				{ group: AgentsWindowExtensionGroup.Suggested, entries: [{ id: 'pub.python', nameMatches: undefined }] },
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [] },
			],
			description: [
				{ group: AgentsWindowExtensionGroup.Suggested, entries: [] },
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [{ id: 'pub.eslint', nameMatches: undefined }] },
			],
			excluded: [
				{ group: AgentsWindowExtensionGroup.Suggested, entries: [] },
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [] },
			],
		});
	});

	test('names what suggested extensions contribute, once each and in a stable order', () => {
		const labels = (contributes: Record<string, unknown>) => getSuggestedContributionLabels({ name: 'a', publisher: 'pub', version: '1.0.0', engines: { vscode: '*' }, contributes: contributes as IExtensionContributions });

		assert.deepStrictEqual({
			none: labels({ commands: [{}], views: { explorer: [{}] } }),
			toolsOnce: labels({ languageModelToolSets: [{}], languageModelTools: [{}] }),
			ordered: labels({ chatPlugins: [{}], chatSkills: [{}], mcpServerDefinitionProviders: [{}], chatPromptFiles: [{}], chatAgents: [{}], chatInstructions: [{}], languageModelTools: [{}] }),
		}, {
			none: [],
			toolsOnce: ['Tools'],
			ordered: ['Tools', 'MCP Servers', 'Skills', 'Agents', 'Instructions', 'Prompts', 'Plugins'],
		});
	});

	test('warns about the features that the Agents window lacks', () => {
		assert.deepStrictEqual({
			none: getMissingFeaturesWarning([]),
			one: getMissingFeaturesWarning([SessionsWindowMissingFeature.Views]),
			several: getMissingFeaturesWarning([SessionsWindowMissingFeature.Views, SessionsWindowMissingFeature.Debugging, SessionsWindowMissingFeature.StatusBar, SessionsWindowMissingFeature.Walkthroughs]),
		}, {
			none: undefined,
			one: 'Contributes views, which are not supported in the Agents window.',
			several: 'Contributes views, debuggers, status bar items, walkthroughs, which are not supported in the Agents window.',
		});
	});

	test('dismisses the badge when the user navigates to the section and while it shows new extensions', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const onChange = disposables.add(new Emitter<IExtension | undefined>());
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = extensions;
			override readonly onChange = onChange.event;
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState() { return false; }
		});
		instantiationService.stub(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() {
			override canExecuteOnSessionsWindow() { return false; }
		});
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensions = Event.None;
		});
		instantiationService.stub(IHostService, new class extends mock<IHostService>() { });
		let dismissals = 0;
		instantiationService.stub(IAgentsWindowExtensionSuggestionsService, new class extends mock<IAgentsWindowExtensionSuggestionsService>() {
			override readonly suggestedExtensions = constObservable<readonly IExtension[]>([]);
			override dismissBadge() { dismissals++; }
		});
		stubMarketplaceServices(instantiationService);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, mainWindow.document.createElement('div')));

		onChange.fire(undefined);
		const beforeNavigation = dismissals;
		widget.setVisible(true);
		const afterNavigation = dismissals;
		onChange.fire(undefined);
		const afterChangeWhileVisible = dismissals;
		widget.setVisible(false);
		onChange.fire(undefined);

		assert.deepStrictEqual(
			{ beforeNavigation, afterNavigation, afterChangeWhileVisible, afterChangeWhileHidden: dismissals },
			{ beforeNavigation: 0, afterNavigation: 1, afterChangeWhileVisible: 2, afterChangeWhileHidden: 2 },
		);
	});

	test('logs each extension that the user enables or disables, unless the change is cancelled', async () => {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		container.style.width = '800px';
		container.style.height = '600px';
		// Unit tests don't define the design tokens, and the section's content is only as wide as this one allows.
		container.style.setProperty('--vscode-spacing-size400', '40px');
		disposables.add(toDisposable(() => container.remove()));
		const local = [
			anExtension('Pub.Tools', { displayName: 'Tools', contributes: { languageModelTools: [{}], chatSkills: [{}], views: { explorer: [{}] } } }),
			anExtension('pub.theme', { displayName: 'Theme', contributes: { themes: [{}] }, enablementState: EnablementState.EnabledWorkspace }),
			anExtension('pub.cancelled', { displayName: 'Cancelled', contributes: { languageModelTools: [{}] } }),
		];
		const requested: string[] = [];
		const events: { readonly eventName: string; readonly data: object | undefined }[] = [];
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = local;
			override readonly onChange = Event.None;
			override async setEnablement(extension: IExtension | IExtension[], enablementState: EnablementState) {
				const { id } = (Array.isArray(extension) ? extension[0] : extension).identifier;
				requested.push(`${id}: ${enablementState === EnablementState.EnabledWorkspace ? 'enable' : 'disable'}`);
				if (id === 'pub.cancelled') {
					throw new CancellationError();
				}
			}
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState(state: EnablementState) { return state === EnablementState.EnabledWorkspace; }
			override canChangeWorkspaceEnablement() { return true; }
		});
		instantiationService.stub(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() {
			override canExecuteOnSessionsWindow() { return false; }
		});
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensions = Event.None;
		});
		instantiationService.stub(IHostService, new class extends mock<IHostService>() { });
		instantiationService.stub(IAgentsWindowExtensionSuggestionsService, new class extends mock<IAgentsWindowExtensionSuggestionsService>() {
			override readonly suggestedExtensions = constObservable<readonly IExtension[]>([]);
			override dismissBadge() { }
		});
		instantiationService.stub(ITelemetryService, new class extends NullTelemetryServiceShape {
			override publicLog2(eventName?: string, data?: object) {
				if (eventName) {
					events.push({ eventName, data });
				}
			}
		});
		stubMarketplaceServices(instantiationService);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, container));
		widget.setVisible(true);

		for (const name of ['Tools', 'Theme', 'Cancelled']) {
			// Browser tests load component CSS asynchronously, and the tree only renders its rows once the CSS gives it a height.
			const toggle = await retry(async () => {
				const element = container.querySelector<HTMLElement>(`[aria-label="Run ${name} in the Agents window"]`);
				assert.ok(element, name);
				return element;
			}, 10, 100);
			toggle.click();
			await timeout(0);
		}

		const changed = (extensionId: string, enabled: boolean, aiFeatures: string) => ({ eventName: 'agentsWindowExtensionEnablementChanged', data: { extensionId, enabled, aiFeatures, trigger: 'toggle' } });
		assert.deepStrictEqual({ requested, events }, {
			requested: ['Pub.Tools: enable', 'pub.theme: disable', 'pub.cancelled: enable'],
			events: [
				changed('pub.tools', true, 'chatSkills,languageModelTools'),
				changed('pub.theme', false, ''),
			],
		});
	});

	test('shows a button on rows that need a restart, which restarts extensions or reloads the window', async () => {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		container.style.width = '800px';
		container.style.height = '600px';
		container.style.setProperty('--vscode-spacing-size400', '40px');
		disposables.add(toDisposable(() => container.remove()));
		const local = [
			anExtension('pub.restart', { displayName: 'Restart', runtimeState: { action: ExtensionRuntimeActionType.RestartExtensions, reason: 'Please restart extensions to disable this extension.' } }),
			anExtension('pub.reload', { displayName: 'Reload', runtimeState: { action: ExtensionRuntimeActionType.ReloadWindow, reason: 'Please reload window to enable this extension.' } }),
			anExtension('pub.running', { displayName: 'Running' }),
		];
		const runs: string[] = [];
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = local;
			override readonly onChange = Event.None;
			override async updateRunningExtensions() { runs.push('restartExtensions'); }
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState() { return false; }
			override canChangeWorkspaceEnablement() { return true; }
		});
		instantiationService.stub(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() {
			override canExecuteOnSessionsWindow() { return false; }
		});
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensions = Event.None;
		});
		instantiationService.stub(IHostService, new class extends mock<IHostService>() {
			override async reload() { runs.push('reloadWindow'); }
		});
		instantiationService.stub(IAgentsWindowExtensionSuggestionsService, new class extends mock<IAgentsWindowExtensionSuggestionsService>() {
			override readonly suggestedExtensions = constObservable<readonly IExtension[]>([]);
			override dismissBadge() { }
		});
		stubMarketplaceServices(instantiationService);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, container));
		widget.setVisible(true);

		// Browser tests load component CSS asynchronously, and the tree only renders its rows once the CSS gives it a height.
		const rows = await retry(async () => {
			const elements = [...container.querySelectorAll<HTMLElement>('.agents-window-extension-row')];
			assert.strictEqual(elements.length, local.length);
			return elements;
		}, 10, 100);
		const buttons = rows.map(row => row.querySelector<HTMLElement>('.agents-window-extension-runtime-action'));
		const visibleButtons = buttons.map(button => button && button.style.display !== 'none' ? { label: button.textContent, tabIndex: button.tabIndex } : undefined);
		for (const button of buttons) {
			if (button?.style.display !== 'none') {
				button?.click();
			}
		}
		await timeout(0);

		assert.deepStrictEqual({ visibleButtons, runs }, {
			// Rows are sorted by display name.
			visibleButtons: [{ label: 'Reload Window', tabIndex: -1 }, { label: 'Restart Extensions', tabIndex: -1 }, undefined],
			runs: ['reloadWindow', 'restartExtensions'],
		});
	});

	function createContainer(): HTMLElement {
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		container.style.width = '800px';
		container.style.height = '600px';
		// Unit tests don't define the design tokens, and the section's content is only as wide as this one allows.
		container.style.setProperty('--vscode-spacing-size400', '40px');
		disposables.add(toDisposable(() => container.remove()));
		return container;
	}

	function stubSectionServices(instantiationService: TestInstantiationService, marketplaceStatus = () => ExtensionGalleryManifestStatus.Available, onDidChangeMarketplaceStatus?: Event<ExtensionGalleryManifestStatus>): void {
		instantiationService.stub(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() {
			override canExecuteOnSessionsWindow() { return false; }
		});
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensions = Event.None;
		});
		instantiationService.stub(IHostService, new class extends mock<IHostService>() { });
		instantiationService.stub(IAgentsWindowExtensionSuggestionsService, new class extends mock<IAgentsWindowExtensionSuggestionsService>() {
			override readonly suggestedExtensions = constObservable<readonly IExtension[]>([]);
			override dismissBadge() { }
		});
		stubMarketplaceServices(instantiationService, marketplaceStatus, onDidChangeMarketplaceStatus);
	}

	test('lists Marketplace extensions that match the search and are not installed, and installed extensions that the Marketplace found', async () => {
		const container = createContainer();
		// Doesn't mention the search text, but the Marketplace found it.
		const prettier = anExtension('pub.prettier', { displayName: 'Prettier', description: 'Opinionated code styling' });
		// Installed extensions report that they are installing while they are updated.
		const updating = anExtension('pub.updating', { displayName: 'Updating Formatter', state: ExtensionState.Installing });
		const local = [prettier, updating, anExtension('pub.unrelated', { displayName: 'Unrelated' })];
		const queries: IQueryOptions[] = [];
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = local;
			override readonly onChange = Event.None;
			override async queryGallery(options: IQueryOptions | CancellationToken) {
				assert.ok(!CancellationToken.isCancellationToken(options));
				queries.push(options);
				return singlePagePager([
					prettier,
					updating,
					anExtension('pub.black', { displayName: 'Black Formatter', publisher: 'Microsoft', state: ExtensionState.Uninstalled, installed: false, marketplace: { installCount: 500, rating: 4.4, ratingCount: 10, verified: true } }),
					anExtension('pub.blocked', { displayName: 'Blocked Formatter', state: ExtensionState.Uninstalled, installed: false }),
					anExtension('pub.builtInFormatter', { displayName: 'Built-in Formatter', state: ExtensionState.Uninstalled, installed: false, isBuiltin: true }),
				]);
			}
			override async canInstall(extension: IExtension) {
				return extension.identifier.id === 'pub.blocked' ? new MarkdownString('Your organization does not allow this extension.') : true as const;
			}
			override canSetLanguage() { return false; }
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState() { return false; }
			override canChangeWorkspaceEnablement() { return true; }
		});
		stubSectionServices(instantiationService);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, container));
		widget.setVisible(true);

		widget.setSearchQuery('formatter');
		const labels = await waitForRowLabels(container, labels => labels.some(label => label.includes('Can\'t be installed')));

		assert.deepStrictEqual({ queries, labels }, {
			queries: [{ text: 'formatter', source: AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE }],
			labels: [
				'Other Extensions, 1 extensions. Extensions that haven\'t declared support for the Agents window. They are disabled by default and might not work as expected.',
				'Prettier, Publisher, Disabled',
				'Marketplace, 2 extensions. Extensions from the Marketplace that aren\'t installed. Installing one here also installs it in VS Code, and enables it in the Agents window.',
				'Black Formatter, Microsoft, Verified publisher, 500 installs, Rated 4.5 out of 5, Not installed',
				'Blocked Formatter, Publisher, Can\'t be installed: Your organization does not allow this extension.',
			],
		});
	});

	/**
	 * Searches the Marketplace for a Tools extension, installs it from its row with `install`, and returns what happened.
	 */
	async function installFromMarketplace(preRelease: boolean, install: (row: HTMLElement) => void) {
		const container = createContainer();
		const marketplaceTools = anExtension('pub.tools', { displayName: 'Tools', state: ExtensionState.Uninstalled, installed: false, preRelease });
		const installedTools = anExtension('pub.tools', { displayName: 'Tools', contributes: { languageModelTools: [{}] } });
		const local: IExtension[] = [];
		const onChange = disposables.add(new Emitter<IExtension | undefined>());
		const calls: string[] = [];
		const menus: string[][] = [];
		const events: { readonly eventName: string; readonly data: object | undefined }[] = [];
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = local;
			override readonly onChange = onChange.event;
			override async queryGallery() { return singlePagePager([marketplaceTools]); }
			override async canInstall() { return true as const; }
			override canSetLanguage() { return false; }
			override async open(extension: IExtension | string) { calls.push(`open ${typeof extension === 'string' ? extension : extension.identifier.id}`); }
			override async install(extension: IExtension | URI | string, options?: InstallExtensionOptions) {
				assert.ok(typeof extension !== 'string' && !URI.isUri(extension));
				calls.push(`install ${extension.identifier.id}${options?.installPreReleaseVersion ? ' (pre-release)' : ''}`);
				local.push(installedTools);
				onChange.fire(installedTools);
				return marketplaceTools;
			}
			override async setEnablement(extension: IExtension | IExtension[], enablementState: EnablementState) {
				calls.push(`${enablementState === EnablementState.EnabledWorkspace ? 'enable' : 'disable'} ${(Array.isArray(extension) ? extension[0] : extension).identifier.id}`);
			}
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState(state: EnablementState) { return state === EnablementState.EnabledWorkspace; }
			override canChangeWorkspaceEnablement() { return true; }
		});
		instantiationService.stub(ITelemetryService, new class extends NullTelemetryServiceShape {
			override publicLog2(eventName?: string, data?: object) {
				if (eventName) {
					events.push({ eventName, data });
				}
			}
		});
		// Chooses the release version from the menu of other versions.
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override readonly onDidShowContextMenu = Event.None;
			override readonly onDidHideContextMenu = Event.None;
			override showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate) {
				const actions = delegate.getActions?.() ?? [];
				menus.push(actions.map(action => action.label));
				actions.find(action => action.label === 'Install Release Version')?.run();
			}
		});
		stubSectionServices(instantiationService);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, container));
		widget.setVisible(true);

		widget.setSearchQuery('tools');
		const row = await retry(async () => {
			const element = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].find(row => row.getAttribute('aria-label')?.startsWith('Tools,') && row.querySelector('.action-label.install:not(.disabled)'));
			assert.ok(element);
			return element;
		}, 100, 30);
		const button = row.querySelector<HTMLElement>('.action-label.install')!.textContent;
		install(row);
		await retry(async () => assert.ok(calls.some(call => call.startsWith('enable'))), 100, 30);
		return { button, menus, calls, events };
	}

	test('installs a Marketplace extension with Enter without opening the Extensions editor, and enables it in the Agents window once installed', async () => {
		const result = await installFromMarketplace(false, row => {
			row.click();
			row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		});

		assert.deepStrictEqual(result, {
			// Installs the release version, the only one it has, even though pre-releases are preferred.
			button: 'Install',
			menus: [],
			calls: ['install pub.tools', 'enable pub.tools'],
			events: [{ eventName: 'agentsWindowExtensionEnablementChanged', data: { extensionId: 'pub.tools', enabled: true, aiFeatures: 'languageModelTools', trigger: 'install' } }],
		});
	});

	test('installs another version of a Marketplace extension from the menu of its Install button, and enables it in the Agents window once installed', async () => {
		const result = await installFromMarketplace(true, row => {
			row.querySelector<HTMLElement>('.action-dropdown-item .dropdown-label')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		});

		assert.deepStrictEqual(result, {
			button: 'Install Pre-Release',
			// Like the Extensions view, the menu lists every version, including the button's.
			menus: [['Install Pre-Release Version', 'Install Release Version']],
			calls: ['install pub.tools', 'enable pub.tools'],
			events: [{ eventName: 'agentsWindowExtensionEnablementChanged', data: { extensionId: 'pub.tools', enabled: true, aiFeatures: 'languageModelTools', trigger: 'install' } }],
		});
	});

	/**
	 * Renders the section without installed extensions, where each Marketplace search finds a Tools extension, as a new object
	 * like the extensions workbench service returns.
	 */
	function renderMarketplaceSection(queries: IQueryOptions[], marketplaceStatus?: () => ExtensionGalleryManifestStatus, onDidChangeMarketplaceStatus?: Event<ExtensionGalleryManifestStatus>) {
		const container = createContainer();
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = [];
			override readonly onChange = Event.None;
			override async queryGallery(options: IQueryOptions | CancellationToken) {
				assert.ok(!CancellationToken.isCancellationToken(options));
				queries.push(options);
				return singlePagePager([anExtension('pub.tools', { displayName: 'Tools', state: ExtensionState.Uninstalled, installed: false })]);
			}
			override async canInstall() { return true as const; }
			override canSetLanguage() { return false; }
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState() { return false; }
			override canChangeWorkspaceEnablement() { return true; }
		});
		stubSectionServices(instantiationService, marketplaceStatus, onDidChangeMarketplaceStatus);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, container));
		widget.setVisible(true);
		return { container, widget };
	}

	/**
	 * Returns the rendered tree row whose accessible name starts with `label`, once `predicate` holds for it.
	 */
	function waitForRow(container: HTMLElement, label: string, predicate: (row: HTMLElement) => boolean = () => true): Promise<HTMLElement> {
		return retry(async () => {
			const row = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].find(row => row.getAttribute('aria-label')?.startsWith(label) && predicate(row));
			assert.ok(row, label);
			return row;
		}, 100, 30);
	}

	const marketplaceGroupLabel = 'Marketplace, 1 extensions. Extensions from the Marketplace that aren\'t installed. Installing one here also installs it in VS Code, and enables it in the Agents window.';

	test('shows the install count and rating of installed extensions while the Marketplace can be searched', async () => {
		const container = createContainer();
		const onDidChangeMarketplaceStatus = disposables.add(new Emitter<ExtensionGalleryManifestStatus>());
		let marketplaceStatus = ExtensionGalleryManifestStatus.Available;
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = [
				anExtension('pub.black', { displayName: 'Black Formatter', marketplace: { installCount: 500, rating: 4.4, ratingCount: 10, verified: true } }),
				// Isn't in the Marketplace.
				anExtension('pub.local', { displayName: 'Local Formatter' }),
			];
			override readonly onChange = Event.None;
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState() { return false; }
			override canChangeWorkspaceEnablement() { return true; }
		});
		stubSectionServices(instantiationService, () => marketplaceStatus, onDidChangeMarketplaceStatus.event);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, container));
		widget.setVisible(true);
		const rows = (predicate: (labels: readonly string[]) => boolean) => retry(async () => {
			const rendered = [...container.querySelectorAll<HTMLElement>('.agents-window-extension-row')].map(row => ({
				label: row.closest('.monaco-list-row')?.getAttribute('aria-label') ?? '',
				statistics: [...row.querySelectorAll('.agents-window-extension-install-count, .agents-window-extension-rating')].map(element => element.textContent).filter(Boolean),
			}));
			assert.ok(rendered.length === 2 && predicate(rendered.map(row => row.label)), JSON.stringify(rendered));
			return rendered;
		}, 100, 30);

		const available = await rows(labels => labels.some(label => label.includes('installs')));
		// Like a private Marketplace once users sign out.
		marketplaceStatus = ExtensionGalleryManifestStatus.RequiresSignIn;
		onDidChangeMarketplaceStatus.fire(marketplaceStatus);

		assert.deepStrictEqual({ available, unavailable: await rows(labels => !labels.some(label => label.includes('installs'))) }, {
			available: [
				{ label: 'Black Formatter, Publisher, 500 installs, Rated 4.5 out of 5, Disabled', statistics: ['500', '4.5'] },
				{ label: 'Local Formatter, Publisher, Disabled', statistics: [] },
			],
			unavailable: [
				{ label: 'Black Formatter, Publisher, Disabled', statistics: [] },
				{ label: 'Local Formatter, Publisher, Disabled', statistics: [] },
			],
		});
	});

	test('expands the Marketplace group with each new search, even when the user collapsed it', async () => {
		const queries: IQueryOptions[] = [];
		const { container, widget } = renderMarketplaceSection(queries);

		widget.setSearchQuery('tools');
		await waitForRow(container, 'Tools,');
		(await waitForRow(container, 'Marketplace,')).click();
		const collapsed = (await waitForRow(container, 'Marketplace,', row => row.getAttribute('aria-expanded') === 'false')).getAttribute('aria-expanded');
		widget.setSearchQuery('tool');
		await retry(async () => assert.strictEqual(queries.length, 2), 100, 30);
		const labels = await waitForRowLabels(container, labels => labels.some(label => label.startsWith('Tools,')));

		assert.deepStrictEqual({ collapsed, expanded: (await waitForRow(container, 'Marketplace,')).getAttribute('aria-expanded'), labels }, {
			collapsed: 'false',
			expanded: 'true',
			labels: [marketplaceGroupLabel, 'Tools, Publisher, Not installed'],
		});
	});

	test('puts only the actions of the focused Marketplace row in the tab order, following the focus of the list across searches', async () => {
		const queries: IQueryOptions[] = [];
		const { container, widget } = renderMarketplaceSection(queries);
		const installButtonTabIndex = async (predicate: (tabIndex: number) => boolean) => {
			const row = await waitForRow(container, 'Tools,', row => {
				const button = row.querySelector<HTMLElement>('.action-label.install:not(.disabled)');
				return !!button && predicate(button.tabIndex);
			});
			return { row, tabIndex: row.querySelector<HTMLElement>('.action-label.install')!.tabIndex };
		};

		widget.setSearchQuery('tools');
		const unfocused = await installButtonTabIndex(() => true);
		unfocused.row.click();
		const focused = await installButtonTabIndex(tabIndex => tabIndex === 0);
		widget.setSearchQuery('tool');
		await retry(async () => assert.strictEqual(queries.length, 2), 100, 30);
		// The list loses its focus when the new search replaces the focused row while it searches.
		const searchedAgain = await installButtonTabIndex(() => true);
		searchedAgain.row.click();
		const refocused = await installButtonTabIndex(tabIndex => tabIndex === 0);

		assert.deepStrictEqual([unfocused, focused, searchedAgain, refocused].map(({ tabIndex }) => tabIndex), [-1, 0, -1, 0]);
	});

	test('explains why a private Marketplace can\'t be searched, and searches it once the user signs in', async () => {
		const queries: IQueryOptions[] = [];
		const onDidChangeMarketplaceStatus = disposables.add(new Emitter<ExtensionGalleryManifestStatus>());
		let marketplaceStatus = ExtensionGalleryManifestStatus.RequiresSignIn;
		const { container, widget } = renderMarketplaceSection(queries, () => marketplaceStatus, onDidChangeMarketplaceStatus.event);
		const searchBox = () => {
			const inputBox = container.querySelector<HTMLElement>('.monaco-inputbox')!;
			return { placeholder: inputBox.querySelector('input')!.placeholder, message: ['info', 'warning', 'error'].find(type => inputBox.classList.contains(type)) };
		};

		widget.setSearchQuery('tools');
		const requiresSignIn = await retry(async () => {
			const state = searchBox();
			assert.ok(state.message);
			return state;
		}, 100, 30);
		marketplaceStatus = ExtensionGalleryManifestStatus.Available;
		onDidChangeMarketplaceStatus.fire(marketplaceStatus);
		const labels = await waitForRowLabels(container, labels => labels.some(label => label.startsWith('Tools,')));

		assert.deepStrictEqual({ requiresSignIn, available: searchBox(), queries, labels }, {
			requiresSignIn: { placeholder: 'Type to search...', message: 'info' },
			available: { placeholder: 'Search installed extensions and the Marketplace...', message: undefined },
			queries: [{ text: 'tools', source: AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE }],
			labels: [marketplaceGroupLabel, 'Tools, Publisher, Not installed'],
		});
	});

	test('uninstalls an extension from its menu once the user confirms, unless the user chose not to be asked again, and offers to restart extensions while it keeps running', async () => {
		const container = createContainer();
		const anInstalledExtension = (name: string, displayName: string) => new class extends mock<IExtension>() {
			override readonly identifier = { id: `pub.${name}` };
			override readonly displayName = displayName;
			override readonly publisherDisplayName = 'Publisher';
			override readonly description = '';
			override readonly isBuiltin = false;
			override readonly enablementState = EnablementState.EnabledWorkspace;
			override readonly local = new class extends mock<ILocalExtension>() {
				override readonly manifest: IExtensionManifest = { name, publisher: 'pub', version: '1.0.0', engines: { vscode: '*' } };
				override readonly isApplicationScoped = false;
			}();
			override state = ExtensionState.Installed;
			override runtimeState: ExtensionRuntimeState | undefined = undefined;
		}();
		const tools = anInstalledExtension('tools', 'Tools');
		const theme = anInstalledExtension('theme', 'Theme');
		const local: IExtension[] = [tools, theme];
		const onChange = disposables.add(new Emitter<IExtension | undefined>());
		// Cancels the first time, then confirms and chooses not to be asked again.
		const answers = [{ confirmed: false }, { confirmed: true, checkboxChecked: true }];
		const dialogs: string[] = [];
		const menus: string[][] = [];
		const calls: string[] = [];
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override readonly local = local;
			override readonly onChange = onChange.event;
			override async uninstall(extension: IExtension) {
				calls.push(`uninstall ${extension.identifier.id}`);
				const uninstalled = extension === tools ? tools : theme;
				local.splice(local.indexOf(uninstalled), 1);
				uninstalled.state = ExtensionState.Uninstalled;
				if (uninstalled === tools) {
					// It is running, so it keeps running until extensions restart.
					tools.runtimeState = { action: ExtensionRuntimeActionType.RestartExtensions, reason: 'Please restart extensions to complete the uninstallation of this extension.' };
				}
				onChange.fire(uninstalled);
			}
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
			override isEnabledEnablementState(state: EnablementState) { return state === EnablementState.EnabledWorkspace; }
			override canChangeWorkspaceEnablement() { return true; }
		});
		instantiationService.stub(IUserDataProfilesService, new class extends mock<IUserDataProfilesService>() {
			override readonly profiles = [];
		});
		instantiationService.stub(IConfigurationService, new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown) {
				calls.push(`set ${key} to ${value}`);
				await this.setUserConfiguration(key, value);
			}
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation) {
				dialogs.push(`${confirmation.message} ${confirmation.detail} [${confirmation.checkbox?.label}]`);
				return answers.shift() ?? { confirmed: false };
			}
		});
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override readonly onDidShowContextMenu = Event.None;
			override readonly onDidHideContextMenu = Event.None;
			override showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate) {
				const actions = delegate.getActions?.() ?? [];
				menus.push(actions.map(action => action instanceof Separator ? '---' : `${action.label}${action.enabled ? '' : ' (disabled)'}`));
				actions.find(action => action.label.startsWith('Uninstall'))?.run();
			}
		});
		stubSectionServices(instantiationService);
		const widget = disposables.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, container));
		widget.setVisible(true);
		const moreActions = async (label: string) => (await waitForRow(container, label)).querySelector<HTMLElement>('.agents-window-extension-more-actions')!;

		const toolsMoreActions = await moreActions('Tools,');
		const ariaLabel = toolsMoreActions.getAttribute('aria-label');
		toolsMoreActions.click();
		await retry(async () => assert.strictEqual(dialogs.length, 1), 100, 30);
		toolsMoreActions.click();
		await retry(async () => assert.deepStrictEqual(calls, ['set extensions.experimental.agentsWindowConfirmUninstall to false', 'uninstall pub.tools']), 100, 30);
		(await moreActions('Theme,')).click();
		const restart = await retry(async () => {
			const button = container.querySelector<HTMLElement>('.agents-window-extensions-title-row > .monaco-button');
			assert.ok(calls.includes('uninstall pub.theme') && button && button.style.display !== 'none');
			return button.textContent;
		}, 100, 30);

		const confirmation = 'Do you want to uninstall \'Tools\'? Uninstalling it here also uninstalls it from VS Code. [Do not ask me again]';
		assert.deepStrictEqual({ ariaLabel, menus, dialogs, calls, restart, rows: container.querySelectorAll('.monaco-list-row').length }, {
			ariaLabel: 'More Actions for Tools',
			// Only asks for more input while uninstalling asks for confirmation.
			menus: [['Disable', '---', 'Uninstall...'], ['Disable', '---', 'Uninstall...'], ['Disable', '---', 'Uninstall']],
			dialogs: [confirmation, confirmation],
			calls: ['set extensions.experimental.agentsWindowConfirmUninstall to false', 'uninstall pub.tools', 'uninstall pub.theme'],
			restart: 'Restart Extensions',
			rows: 0,
		});
	});
});
