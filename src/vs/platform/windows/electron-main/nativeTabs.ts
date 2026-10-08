/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { isMacintosh } from '../../../base/common/platform.js';

export interface INativeTabState {
	readonly group: number;
	readonly index: number;
	readonly selected: boolean;
}

// Keep the integration compatible with Electron versions without the new API.
interface INativeTabAPI {
	getTabbedWindows?(): electron.BaseWindow[];
	getSelectedTab?(): electron.BaseWindow | null;
	selectTab?(): void;
	tabbingMode?: 'automatic' | 'preferred' | 'disallowed';
}

export function supportsNativeTabSession(): boolean {
	const prototype = electron.BrowserWindow?.prototype as (electron.BrowserWindow & INativeTabAPI) | undefined;
	return isMacintosh && typeof prototype?.getTabbedWindows === 'function' && typeof prototype?.getSelectedTab === 'function' && typeof prototype?.selectTab === 'function';
}

export function getNativeTabState(window: electron.BrowserWindow): INativeTabState | undefined {
	const nativeWindow = window as electron.BrowserWindow & INativeTabAPI;
	const tabs = nativeWindow.getTabbedWindows?.();
	if (!tabs?.length) {
		return undefined;
	}

	return { group: tabs[0].id, index: tabs.findIndex(tab => tab.id === window.id), selected: nativeWindow.getSelectedTab?.()?.id === window.id };
}

export function disableAutomaticNativeTabbing(options: electron.BrowserWindowConstructorOptions): void {
	if (supportsNativeTabSession()) {
		const nativeOptions: electron.BrowserWindowConstructorOptions & Pick<INativeTabAPI, 'tabbingMode'> = options;
		nativeOptions.tabbingMode = 'disallowed';
	}
}

export function selectNativeTab(window: electron.BrowserWindow): void {
	if (!window.isDestroyed()) {
		const nativeWindow = window as electron.BrowserWindow & INativeTabAPI;
		nativeWindow.selectTab?.();
	}
}

export function restoreNativeTabGroups(windows: readonly { window: electron.BrowserWindow; state?: INativeTabState }[]): electron.BrowserWindow[] {
	const groups = new Map<number, { window: electron.BrowserWindow; state: INativeTabState }[]>();
	for (const { window, state } of windows) {
		if (window.isDestroyed()) {
			continue;
		}
		const nativeWindow = window as electron.BrowserWindow & INativeTabAPI;
		nativeWindow.tabbingMode = 'automatic';
		if (state) {
			let group = groups.get(state.group);
			if (!group) {
				groups.set(state.group, group = []);
			}
			group.push({ window, state });
		}
	}

	const selectedWindows: electron.BrowserWindow[] = [];
	for (const group of groups.values()) {
		group.sort((a, b) => a.state.index - b.state.index);
		const anchor = group[0].window;
		for (let index = 1; index < group.length; index++) {
			group[index - 1].window.addTabbedWindow(group[index].window);
		}
		const selected = group.find(tab => tab.state.selected)?.window ?? anchor;
		selectNativeTab(selected);
		selectedWindows.push(selected);
	}
	return selectedWindows;
}
