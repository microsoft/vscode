/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../../platform/hover/browser/hover.css';
import '../../browser/media/accountTitleBarWidget.css';
import assert from 'assert';
import { $, append, EventType } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { trackSignInRowEnablement } from '../../browser/account.contribution.js';

/** Focus styles only match while the document has focus, so give the test's web contents real focus. */
async function setWebContentsFocus(focused: boolean): Promise<void> {
	const changed = mainWindow.document.hasFocus() === focused
		? undefined
		: new Promise<void>(resolve => mainWindow.addEventListener(focused ? EventType.FOCUS : EventType.BLUR, () => resolve(), { once: true }));
	await ipcRenderer.invoke('vscode:test-set-web-contents-focus', focused);
	await changed;
}

suite('Account Title Bar Widget Styles - signed-out sign-in rows', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => setWebContentsFocus(true));

	// Hover colors cannot be forced from a test; the focused state shares their rule and the link rules they override.
	test('sign-in action is a full-width menu row without link styling', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		root.style.cssText = [
			'position: fixed',
			'top: 0',
			'left: 0',
			'--vscode-strokeThickness: 1px',
			'--vscode-foreground: #101010',
			'--vscode-disabledForeground: #202020',
			'--vscode-textLink-foreground: #0000f0',
			'--vscode-textLink-activeForeground: #0000f1',
			'--vscode-list-hoverBackground: #303030',
			'--vscode-list-hoverForeground: #404040',
			'--vscode-focusBorder: #505050',
		].join(';');
		store.add(toDisposable(() => root.remove()));

		// Mirrors the signed-out provider DOM built by TitleBarAccountWidget.createCombinedPanelContent.
		const hover = append(root, $('.monaco-hover.workbench-hover'));
		const panel = append(hover, $('div.sessions-account-titlebar-panel'));
		panel.style.width = '400px';
		const identities = append(panel, $('.sessions-account-titlebar-panel-identities'));
		const renderSignedOutRow = (enabled: boolean) => {
			const section = append(identities, $('section.sessions-account-titlebar-panel-provider-account.signed-out'));
			const identity = append(section, $('.sessions-account-titlebar-panel-provider-identity'));
			const icon = append(identity, $('span.sessions-account-titlebar-panel-provider-icon.codicon.codicon-github'));
			const actionBar = store.add(new ActionBar(append(identity, $('.sessions-account-titlebar-panel-provider-sign-in-actions'))));
			const action = store.add(new Action('signIn', 'Sign in with GitHub', undefined, enabled));
			actionBar.push(action, { icon: false, label: true });
			store.add(trackSignInRowEnablement(identity, [action]));
			const label = identity.querySelector<HTMLElement>('.action-label')!;
			// Let focus reach a disabled row, so the test can show its icon ignores the row's focus.
			label.tabIndex = -1;
			return { section, icon, label, action };
		};
		const enabledRow = renderSignedOutRow(true);
		const disabledRow = renderSignedOutRow(false);
		const reenabledRow = renderSignedOutRow(false);
		reenabledRow.action.enabled = true;

		const measure = ({ section, icon, label }: ReturnType<typeof renderSignedOutRow>) => {
			const sectionRect = section.getBoundingClientRect();
			const labelRect = label.getBoundingClientRect();
			const iconRect = icon.getBoundingClientRect();
			const hit = mainWindow.document.elementFromPoint(iconRect.left + iconRect.width / 2, iconRect.top + iconRect.height / 2);
			label.focus();
			const style = mainWindow.getComputedStyle(label);
			const textRange = mainWindow.document.createRange();
			textRange.selectNodeContents(label);
			const textRect = textRange.getBoundingClientRect();
			return {
				spansRow: Math.round(labelRect.left) === Math.round(sectionRect.left) && Math.round(labelRect.right) === Math.round(sectionRect.right),
				textCenteredOnIcon: Math.abs((textRect.top + textRect.bottom) / 2 - (iconRect.top + iconRect.bottom) / 2) <= 1,
				iconAreaHitsAction: hit === label,
				iconPaintsAboveRow: mainWindow.getComputedStyle(icon).zIndex,
				focused: {
					background: style.backgroundColor,
					color: style.color,
					iconColor: mainWindow.getComputedStyle(icon).color,
					textDecorationLine: style.textDecorationLine,
					outline: `${style.outlineStyle} ${style.outlineColor}`,
				},
			};
		};

		const disabled = measure(disabledRow).focused;
		assert.deepStrictEqual({
			enabled: measure(enabledRow),
			disabled: { background: disabled.background, color: disabled.color, iconColor: disabled.iconColor },
			reenabledIconColor: measure(reenabledRow).focused.iconColor,
		}, {
			enabled: {
				spansRow: true,
				textCenteredOnIcon: true,
				iconAreaHitsAction: true,
				iconPaintsAboveRow: '1',
				focused: {
					background: 'rgb(48, 48, 48)',
					color: 'rgb(64, 64, 64)',
					iconColor: 'rgb(64, 64, 64)',
					textDecorationLine: 'none',
					outline: 'solid rgb(80, 80, 80)',
				},
			},
			disabled: { background: 'rgba(0, 0, 0, 0)', color: 'rgb(32, 32, 32)', iconColor: 'rgb(16, 16, 16)' },
			reenabledIconColor: 'rgb(64, 64, 64)',
		});
	});
});
