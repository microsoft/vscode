/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { IStateService } from '../../../state/node/state.js';
import { ThemeTypeSelector } from '../../common/theme.js';
import { IPartsSplash } from '../../common/themeService.js';
import { ThemeMainService } from '../../electron-main/themeMainServiceImpl.js';

class TestStateService implements IStateService {

	declare readonly _serviceBrand: undefined;

	private readonly items = new Map<string, object | string | number | boolean | null>();

	getItem<T>(key: string, defaultValue?: T): T | undefined {
		return (this.items.get(key) as T | undefined) ?? defaultValue;
	}

	setItem(key: string, data?: object | string | number | boolean | null): void {
		if (data === undefined) {
			this.items.delete(key);
		} else {
			this.items.set(key, data);
		}
	}

	setItems(items: readonly { key: string; data?: object | string | number | boolean | null }[]): void {
		for (const item of items) {
			this.setItem(item.key, item.data);
		}
	}

	removeItem(key: string): void {
		this.items.delete(key);
	}

	async close(): Promise<void> { }
}

class TestNativeTheme extends EventEmitter {

	themeSource: Electron.NativeTheme['themeSource'] = 'dark';
	readonly shouldUseDarkColors = true;
	readonly shouldUseHighContrastColors = false;
	readonly shouldUseInvertedColorScheme = false;
	readonly shouldUseDarkColorsForSystemIntegratedUI = true;
}

function createSplash(modernUI: boolean): IPartsSplash {
	const background = modernUI ? '#111111' : '#222222';
	return {
		zoomLevel: 0,
		baseTheme: ThemeTypeSelector.VS_DARK,
		colorInfo: {
			background,
			foreground: undefined,
			editorBackground: background,
			titleBarBackground: undefined,
			titleBarBorder: undefined,
			activityBarBackground: undefined,
			activityBarBorder: undefined,
			sideBarBackground: undefined,
			sideBarBorder: undefined,
			panelBackground: undefined,
			editorGroupBorder: undefined,
			agentsPanelBackground: undefined,
			agentsPanelBorder: undefined,
			statusBarBackground: undefined,
			statusBarBorder: undefined,
			statusBarNoFolderBackground: undefined,
			windowBorder: undefined,
		},
		layoutInfo: {
			sideBarSide: 'left',
			editorPartMinWidth: 220,
			titleBarHeight: 35,
			activityBarWidth: 0,
			sideBarWidth: 0,
			auxiliaryBarWidth: 0,
			statusBarHeight: 22,
			windowBorder: false,
			windowBorderRadius: undefined,
			modernUI,
			partBounds: undefined,
		}
	};
}

suite('ThemeMainService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps workbench and sessions window splashes separate', () => {
		const service = store.add(new ThemeMainService(new TestNativeTheme(), new TestStateService(), new TestConfigurationService(), new NullLogService()));
		const workbenchSplash = createSplash(true);
		const sessionsSplash = createSplash(false);

		service.saveWindowSplash(undefined, undefined, workbenchSplash, false);
		service.saveWindowSplash(undefined, undefined, sessionsSplash, true);

		assert.deepStrictEqual({
			workbench: service.getWindowSplash(undefined, false),
			sessions: service.getWindowSplash(undefined, true),
		}, {
			workbench: workbenchSplash,
			sessions: sessionsSplash,
		});
	});

	test('keeps workbench and sessions background colors separate', () => {
		const service = store.add(new ThemeMainService(new TestNativeTheme(), new TestStateService(), new TestConfigurationService(), new NullLogService()));
		const workbenchSplash = createSplash(true);
		const sessionsSplash = createSplash(false);

		service.saveWindowSplash(undefined, undefined, workbenchSplash, false);
		service.saveWindowSplash(undefined, undefined, sessionsSplash, true);

		assert.deepStrictEqual({
			workbench: service.getBackgroundColor(false),
			sessions: service.getBackgroundColor(true),
		}, {
			workbench: workbenchSplash.colorInfo.background,
			sessions: sessionsSplash.colorInfo.background,
		});
	});

	test('falls back to the base theme default background when a window type has no stored splash', () => {
		const service = store.add(new ThemeMainService(new TestNativeTheme(), new TestStateService(), new TestConfigurationService(), new NullLogService()));
		const workbenchSplash = createSplash(true);

		service.saveWindowSplash(undefined, undefined, workbenchSplash, false);

		assert.deepStrictEqual({
			workbench: service.getBackgroundColor(false),
			sessions: service.getBackgroundColor(true),
		}, {
			workbench: workbenchSplash.colorInfo.background,
			sessions: '#1F1F1F', // DEFAULT_BG_DARK, since the splash is stored with a `vs-dark` base theme
		});
	});
});
