/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { ExtensionRuntimeActionType, ExtensionRuntimeState, ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
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
}

const fixtureExtensions: readonly IFixtureExtension[] = [
	{ name: 'one-dark', displayName: 'One Dark Pro', publisher: 'binaryify', description: 'Atom\'s iconic One Dark theme for Visual Studio Code', supported: true, enablementState: EnablementState.EnabledGlobally },
	{ name: 'material-icons', displayName: 'Material Icon Theme', publisher: 'Philipp Kief', description: 'Material Design Icons for Visual Studio Code', supported: true, enablementState: EnablementState.DisabledWorkspace },
	{ name: 'python', displayName: 'Python', publisher: 'Microsoft', description: 'Python language support with extension access points for IntelliSense, debugging, and more.', supported: false, enablementState: EnablementState.EnabledWorkspace, runtimeState: { action: ExtensionRuntimeActionType.RestartExtensions, reason: 'Please restart extensions to enable this extension.' }, suggested: true },
	{ name: 'eslint', displayName: 'ESLint', publisher: 'Microsoft', description: 'Integrates ESLint JavaScript into VS Code.', supported: false, enablementState: EnablementState.DisabledWorkspace },
	{ name: 'gitlens', displayName: 'GitLens — Git supercharged', publisher: 'GitKraken', description: 'Supercharge Git within VS Code — Visualize code authorship at a glance via Git blame annotations and CodeLens.', supported: false, enablementState: EnablementState.DisabledWorkspace, suggested: true },
	{ name: 'prettier', displayName: 'Prettier - Code formatter', publisher: 'Prettier', description: 'Code formatter using prettier', supported: false, enablementState: EnablementState.DisabledGlobally },
];

function toExtension(extension: IFixtureExtension): IExtension {
	const manifest = { name: extension.name, publisher: 'fixture', version: '1.0.0', engines: { vscode: '*' } } satisfies IExtensionManifest;
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
		override readonly iconUrl = undefined;
		override readonly local = new class extends mock<ILocalExtension>() {
			override readonly manifest = manifest;
		}();
	}();
}

function renderWidget(ctx: ComponentFixtureContext, options: { readonly extensions: readonly IFixtureExtension[]; readonly searchQuery?: string; readonly width?: number; readonly showSuggestions?: boolean }): void {
	ctx.container.style.width = `${options.width ?? 800}px`;
	ctx.container.style.height = '560px';
	const host = DOM.append(ctx.container, DOM.$('.ai-customization-management-editor'));
	host.style.height = '100%';

	const supported = new Set(options.extensions.filter(extension => extension.supported).map(extension => extension.name));
	const local = options.extensions.map(toExtension);
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
				override readonly local = local;
				override readonly onChange = Event.None;
			}());
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
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions }),
	}),
	AgentsWindowExtensionsSuggested: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions, showSuggestions: true }),
	}),
	AgentsWindowExtensionsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions, width: 480 }),
	}),
	AgentsWindowExtensionsSearch: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderWidget(ctx, { extensions: fixtureExtensions, searchQuery: 'microsoft' }),
	}),
	AgentsWindowExtensionsEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderWidget(ctx, { extensions: [] }),
	}),
});
