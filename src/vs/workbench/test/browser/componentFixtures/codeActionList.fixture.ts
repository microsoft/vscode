/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';
import { ActionList, ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';

import '../../../../platform/actionWidget/browser/actionWidget.css';
import '../../../../base/browser/ui/codicons/codiconStyles.js';
import '../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';

interface CodeActionFixtureOptions extends ComponentFixtureContext {
	items: IActionListItem<string>[];
	width?: string;
}

function renderCodeActionList(options: CodeActionFixtureOptions): void {
	const { container, disposableStore, theme } = options;
	container.style.width = options.width ?? '300px';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				declare readonly _serviceBrand: undefined;
				override get mainContainer() { return container; }
				override get activeContainer() { return container; }
				override get mainContainerDimension() { return { width: 300, height: 600 }; }
				override get activeContainerDimension() { return { width: 300, height: 600 }; }
				override readonly mainContainerOffset = { top: 0, quickPickTop: 0 };
				override readonly onDidLayoutMainContainer = Event.None;
				override readonly onDidLayoutActiveContainer = Event.None;
				override readonly onDidLayoutContainer = Event.None;
				override readonly onDidChangeActiveContainer = Event.None;
				override readonly onDidAddContainer = Event.None;
				override get containers() { return [container]; }
				override getContainer() { return container; }
				override whenContainerStylesLoaded() { return undefined; }
			});
		},
	});

	const delegate: IActionListDelegate<string> = {
		onHide: () => { },
		onSelect: () => { },
	};

	const anchor = container;

	const list = disposableStore.add(instantiationService.createInstance(
		ActionList,
		'codeActionWidget',
		false,
		options.items,
		delegate,
		undefined,
		undefined,
		anchor,
	));

	// Render the list directly into the container instead of using context view
	const wrapper = document.createElement('div');
	wrapper.classList.add('action-widget');
	wrapper.appendChild(list.domNode);
	container.appendChild(wrapper);

	list.layout(0);
	list.focus();
}

const quickFixItems: IActionListItem<string>[] = [
	{ kind: ActionListItemKind.Header, group: { title: 'Quick Fix' } },
	{ kind: ActionListItemKind.Action, item: 'fix-import', label: 'Add missing import for \'useState\'', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
	{ kind: ActionListItemKind.Action, item: 'fix-typo', label: 'Change spelling to \'initialCount\'', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
	{ kind: ActionListItemKind.Action, item: 'fix-type', label: 'Add explicit type annotation', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
	{ kind: ActionListItemKind.Header, group: { title: 'Extract', icon: Codicon.wrench } },
	{ kind: ActionListItemKind.Action, item: 'extract-const', label: 'Extract to constant in enclosing scope', group: { title: 'Extract', icon: Codicon.wrench } },
	{ kind: ActionListItemKind.Action, item: 'extract-fn', label: 'Extract to function in module scope', group: { title: 'Extract', icon: Codicon.wrench } },
	{ kind: ActionListItemKind.Header, group: { title: 'Source Action', icon: Codicon.symbolFile } },
	{ kind: ActionListItemKind.Action, item: 'organize-imports', label: 'Organize Imports', group: { title: 'Source Action', icon: Codicon.symbolFile } },
];

const simpleFixes: IActionListItem<string>[] = [
	{ kind: ActionListItemKind.Action, item: 'fix-1', label: 'Convert to arrow function', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
	{ kind: ActionListItemKind.Action, item: 'fix-2', label: 'Remove unused variable', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
	{ kind: ActionListItemKind.Action, item: 'fix-3', label: 'Add \'await\' to async call', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
];

export default defineThemedFixtureGroup({
	GroupedCodeActions: defineComponentFixture({
		render: (context) => renderCodeActionList({ ...context, items: quickFixItems }),
	}),
	SimpleQuickFixes: defineComponentFixture({
		render: (context) => renderCodeActionList({ ...context, items: simpleFixes }),
	}),
});
