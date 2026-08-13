/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowState, WindowMode } from '../../window/electron-main/window.js';
import type { IDefaultBrowserWindowOptionsOverrides } from '../../windows/electron-main/windows.js';

export interface IParsedAuxiliaryWindowFeatures {
	readonly windowState: IWindowState;
	readonly overrides: IDefaultBrowserWindowOptionsOverrides;
	readonly showInactive: boolean;
	readonly showHidden: boolean;
	readonly alwaysOnTopLevel?: 'screen-saver';
	readonly focusable: boolean;
	readonly nonActivatingPanel: boolean;
	readonly parentless: boolean;
	readonly skipTaskbar: boolean;
	readonly visibleOnAllWorkspaces: boolean;
	readonly visibleOnFullScreen: boolean;
}

export function shouldApplyAuxiliaryWindowState(windowClaimed: boolean, hasOptions: boolean, stateApplied: boolean): boolean {
	return windowClaimed && hasOptions && !stateApplied;
}

export function parseAuxiliaryWindowFeatures(features: string): IParsedAuxiliaryWindowFeatures {
	const windowState: IWindowState = {};
	const overrides: IDefaultBrowserWindowOptionsOverrides = {};
	let showInactive = false;
	let showHidden = false;
	let alwaysOnTopLevel: 'screen-saver' | undefined;
	let focusable = true;
	let nonActivatingPanel = false;
	let parentless = false;
	let skipTaskbar = false;
	let visibleOnAllWorkspaces = false;
	let visibleOnFullScreen = false;

	for (const feature of features.split(',')) {
		const [key, value] = feature.split('=');
		switch (key) {
			case 'width':
				windowState.width = parseInt(value, 10);
				break;
			case 'height':
				windowState.height = parseInt(value, 10);
				break;
			case 'left':
				windowState.x = parseInt(value, 10);
				break;
			case 'top':
				windowState.y = parseInt(value, 10);
				break;
			case 'window-maximized':
				windowState.mode = WindowMode.Maximized;
				break;
			case 'window-fullscreen':
				windowState.mode = WindowMode.Fullscreen;
				break;
			case 'window-show-inactive':
				showInactive = true;
				break;
			case 'window-show-hidden':
				showHidden = true;
				break;
			case 'window-always-on-top-level':
				if (value === 'screen-saver') {
					alwaysOnTopLevel = value;
				}
				break;
			case 'window-not-focusable':
				focusable = false;
				break;
			case 'window-nonactivating-panel':
				nonActivatingPanel = true;
				break;
			case 'window-parentless':
				parentless = true;
				break;
			case 'window-skip-taskbar':
				skipTaskbar = true;
				break;
			case 'window-visible-on-all-workspaces':
				visibleOnAllWorkspaces = true;
				break;
			case 'window-visible-on-full-screen':
				visibleOnFullScreen = true;
				break;
			case 'window-disable-fullscreen':
				overrides.disableFullscreen = true;
				break;
			case 'window-native-titlebar':
				overrides.forceNativeTitlebar = true;
				break;
			case 'window-always-on-top':
				overrides.alwaysOnTop = true;
				break;
			case 'window-frameless':
				overrides.frameless = true;
				break;
			case 'window-transparent':
				overrides.transparent = true;
				break;
			case 'window-not-resizable':
				overrides.notResizable = true;
				break;
			case 'window-no-background-throttling':
				overrides.noBackgroundThrottling = true;
				break;
			case 'window-background-color':
				if (typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
					overrides.backgroundColor = value;
				}
				break;
		}
	}

	return {
		windowState,
		overrides,
		showInactive,
		showHidden,
		alwaysOnTopLevel,
		focusable,
		nonActivatingPanel,
		parentless,
		skipTaskbar,
		visibleOnAllWorkspaces,
		visibleOnFullScreen
	};
}
