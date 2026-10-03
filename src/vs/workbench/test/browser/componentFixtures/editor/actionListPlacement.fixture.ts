/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { AnchorPosition } from '../../../../../base/common/layout.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { createPullRequestResourceHover } from '../../../../contrib/github/browser/githubResourceHover.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

function collectionFixture(count: number, options?: { readonly previewIndex?: number; readonly right?: boolean; readonly top?: boolean }) {
	return defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The collection prefers above its trigger, with fallback near the top of the window.',
			options?.previewIndex === undefined
				? 'The initial row is highlighted without opening its rich preview.'
				: 'The rich preview stays beside its row, resizing to available horizontal space.',
		],
		render: ({ container, disposableStore, theme }) => {
			const targetWindow = dom.getWindow(container);
			container.style.width = `${targetWindow.innerWidth}px`;
			container.style.height = `${targetWindow.innerHeight}px`;
			const trigger = disposableStore.add(new Button(container, { ...defaultButtonStyles, secondary: true }));
			trigger.label = `${count} Pull Requests`;
			trigger.element.style.position = 'fixed';
			trigger.element.style.width = 'fit-content';
			trigger.element.style[options?.right ? 'right' : 'left'] = '48px';
			trigger.element.style[options?.top ? 'top' : 'bottom'] = '24px';
			trigger.element.dataset.testid = 'placement-trigger';
			const instantiationService = createEditorServices(disposableStore, {
				colorTheme: theme,
				additionalServices: registration => {
					registration.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
						override readonly mainContainer = container;
						override readonly activeContainer = container;
						override readonly onDidLayoutContainer = Event.None;
						override getContainer(): HTMLElement { return container; }
					}());
					registration.define(IContextViewService, ContextViewService);
				},
			});
			const service = disposableStore.add(instantiationService.createInstance(ActionWidgetService));
			const items: IActionListItem<{ id: string }>[] = Array.from({ length: count }, (_, index) => {
				let controls: readonly HTMLElement[] = [];
				return {
					kind: ActionListItemKind.Action,
					label: `Reference preview ${index + 1}`,
					item: { id: String(index) },
					group: { title: '', icon: Codicon.gitPullRequest },
					toolbarActions: [toAction({
						id: `copy-${index}`, label: 'Copy Pull Request URL', class: ThemeIcon.asClassName(Codicon.copy),
						run: () => { container.dataset.copied = String(index); },
					})],
					hover: {
						content: () => {
							const hover = createPullRequestResourceHover({
								owner: 'microsoft', repo: 'vscode', number: 335387,
								repositoryHref: 'https://github.com/microsoft/vscode',
								referenceHref: 'https://github.com/microsoft/vscode/pull/335387',
								density: 'compact', checksStatus: 'success',
								pullRequest: {
									title: `Reference preview ${index + 1}: preserve recorded GitHub titles in pills`,
									body: 'A responsive rich preview stays associated with its list item while keeping its links and branch controls reachable.',
									state: 'open', author: { login: 'example' },
									headRef: 'agents/reference-preview-validation', baseRef: 'main',
									isDraft: false, createdAt: '2026-09-21T12:00:00Z',
								},
								onDidClickRepository: () => { container.dataset.opened = 'repository'; },
								onDidClickReference: () => { container.dataset.opened = 'reference'; },
								onDidClickBaseBranch: () => { container.dataset.opened = 'base'; },
								onDidClickHeadBranch: () => { container.dataset.opened = 'head'; },
							});
							controls = hover.tabbableElements;
							return hover.element;
						},
						expandable: true, showIndicator: false, tabThroughPanel: true,
						getTabbableElements: () => controls, contentOwnsPadding: true,
					},
				};
			});
			const show = () => service.show('referencePreview', false, items, {
				onHide: () => trigger.focus(),
				onSelect: item => { container.dataset.selected = item.id; },
			}, trigger.element, container, undefined, undefined, {
				preferredAnchorPosition: AnchorPosition.ABOVE,
				showFilter: false, minWidth: 280, maxWidth: 320,
			});
			disposableStore.add(trigger.onDidClick(show));
			trigger.element.click();
			if (options?.previewIndex !== undefined) {
				const list = container.querySelector<HTMLElement>('.monaco-list')!;
				service.focusItemById(String(options.previewIndex));
				list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
			}
		},
	});
}

export default defineThemedFixtureGroup({ path: 'editor/actionListPlacement' }, {
	SingleItemInitiallyQuiet: collectionFixture(1),
	ShortCollectionInitiallyQuiet: collectionFixture(3),
	LongCollectionInitiallyQuiet: collectionFixture(30),
	RightPreview: collectionFixture(3, { previewIndex: 1 }),
	LeftPreview: collectionFixture(3, { previewIndex: 1, right: true }),
	LongCollectionLowerPreview: collectionFixture(30, { previewIndex: 14 }),
	TopTriggerFallback: collectionFixture(3, { top: true }),
});
