/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ActionListItemKind, ActionListWidget, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { HoverWidget } from '../../../../../platform/hover/browser/hoverWidget.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/actionWidget/browser/actionWidget.css';
import '../../../../../platform/hover/browser/hover.css';

function renderHoverFooterComparison({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '960px';
	container.style.padding = '24px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.define(IMarkdownRendererService, MarkdownRendererService);
		},
	});
	const columns = dom.append(container, dom.$('.action-list-hover-footer-comparison'));
	columns.style.display = 'flex';
	columns.style.alignItems = 'flex-start';
	columns.style.gap = '340px';

	const submenuColumn = dom.append(columns, dom.$('.action-list-hover-footer-column'));
	dom.append(submenuColumn, dom.$('h3', undefined, 'Dropdown hover'));
	const actionWidget = dom.append(submenuColumn, dom.$('.action-widget'));
	actionWidget.style.width = '260px';
	const submenuContent = dom.$('.action-list-hover-footer-content', undefined, 'Reference details');
	submenuContent.style.width = '240px';
	const item: IActionListItem<string> = {
		kind: ActionListItemKind.Action,
		item: 'reference',
		label: 'Reference',
		hover: {
			content: submenuContent,
			expandable: true,
			showIndicator: false,
			actions: [{
				commandId: 'copyRelativePath',
				label: 'Copy Relative Path',
				iconClass: ThemeIcon.asClassName(Codicon.copy),
				run: () => { },
			}],
		},
	};
	const delegate: IActionListDelegate<string> = {
		onHide: () => { },
		onSelect: () => { },
	};
	const actionList = disposableStore.add(instantiationService.createInstance(
		ActionListWidget<string>,
		'actionListHoverFooterFixture',
		false,
		[item],
		delegate,
		undefined,
		{ showFilter: false, reserveSubmenuSpace: false },
	));
	actionWidget.appendChild(actionList.domNode);
	actionList.layout(24, 260);
	actionList.focus();
	actionList.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

	const directColumn = dom.append(columns, dom.$('.action-list-hover-footer-column'));
	dom.append(directColumn, dom.$('h3', undefined, 'Single-pill hover'));
	const target = dom.append(directColumn, dom.$('.action-list-hover-footer-target'));
	const directContent = dom.$('.action-list-hover-footer-content', undefined, 'Reference details');
	directContent.style.width = '240px';
	const directHover = disposableStore.add(instantiationService.createInstance(HoverWidget, {
		content: directContent,
		target,
		appearance: { compact: true },
		position: { hoverPosition: HoverPosition.BELOW },
		actions: [{
			commandId: 'copyRelativePath',
			label: 'Copy Relative Path',
			iconClass: ThemeIcon.asClassName(Codicon.copy),
			run: () => { },
		}],
	}));
	directHover.domNode.style.position = 'static';
	directColumn.appendChild(directHover.domNode);
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	ActionListHoverFooter: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderHoverFooterComparison,
	}),
});
