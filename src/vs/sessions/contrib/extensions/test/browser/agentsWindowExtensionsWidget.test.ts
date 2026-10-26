/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { retry, timeout } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionContributions, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService, SessionsWindowMissingFeature } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentsWindowExtensionGroup, AgentsWindowExtensionsWidget, getMissingFeaturesWarning, getSuggestedContributionLabels, groupAgentsWindowExtensions, IAgentsWindowExtensionsGroup } from '../../browser/agentsWindowExtensionsWidget.js';
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
		override readonly local = options.installed === false ? undefined : new class extends mock<ILocalExtension>() {
			override readonly manifest = manifest;
		}();
	}();
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

		const changed = (extensionId: string, enabled: boolean, aiFeatures: string) => ({ eventName: 'agentsWindowExtensionEnablementChanged', data: { extensionId, enabled, aiFeatures } });
		assert.deepStrictEqual({ requested, events }, {
			requested: ['Pub.Tools: enable', 'pub.theme: disable', 'pub.cancelled: enable'],
			events: [
				changed('pub.tools', true, 'chatSkills,languageModelTools'),
				changed('pub.theme', false, ''),
			],
		});
	});
});
