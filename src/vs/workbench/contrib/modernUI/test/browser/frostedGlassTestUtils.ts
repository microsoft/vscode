/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { Menu } from '../../../../../base/browser/ui/menu/menu.js';
import { Action } from '../../../../../base/common/actions.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { defaultMenuStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ACTION_WIDGET_ANIMATED_CLASS } from '../../../../../platform/actionWidget/browser/actionWidgetMotion.js';
import '../../../../../base/browser/ui/contextview/contextview.css';
import '../../../../../base/browser/ui/dialog/dialog.css';
import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/actionWidget/browser/actionWidget.css';
import '../../../../../platform/hover/browser/hover.css';
import '../../../../../platform/quickinput/browser/media/quickInput.css';
import '../../../../browser/parts/notifications/media/notificationsCenter.css';
import '../../../../browser/parts/notifications/media/notificationsToasts.css';
import '../../../../browser/parts/notifications/media/notificationsList.css';
import '../../browser/media/roundedCorners.css';
import '../../browser/media/frostedGlass.css';

export function append(parent: HTMLElement | ShadowRoot, className: string): HTMLElement {
	const element = document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

export function createFrostedGlassOverlays(store: Pick<DisposableStore, 'add'>, background = '#242424', rootClassName = 'monaco-workbench modern-ui') {
	const root = append(document.body, rootClassName);
	store.add(toDisposable(() => root.remove()));
	for (const token of ['quickInput-background', 'menu-background', 'editorHoverWidget-background', 'editorWidget-background', 'notifications-background', 'editor-background', 'input-background']) {
		root.style.setProperty(`--vscode-${token}`, background);
	}
	root.style.setProperty('--vscode-cornerRadius-large', '8px');
	root.style.setProperty('--vscode-cornerRadius-xLarge', '12px');
	root.style.setProperty('--vscode-list-hoverBackground', '#456789');
	const quickInput = append(root, 'quick-input-widget');
	quickInput.style.backgroundColor = 'var(--vscode-quickInput-background)';
	quickInput.style.top = '100px';
	const menuContainer = append(root, 'context-view');
	menuContainer.style.left = '120px';
	menuContainer.style.top = '160px';
	const menu = store.add(new Menu(menuContainer, [store.add(new Action('test.action', 'Test action'))], {}, defaultMenuStyles));
	const menuBackground = menuContainer.querySelector<HTMLElement>('.monaco-scrollable-element')!;
	const shadowRoot = append(root, 'shadow-root-host').attachShadow({ mode: 'open' });
	const shadowMenuContainer = append(shadowRoot, 'context-view');
	shadowMenuContainer.style.cssText = 'position: fixed; left: 120px; top: 160px;';
	store.add(new Menu(shadowMenuContainer, [store.add(new Action('test.shadowAction', 'Shadow menu action'))], {}, defaultMenuStyles));
	const shadowMenuBackground = shadowMenuContainer.querySelector<HTMLElement>('.monaco-scrollable-element')!;
	const picker = append(root, `action-widget ${ACTION_WIDGET_ANIMATED_CLASS}`);
	const pickerFilter = append(picker, 'action-list-filter');
	const pickerList = append(append(append(picker, 'actionList'), 'monaco-list'), 'monaco-scrollable-element');
	const pickerRows = append(pickerList, 'monaco-list-rows');
	pickerRows.style.backgroundColor = 'var(--vscode-menu-background)';
	const pickerFooter = append(picker, 'action-widget-action-bar');
	const hover = append(root, 'monaco-hover workbench-hover');
	const dialog = append(root, 'monaco-dialog-box');
	dialog.style.backgroundColor = 'var(--vscode-editorWidget-background)';
	const center = append(root, 'notifications-center visible');
	const centerBackground = append(center, 'notifications-list-container');
	const toasts = append(root, 'notifications-toasts visible');
	const toast = append(append(toasts, 'notification-toast-container'), 'notification-toast notification-fade-in-done');
	toast.style.background = 'var(--vscode-notifications-background)';
	const toastList = append(toast, 'notifications-list-container');
	return {
		root, quickInput, menu, menuContainer, shadowMenuContainer, picker, pickerFilter, pickerRows, pickerFooter, hover, dialog, toast, toastList,
		surfaces: [quickInput, menuContainer, shadowMenuContainer, picker, hover, dialog, center, toast],
		backgrounds: [quickInput, menuBackground, shadowMenuBackground, picker, pickerRows, hover, dialog, centerBackground, toast, toastList],
	};
}

export function readColor(element: HTMLElement, pseudo?: string): Color {
	const context = document.createElement('canvas').getContext('2d')!;
	context.fillStyle = getWindow(element).getComputedStyle(element, pseudo).backgroundColor;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
	return new Color(new RGBA(r, g, b, alpha / 255));
}

export function supportsGlass(root: HTMLElement): boolean {
	const targetWindow = getWindow(root);
	return targetWindow.CSS.supports('backdrop-filter', 'blur(12px)')
		&& targetWindow.CSS.supports('background-color', 'color-mix(in srgb, black 92%, transparent)')
		&& targetWindow.matchMedia('(prefers-reduced-transparency: no-preference) and (forced-colors: none)').matches;
}
