/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { IWorkbenchExtensionEnablementService } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentsWindowExtensionGroup, AgentsWindowExtensionsWidget, groupAgentsWindowExtensions, IAgentsWindowExtensionsGroup } from '../../browser/agentsWindowExtensionsWidget.js';
import { IAgentsWindowExtensionSuggestionsService } from '../../browser/agentsWindowExtensionSuggestions.js';

interface ITestExtensionOptions {
	readonly displayName: string;
	readonly publisher?: string;
	readonly description?: string;
	readonly isBuiltin?: boolean;
	readonly state?: ExtensionState;
	readonly installed?: boolean;
}

function anExtension(id: string, options: ITestExtensionOptions): IExtension {
	return new class extends mock<IExtension>() {
		override readonly identifier = { id };
		override readonly displayName = options.displayName;
		override readonly publisherDisplayName = options.publisher ?? 'Publisher';
		override readonly description = options.description ?? '';
		override readonly isBuiltin = options.isBuiltin ?? false;
		override readonly state = options.state ?? ExtensionState.Installed;
		override readonly local = options.installed === false ? undefined : new class extends mock<ILocalExtension>() { }();
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
});
