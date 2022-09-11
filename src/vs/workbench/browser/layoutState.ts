/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getClientArea } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { PanelAlignment, Position, positionFromString, positionToString } from 'vs/workbench/services/layout/browser/layoutService';

interface IWorkbenchLayoutStateKey {
	readonly name: string;
	readonly runtime: boolean;
	readonly defaultValue: unknown;
	readonly scope: StorageScope;
	readonly target: StorageTarget;
	readonly zenModeIgnore?: boolean;
}

type StorageKeyType = string | boolean | number | object;

abstract class WorkbenchLayoutStateKey<T extends StorageKeyType> implements IWorkbenchLayoutStateKey {

	abstract readonly runtime: boolean;

	constructor(readonly name: string, readonly scope: StorageScope, readonly target: StorageTarget, public defaultValue: T) { }
}

class RuntimeStateKey<T extends StorageKeyType> extends WorkbenchLayoutStateKey<T> {

	readonly runtime = true;

	constructor(name: string, scope: StorageScope, target: StorageTarget, defaultValue: T, readonly zenModeIgnore?: boolean) {
		super(name, scope, target, defaultValue);
	}
}

class InitializationStateKey<T extends StorageKeyType> extends WorkbenchLayoutStateKey<T> {
	readonly runtime = false;
}

export const LayoutStateKeys = {

	// Editor
	EDITOR_CENTERED: new RuntimeStateKey<boolean>('editor.centered', StorageScope.WORKSPACE, StorageTarget.USER, false),

	// Zen Mode
	ZEN_MODE_ACTIVE: new RuntimeStateKey<boolean>('zenMode.active', StorageScope.WORKSPACE, StorageTarget.USER, false),
	ZEN_MODE_EXIT_INFO: new RuntimeStateKey('zenMode.exitInfo', StorageScope.WORKSPACE, StorageTarget.USER, {
		transitionedToCenteredEditorLayout: false,
		transitionedToFullScreen: false,
		handleNotificationsDoNotDisturbMode: false,
		wasVisible: {
			auxiliaryBar: false,
			panel: false,
			sideBar: false,
		},
	}),

	// Part Sizing
	GRID_SIZE: new InitializationStateKey('grid.size', StorageScope.PROFILE, StorageTarget.MACHINE, { width: 800, height: 600 }),
	SIDEBAR_SIZE: new InitializationStateKey<number>('sideBar.size', StorageScope.PROFILE, StorageTarget.MACHINE, 200),
	AUXILIARYBAR_SIZE: new InitializationStateKey<number>('auxiliaryBar.size', StorageScope.PROFILE, StorageTarget.MACHINE, 200),
	PANEL_SIZE: new InitializationStateKey<number>('panel.size', StorageScope.PROFILE, StorageTarget.MACHINE, 300),

	PANEL_LAST_NON_MAXIMIZED_HEIGHT: new RuntimeStateKey<number>('panel.lastNonMaximizedHeight', StorageScope.PROFILE, StorageTarget.MACHINE, 300),
	PANEL_LAST_NON_MAXIMIZED_WIDTH: new RuntimeStateKey<number>('panel.lastNonMaximizedWidth', StorageScope.PROFILE, StorageTarget.MACHINE, 300),
	PANEL_WAS_LAST_MAXIMIZED: new RuntimeStateKey<boolean>('panel.wasLastMaximized', StorageScope.WORKSPACE, StorageTarget.USER, false),

	// Part Positions
	SIDEBAR_POSITON: new RuntimeStateKey<Position>('sideBar.position', StorageScope.WORKSPACE, StorageTarget.USER, Position.LEFT),
	PANEL_POSITION: new RuntimeStateKey<Position>('panel.position', StorageScope.WORKSPACE, StorageTarget.USER, Position.BOTTOM),
	PANEL_ALIGNMENT: new RuntimeStateKey<PanelAlignment>('panel.alignment', StorageScope.PROFILE, StorageTarget.USER, 'center'),

	// Part Visibility
	ACTIVITYBAR_HIDDEN: new RuntimeStateKey<boolean>('activityBar.hidden', StorageScope.WORKSPACE, StorageTarget.USER, false, true),
	SIDEBAR_HIDDEN: new RuntimeStateKey<boolean>('sideBar.hidden', StorageScope.WORKSPACE, StorageTarget.USER, false),
	EDITOR_HIDDEN: new RuntimeStateKey<boolean>('editor.hidden', StorageScope.WORKSPACE, StorageTarget.USER, false),
	PANEL_HIDDEN: new RuntimeStateKey<boolean>('panel.hidden', StorageScope.WORKSPACE, StorageTarget.USER, true),
	AUXILIARYBAR_HIDDEN: new RuntimeStateKey<boolean>('auxiliaryBar.hidden', StorageScope.WORKSPACE, StorageTarget.USER, true),
	STATUSBAR_HIDDEN: new RuntimeStateKey<boolean>('statusBar.hidden', StorageScope.WORKSPACE, StorageTarget.USER, false, true)

} as const;

interface ILayoutStateChangeEvent<T extends StorageKeyType> {
	readonly key: RuntimeStateKey<T>;
	readonly value: T;
}

export enum WorkbenchLayoutSettings {
	PANEL_POSITION = 'workbench.panel.defaultLocation',
	PANEL_OPENS_MAXIMIZED = 'workbench.panel.opensMaximized',
	ZEN_MODE_CONFIG = 'zenMode',
	ZEN_MODE_SILENT_NOTIFICATIONS = 'zenMode.silentNotifications',
	EDITOR_CENTERED_LAYOUT_AUTO_RESIZE = 'workbench.editor.centeredLayoutAutoResize',
}

enum LegacyWorkbenchLayoutSettings {
	ACTIVITYBAR_VISIBLE = 'workbench.activityBar.visible', // Deprecated to UI State
	STATUSBAR_VISIBLE = 'workbench.statusBar.visible', // Deprecated to UI State
	SIDEBAR_POSITION = 'workbench.sideBar.location', // Deprecated to UI State
}

export class LayoutStateModel extends Disposable {

	static readonly STORAGE_PREFIX = 'workbench.';

	private readonly _onDidChangeState = this._register(new Emitter<ILayoutStateChangeEvent<StorageKeyType>>());
	readonly onDidChangeState = this._onDidChangeState.event;

	private readonly stateCache = new Map<string, unknown>();

	constructor(
		private readonly storageService: IStorageService,
		private readonly configurationService: IConfigurationService,
		private readonly contextService: IWorkspaceContextService,
		private readonly container: HTMLElement
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(configurationChange => this.updateStateFromLegacySettings(configurationChange)));
	}

	private updateStateFromLegacySettings(configurationChangeEvent: IConfigurationChangeEvent): void {
		const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);

		if (configurationChangeEvent.affectsConfiguration(LegacyWorkbenchLayoutSettings.ACTIVITYBAR_VISIBLE) && !isZenMode) {
			this.setRuntimeValueAndFire(LayoutStateKeys.ACTIVITYBAR_HIDDEN, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.ACTIVITYBAR_VISIBLE));
		}

		if (configurationChangeEvent.affectsConfiguration(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE) && !isZenMode) {
			this.setRuntimeValueAndFire(LayoutStateKeys.STATUSBAR_HIDDEN, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
		}

		if (configurationChangeEvent.affectsConfiguration(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION)) {
			this.setRuntimeValueAndFire(LayoutStateKeys.SIDEBAR_POSITON, positionFromString(this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left'));
		}
	}

	private updateLegacySettingsFromState<T extends StorageKeyType>(key: RuntimeStateKey<T>, value: T): void {
		const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
		if (key.zenModeIgnore && isZenMode) {
			return;
		}

		if (key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
			this.configurationService.updateValue(LegacyWorkbenchLayoutSettings.ACTIVITYBAR_VISIBLE, !value);
		} else if (key === LayoutStateKeys.STATUSBAR_HIDDEN) {
			this.configurationService.updateValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE, !value);
		} else if (key === LayoutStateKeys.SIDEBAR_POSITON) {
			this.configurationService.updateValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION, positionToString(value as Position));
		}
	}

	load(): void {
		let key: keyof typeof LayoutStateKeys;

		// Load stored values for all keys
		for (key in LayoutStateKeys) {
			const stateKey = LayoutStateKeys[key] as WorkbenchLayoutStateKey<StorageKeyType>;
			const value = this.loadKeyFromStorage(stateKey);

			if (value !== undefined) {
				this.stateCache.set(stateKey.name, value);
			}
		}

		// Apply legacy settings
		this.stateCache.set(LayoutStateKeys.ACTIVITYBAR_HIDDEN.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.ACTIVITYBAR_VISIBLE));
		this.stateCache.set(LayoutStateKeys.STATUSBAR_HIDDEN.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
		this.stateCache.set(LayoutStateKeys.SIDEBAR_POSITON.name, positionFromString(this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left'));

		// Set dynamic defaults: part sizing and side bar visibility
		const workbenchDimensions = getClientArea(this.container);
		LayoutStateKeys.PANEL_POSITION.defaultValue = positionFromString(this.configurationService.getValue(WorkbenchLayoutSettings.PANEL_POSITION) ?? 'bottom');
		LayoutStateKeys.GRID_SIZE.defaultValue = { height: workbenchDimensions.height, width: workbenchDimensions.width };
		LayoutStateKeys.SIDEBAR_SIZE.defaultValue = Math.min(300, workbenchDimensions.width / 4);
		LayoutStateKeys.AUXILIARYBAR_SIZE.defaultValue = Math.min(300, workbenchDimensions.width / 4);
		LayoutStateKeys.PANEL_SIZE.defaultValue = (this.stateCache.get(LayoutStateKeys.PANEL_POSITION.name) ?? LayoutStateKeys.PANEL_POSITION.defaultValue) === 'bottom' ? workbenchDimensions.height / 3 : workbenchDimensions.width / 4;
		LayoutStateKeys.SIDEBAR_HIDDEN.defaultValue = this.contextService.getWorkbenchState() === WorkbenchState.EMPTY;

		// Apply all defaults
		for (key in LayoutStateKeys) {
			const stateKey = LayoutStateKeys[key];
			if (this.stateCache.get(stateKey.name) === undefined) {
				this.stateCache.set(stateKey.name, stateKey.defaultValue);
			}
		}

		// Register for runtime key changes
		this._register(this.storageService.onDidChangeValue(storageChangeEvent => {
			let key: keyof typeof LayoutStateKeys;
			for (key in LayoutStateKeys) {
				const stateKey = LayoutStateKeys[key] as WorkbenchLayoutStateKey<StorageKeyType>;
				if (stateKey instanceof RuntimeStateKey && stateKey.scope === StorageScope.PROFILE && stateKey.target === StorageTarget.USER) {
					if (`${LayoutStateModel.STORAGE_PREFIX}${stateKey.name}` === storageChangeEvent.key) {
						const value = this.loadKeyFromStorage(stateKey) ?? stateKey.defaultValue;
						if (this.stateCache.get(stateKey.name) !== value) {
							this.stateCache.set(stateKey.name, value);
							this._onDidChangeState.fire({ key: stateKey, value });
						}
					}
				}
			}
		}));
	}

	save(workspace: boolean, global: boolean): void {
		let key: keyof typeof LayoutStateKeys;

		const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);

		for (key in LayoutStateKeys) {
			const stateKey = LayoutStateKeys[key] as WorkbenchLayoutStateKey<StorageKeyType>;
			if ((workspace && stateKey.scope === StorageScope.WORKSPACE) ||
				(global && stateKey.scope === StorageScope.PROFILE)) {
				if (isZenMode && stateKey instanceof RuntimeStateKey && stateKey.zenModeIgnore) {
					continue; // Don't write out specific keys while in zen mode
				}

				this.saveKeyToStorage(stateKey);
			}
		}
	}

	getInitializationValue<T extends StorageKeyType>(key: InitializationStateKey<T>): T {
		return this.stateCache.get(key.name) as T;
	}

	setInitializationValue<T extends StorageKeyType>(key: InitializationStateKey<T>, value: T): void {
		this.stateCache.set(key.name, value);
	}

	getRuntimeValue<T extends StorageKeyType>(key: RuntimeStateKey<T>, fallbackToSetting?: boolean): T {
		if (fallbackToSetting) {
			switch (key) {
				case LayoutStateKeys.ACTIVITYBAR_HIDDEN:
					this.stateCache.set(key.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.ACTIVITYBAR_VISIBLE));
					break;
				case LayoutStateKeys.STATUSBAR_HIDDEN:
					this.stateCache.set(key.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
					break;
				case LayoutStateKeys.SIDEBAR_POSITON:
					this.stateCache.set(key.name, this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left');
					break;
			}
		}

		return this.stateCache.get(key.name) as T;
	}

	setRuntimeValue<T extends StorageKeyType>(key: RuntimeStateKey<T>, value: T): void {
		this.stateCache.set(key.name, value);
		const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);

		if (key.scope === StorageScope.PROFILE) {
			if (!isZenMode || !key.zenModeIgnore) {
				this.saveKeyToStorage<T>(key);
				this.updateLegacySettingsFromState(key, value);
			}
		}
	}

	private setRuntimeValueAndFire<T extends StorageKeyType>(key: RuntimeStateKey<T>, value: T): void {
		const previousValue = this.stateCache.get(key.name);
		if (previousValue === value) {
			return;
		}

		this.setRuntimeValue(key, value);
		this._onDidChangeState.fire({ key, value });
	}

	private saveKeyToStorage<T extends StorageKeyType>(key: WorkbenchLayoutStateKey<T>): void {
		const value = this.stateCache.get(key.name) as T;
		this.storageService.store(`${LayoutStateModel.STORAGE_PREFIX}${key.name}`, typeof value === 'object' ? JSON.stringify(value) : value, key.scope, key.target);
	}

	private loadKeyFromStorage<T extends StorageKeyType>(key: WorkbenchLayoutStateKey<T>): T | undefined {
		let value: any = this.storageService.get(`${LayoutStateModel.STORAGE_PREFIX}${key.name}`, key.scope);

		if (value !== undefined) {
			switch (typeof key.defaultValue) {
				case 'boolean': value = value === 'true'; break;
				case 'number': value = parseInt(value); break;
				case 'object': value = JSON.parse(value); break;
			}
		}

		return value as T | undefined;
	}
}
