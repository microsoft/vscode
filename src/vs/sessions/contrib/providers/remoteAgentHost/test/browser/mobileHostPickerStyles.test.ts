/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../../browser/media/style.css';
import '../../../../../browser/parts/mobile/mobileChatShell.css';
import '../../../../../browser/mobile/media/mobileWorkbench.css';
import '../../../../../browser/mobile/media/mobileChat.css';
import '../../../../../../workbench/contrib/sessions/browser/chat/media/chatWidget.css';
import '../../browser/media/mobileHostPickerSheet.css';
import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { mobileNewSessionPresentation } from '../../../../mobile/browser/mobileNewSessionPresentation.js';
import { MobileHostPlaceChipViewItem } from '../../browser/mobileHostPlaceChipViewItem.js';

suite('MobileHostPicker Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const width of [320, 390]) {
		test(`${width}px: a long computer name truncates without clipping its controls`, () => {
			const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.phone-layout.mobile-workbench.vs-dark'));
			store.add(toDisposable(() => root.remove()));
			root.style.cssText = `position: relative; width: ${width}px; height: 500px;`;
			for (const size of [20, 40, 60, 80, 120, 160, 200, 240, 400]) {
				root.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
			}
			root.style.setProperty('--vscode-codiconFontSize', '16px');
			root.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			const instantiationService = workbenchInstantiationService(undefined, store.add(new DisposableStore()));
			const container = append(root, $('.new-chat-widget-container.revealed'));
			const content = append(container, $('.new-chat-widget-content'));
			const presentation = store.add(mobileNewSessionPresentation.create(false, instantiationService));
			presentation.render(container, content);
			const workspace = append(content, $('.new-session-workspace-picker-container'));
			const workspaceSlot = append(workspace, $('.session-workspace-picker-slot'));
			const row = append(workspaceSlot, $('.sessions-new-session-place-row'));
			const toolbar = append(row, $('.monaco-toolbar'));
			const actionBar = append(toolbar, $('.monaco-action-bar'));
			const actions = append(actionBar, $('ul.actions-container'));
			const item = append(actions, $('li.action-item'));
			const host: IAgentHostFilterEntry = {
				id: 'computer',
				providerIds: ['computer'],
				label: 'A computer with a long descriptive name that must fit on a narrow phone screen',
				grouped: false,
				address: 'localhost:1234',
				icon: Codicon.vm,
				status: AgentHostFilterConnectionStatus.Connected,
				connectable: true,
			};
			instantiationService.stub(IAgentHostFilterService, upcastPartial<IAgentHostFilterService>({
				selectedHost: host,
				onDidChange: Event.None,
				onDidChangeDiscovering: Event.None,
			}));
			const viewItem = store.add(instantiationService.createInstance(MobileHostPlaceChipViewItem, store.add(new Action('chooseHost', 'Choose Host'))));
			viewItem.render(item);
			const trigger = item.querySelector<HTMLElement>('.sessions-new-session-place-trigger')!;
			const label = item.querySelector<HTMLElement>('.sessions-chat-dropdown-label')!;
			const icon = item.querySelector<HTMLElement>('.sessions-new-session-place-icon')!.getBoundingClientRect();
			const chevron = item.querySelector<HTMLElement>('.sessions-chat-dropdown-chevron')!.getBoundingClientRect();
			const bounds = trigger.getBoundingClientRect();
			const rowBounds = row.getBoundingClientRect();
			const x = bounds.left + bounds.width / 2;
			const y = bounds.top + bounds.height / 2;
			assert.deepStrictEqual({
				insideRow: bounds.left >= rowBounds.left && bounds.right <= rowBounds.right,
				insideViewport: bounds.left >= root.getBoundingClientRect().left && bounds.right <= root.getBoundingClientRect().right,
				truncated: label.scrollWidth > label.clientWidth,
				ellipsis: mainWindow.getComputedStyle(label).textOverflow,
				iconVisible: icon.width > 0 && icon.left >= bounds.left,
				chevronVisible: chevron.width > 0 && chevron.right <= bounds.right,
				fullAccessibleName: trigger.getAttribute('aria-label')?.includes(host.label),
				fullHoverLabel: item.getAttribute('aria-label'),
				touchHits: [-21, 21].map(offset => item.contains(mainWindow.document.elementFromPoint(x, y + offset))),
			}, {
				insideRow: true, insideViewport: true, truncated: true, ellipsis: 'ellipsis',
				iconVisible: true, chevronVisible: true, fullAccessibleName: true,
				fullHoverLabel: host.label, touchHits: [true, true],
			});
		});
	}

	test('selected rows preserve their selected palette while hovered', () => {
		const results = ['vs', 'vs-dark', 'hc-black', 'hc-light'].map(theme => {
			const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${theme}`));
			root.style.setProperty('--vscode-list-hoverBackground', '#f0f0f0');
			root.style.setProperty('--vscode-list-activeSelectionBackground', '#0060c0');
			root.style.setProperty('--vscode-list-activeSelectionForeground', '#ffffff');
			root.style.setProperty('--vscode-contrastActiveBorder', theme.startsWith('hc-') ? '#f38518' : 'transparent');
			root.style.setProperty('--vscode-strokeThickness', '1px');
			store.add(toDisposable(() => root.remove()));
			const row = append(root, $('button.host-picker-row.agent-sessions-interactive.agent-sessions-interactive-list.checked.hovered', { 'aria-checked': 'true' }));
			const style = mainWindow.getComputedStyle(row);
			return {
				background: style.backgroundColor,
				foreground: style.color,
			};
		});

		assert.deepStrictEqual(results, [
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
		]);
	});
});
