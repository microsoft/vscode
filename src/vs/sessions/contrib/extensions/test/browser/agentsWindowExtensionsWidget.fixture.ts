/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { singlePagePager } from '../../../../../base/common/paging.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IAllowedExtensionsService, IExtensionGalleryService, ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { ExtensionRuntimeActionType, ExtensionRuntimeState, ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AgentsWindowExtensionsWidget } from '../../browser/agentsWindowExtensionsWidget.js';
import { IAgentsWindowExtensionSuggestionsService } from '../../browser/agentsWindowExtensionSuggestions.js';

interface IFixtureExtension {
	readonly name: string;
	readonly displayName: string;
	readonly publisher: string;
	readonly description: string;
	readonly supported: boolean;
	readonly enablementState: EnablementState;
	readonly runtimeState?: ExtensionRuntimeState;
	/** Whether the extension is suggested when suggestions are shown. */
	readonly suggested?: boolean;
	readonly contributes?: Record<string, unknown>;
	/** What the Marketplace reports for the extension, unless it isn't in the Marketplace. */
	readonly marketplace?: { readonly installCount: number; readonly rating: number };
}

const fixtureExtensions: readonly IFixtureExtension[] = [
	{ name: 'one-dark', displayName: 'One Dark Pro', publisher: 'binaryify', description: 'Atom\'s iconic One Dark theme for Visual Studio Code', supported: true, enablementState: EnablementState.EnabledGlobally, marketplace: { installCount: 9_800_000, rating: 4.6 } },
	{ name: 'material-icons', displayName: 'Material Icon Theme', publisher: 'Philipp Kief', description: 'Material Design Icons for Visual Studio Code', supported: true, enablementState: EnablementState.DisabledWorkspace, marketplace: { installCount: 31_000_000, rating: 4.9 } },
	{ name: 'python', displayName: 'Python', publisher: 'Microsoft', description: 'Python language support with extension access points for IntelliSense, debugging, and more.', supported: false, enablementState: EnablementState.EnabledWorkspace, runtimeState: { action: ExtensionRuntimeActionType.RestartExtensions, reason: 'Please restart extensions to enable this extension.' }, suggested: true, contributes: { debuggers: [{}], languageModelTools: [{}], languageModelToolSets: [{}] }, marketplace: { installCount: 180_000_000, rating: 4.2 } },
	{ name: 'eslint', displayName: 'ESLint', publisher: 'Microsoft', description: 'Integrates ESLint JavaScript into VS Code.', supported: false, enablementState: EnablementState.DisabledWorkspace, marketplace: { installCount: 42_000_000, rating: 4.4 } },
	{ name: 'gitlens', displayName: 'GitLens — Git supercharged', publisher: 'GitKraken', description: 'Supercharge Git within VS Code — Visualize code authorship at a glance via Git blame annotations and CodeLens.', supported: false, enablementState: EnablementState.DisabledWorkspace, suggested: true, contributes: { viewsContainers: { activitybar: [{}] }, views: { gitlens: [{}] }, walkthroughs: [{}], mcpServerDefinitionProviders: [{}], languageModelTools: [{}], chatSkills: [{}] }, marketplace: { installCount: 40_000_000, rating: 4.3 } },
	// Installed from a VSIX, so the Marketplace reports nothing for it.
	{ name: 'prettier', displayName: 'Prettier - Code formatter', publisher: 'Prettier', description: 'Code formatter using prettier', supported: false, enablementState: EnablementState.DisabledGlobally },
];

function toExtension(extension: IFixtureExtension): IExtension {
	const manifest: IExtensionManifest = { name: extension.name, publisher: 'fixture', version: '1.0.0', engines: { vscode: '*' }, contributes: extension.contributes as IExtensionManifest['contributes'] };
	return new class extends mock<IExtension>() {
		override readonly identifier = { id: `fixture.${extension.name}` };
		override readonly name = extension.name;
		override readonly displayName = extension.displayName;
		override readonly publisherDisplayName = extension.publisher;
		override readonly description = extension.description;
		override readonly isBuiltin = false;
		override readonly state = ExtensionState.Installed;
		override readonly enablementState = extension.enablementState;
		override readonly runtimeState = extension.runtimeState;
		override readonly installCount = extension.marketplace?.installCount;
		override readonly rating = extension.marketplace?.rating;
		override readonly ratingCount = extension.marketplace ? 100 : undefined;
		override readonly url = extension.marketplace ? 'https://example.com' : undefined;
		override readonly iconUrl = undefined;
		override readonly local = new class extends mock<ILocalExtension>() {
			override readonly manifest = manifest;
		}();
	}();
}

interface IFixtureMarketplaceExtension {
	readonly name: string;
	readonly displayName: string;
	readonly publisher: string;
	readonly description: string;
	readonly installCount: number;
	readonly rating: number;
	readonly verified: boolean;
	readonly installing?: boolean;
	/** Whether the extension has a pre-release version, in addition to a release version. */
	readonly preRelease?: boolean;
	/** Why the extension can't be installed, such as a policy. */
	readonly installBlocker?: string;
}

const fixtureMarketplaceExtensions: readonly IFixtureMarketplaceExtension[] = [
	{ name: 'vscode-pylance', displayName: 'Pylance', publisher: 'Microsoft', description: 'A performant, feature-rich language server for Python in VS Code', installCount: 140_000_000, rating: 3.6, verified: true, preRelease: true },
	{ name: 'black-formatter', displayName: 'Black Formatter', publisher: 'Microsoft', description: 'Formatting support for Python files using the Black formatter.', installCount: 9_200_000, rating: 4.4, verified: true, installing: true },
	{ name: 'python-snippets', displayName: 'Python Snippets', publisher: 'cstrap', description: 'Python snippets collections', installCount: 4_800, rating: 3, verified: false },
	{ name: 'python-indent', displayName: 'Python Indent', publisher: 'Kevin Rose', description: 'Correct Python indentation.', installCount: 6_100_000, rating: 4.5, verified: false, installBlocker: 'This extension can\'t be installed because your organization doesn\'t allow it.' },
];

function toMarketplaceExtension(extension: IFixtureMarketplaceExtension): IExtension {
	return new class extends mock<IExtension>() {
		override readonly identifier = { id: `fixture.${extension.name}` };
		override readonly name = extension.name;
		override readonly displayName = extension.displayName;
		override readonly publisherDisplayName = extension.publisher;
		override readonly publisherDomain = { link: 'https://example.com', verified: extension.verified };
		override readonly description = extension.description;
		override readonly isBuiltin = false;
		override readonly state = extension.installing ? ExtensionState.Installing : ExtensionState.Uninstalled;
		override readonly hasReleaseVersion = true;
		override readonly hasPreReleaseVersion = extension.preRelease ?? false;
		override readonly installCount = extension.installCount;
		override readonly rating = extension.rating;
		override readonly ratingCount = 100;
		override readonly url = 'https://example.com';
		override readonly iconUrl = undefined;
	}();
}

function renderWidget(ctx: ComponentFixtureContext, options: { readonly extensions: readonly IFixtureExtension[]; readonly searchQuery?: string; readonly width?: number; readonly showSuggestions?: boolean; readonly marketplaceExtensions?: readonly IFixtureMarketplaceExtension[] }): void {
	ctx.container.style.width = `${options.width ?? 800}px`;
	ctx.container.style.height = '560px';
	const host = DOM.append(ctx.container, DOM.$('.ai-customization-management-editor'));
	host.style.height = '100%';

	const supported = new Set(options.extensions.filter(extension => extension.supported).map(extension => extension.name));
	const local = options.extensions.map(toExtension);
	// The Marketplace also finds installed extensions, which the section lists with the other installed extensions.
	const marketplace = [...local.filter(extension => options.searchQuery && extension.displayName.toLowerCase().includes(options.searchQuery)), ...(options.marketplaceExtensions ?? []).map(toMarketplaceExtension)];
	const installBlockers = new Map((options.marketplaceExtensions ?? []).filter(extension => extension.installBlocker).map(extension => [`fixture.${extension.name}`, new MarkdownString(extension.installBlocker)]));
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
				override readonly local = local;
				override readonly onChange = Event.None;
				override async queryGallery() { return singlePagePager(marketplace); }
				override async canInstall(extension: IExtension) { return installBlockers.get(extension.identifier.id) ?? true as const; }
				override canSetLanguage() { return false; }
			}());
			reg.defineInstance(IExtensionGalleryService, new class extends mock<IExtensionGalleryService>() {
				override isEnabled() { return true; }
			}());
			reg.defineInstance(IWorkbenchExtensionManagementService, new class extends mock<IWorkbenchExtensionManagementService>() {
				// Like Insiders and builds from source.
				override readonly preferPreReleases = true;
			}());
			reg.defineInstance(IAllowedExtensionsService, new class extends mock<IAllowedExtensionsService>() {
				override readonly onDidChangeAllowedExtensionsConfigValue = Event.None;
				override isAllowed() { return true as const; }
			}());
			reg.defineInstance(IExtensionGalleryManifestService, new class extends mock<IExtensionGalleryManifestService>() {
				override readonly extensionGalleryManifestStatus = ExtensionGalleryManifestStatus.Available;
				override readonly onDidChangeExtensionGalleryManifestStatus = Event.None;
			}());
			reg.defineInstance(IPreferencesService, new class extends mock<IPreferencesService>() { }());
			reg.defineInstance(IWorkbenchExtensionEnablementService, new class extends mock<IWorkbenchExtensionEnablementService>() {
				override isEnabledEnablementState(state: EnablementState) {
					return state === EnablementState.EnabledGlobally || state === EnablementState.EnabledWorkspace || state === EnablementState.EnabledByEnvironment;
				}
				override canChangeWorkspaceEnablement() { return true; }
			}());
			reg.defineInstance(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() {
				override canExecuteOnSessionsWindow(manifest: IExtensionManifest) { return supported.has(manifest.name); }
			}());
			reg.defineInstance(IHostService, new class extends mock<IHostService>() { }());
			reg.defineInstance(IUserDataProfilesService, new class extends mock<IUserDataProfilesService>() {
				override readonly profiles = [];
			}());
			reg.defineInstance(IExtensionService, new class extends mock<IExtensionService>() {
				override readonly onDidChangeExtensions = Event.None;
			}());
			reg.defineInstance(IAgentsWindowExtensionSuggestionsService, new class extends mock<IAgentsWindowExtensionSuggestionsService>() {
				override readonly suggestedExtensions = constObservable(options.showSuggestions ? local.filter((_, index) => options.extensions[index].suggested) : []);
				override dismissBadge() { }
			}());
		},
	});

	const widget = ctx.disposableStore.add(instantiationService.createInstance(AgentsWindowExtensionsWidget, host));
	widget.setVisible(true);
	if (options.searchQuery) {
		widget.setSearchQuery(options.searchQuery);
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	AgentsWindowExtensions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'The GitLens and Python rows show a small warning icon right after the publisher name. No other row shows a warning icon, and the warning icon is not dimmed on the disabled GitLens row.',
			'The Python row shows a small secondary Restart Extensions button just before its switch, matching the Restart Extensions button next to the Extensions title. No other row shows a Restart Extensions button.',
			'Every row ends with a borderless "..." More Actions icon button after its switch, vertically centered and the same height as the Restart Extensions button. It is not dimmed on disabled rows.',
			'Every row except Prettier shows a compact install count and star rating after the publisher name, before any warning icon, like the Marketplace rows do. Prettier shows neither and has no extra gap after its publisher name.',
		],
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions }),
	}),
	AgentsWindowExtensionsSuggested: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['In the AI Features group, GitLens shows the tags Tools, MCP Servers, and Skills, and Python shows a single Tools tag, each after the publisher and warning icon. Rows in the Supported and Other Extensions groups show no tags.'],
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions, showSuggestions: true }),
	}),
	AgentsWindowExtensionsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Every row except Prettier and Python shows a compact install count and star rating after the publisher name. The Python row, which also has a Restart Extensions button, hides them so that the start of its name stays visible, and nothing in it overlaps the Restart Extensions button.'],
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions, width: 480 }),
	}),
	AgentsWindowExtensionsSearch: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions, searchQuery: 'microsoft' }),
	}),
	AgentsWindowExtensionsMarketplace: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'Searching for "python" lists the installed Python extension in Other Extensions, followed by a Marketplace group with Pylance, Black Formatter, Python Snippets, and Python Indent in that order.',
			'Each Marketplace row shows the extension icon, name, publisher, compact install count and star rating, and description. Pylance and Black Formatter show a verified publisher badge before the publisher name; the others do not.',
			'Pylance shows a prominent Install Pre-Release button with a dropdown arrow on the right. Python Snippets shows a prominent Install button without one. Both are the same height as the Restart Extensions button on the Python row. Black Formatter shows an Installing label instead.',
			'Python Indent shows a small warning icon after its rating, and its Install button is disabled.',
		],
		render: async ctx => {
			renderWidget(ctx, { extensions: fixtureExtensions, searchQuery: 'python', marketplaceExtensions: fixtureMarketplaceExtensions });
			// The section searches the Marketplace after a short delay.
			await timeout(1000);
		},
	}),
	AgentsWindowExtensionsEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderWidget(ctx, { extensions: [] }),
	}),
});
