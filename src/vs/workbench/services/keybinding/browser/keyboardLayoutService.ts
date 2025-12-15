/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { AppResourcePath, FileAccess } from '../../../../base/common/network.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { KeymapInfo, IRawMixedKeyboardMapping, IKeymapInfo } from '../common/keymapInfo.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DispatchConfig, readKeyboardConfig } from '../../../../platform/keyboardLayout/common/keyboardConfig.js';
import { IKeyboardMapper, CachedKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { OS, OperatingSystem, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { WindowsKeyboardMapper } from '../common/windowsKeyboardMapper.js';
import { FallbackKeyboardMapper } from '../common/fallbackKeyboardMapper.js';
import { IKeyboardEvent } from '../../../../platform/keybinding/common/keybinding.js';
import { MacLinuxKeyboardMapper } from '../common/macLinuxKeyboardMapper.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { parse, getNodeType } from '../../../../base/common/json.js';
import * as objects from '../../../../base/common/objects.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigExtensions, IConfigurationRegistry, IConfigurationNode } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INavigatorWithKeyboard } from './navigatorKeyboard.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { getKeyboardLayoutId, IKeyboardLayoutInfo, IKeyboardLayoutService, IKeyboardMapping, IMacLinuxKeyboardMapping, IWindowsKeyboardMapping } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';

export class BrowserKeyboardMapperFactoryBase extends Disposable {
	// keyboard mapper
	protected _initialized: boolean;
	protected _keyboardMapper: IKeyboardMapper | null;
	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	// keymap infos
	protected _keymapInfos: KeymapInfo[];
	protected _mru: KeymapInfo[];
	private _activeKeymapInfo: KeymapInfo | null;
	private keyboardLayoutMapAllowed: boolean = (navigator as INavigatorWithKeyboard).keyboard !== undefined;

	get activeKeymap(): KeymapInfo | null {
		return this._activeKeymapInfo;
	}

	get keymapInfos(): KeymapInfo[] {
		return this._keymapInfos;
	}

	get activeKeyboardLayout(): IKeyboardLayoutInfo | null {
		if (!this._initialized) {
			return null;
		}

		return this._activeKeymapInfo?.layout ?? null;
	}

	get activeKeyMapping(): IKeyboardMapping | null {
		if (!this._initialized) {
			return null;
		}

		return this._activeKeymapInfo?.mapping ?? null;
	}

	get keyboardLayouts(): IKeyboardLayoutInfo[] {
		return this._keymapInfos.map(keymapInfo => keymapInfo.layout);
	}

	protected constructor(
		private readonly _configurationService: IConfigurationService,
		// private _notificationService: INotificationService,
		// private _storageService: IStorageService,
		// private _commandService: ICommandService
	) {
		super();
		this._keyboardMapper = null;
		this._initialized = false;
		this._keymapInfos = [];
		this._mru = [];
		this._activeKeymapInfo = null;

		if ((<INavigatorWithKeyboard>navigator).keyboard && (<INavigatorWithKeyboard>navigator).keyboard.addEventListener) {
			(<INavigatorWithKeyboard>navigator).keyboard.addEventListener!('layoutchange', () => {
				// Update user keyboard map settings
				this._getBrowserKeyMapping().then((mapping: IKeyboardMapping | null) => {
					if (this.isKeyMappingActive(mapping)) {
						return;
					}

					this.setLayoutFromBrowserAPI();
				});
			});
		}

		this._register(this._configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('keyboard')) {
				this._keyboardMapper = null;
				this._onDidChangeKeyboardMapper.fire();
			}
		}));
	}

	registerKeyboardLayout(layout: KeymapInfo) {
		this._keymapInfos.push(layout);
		this._mru = this._keymapInfos;
	}

	removeKeyboardLayout(layout: KeymapInfo): void {
		let index = this._mru.indexOf(layout);
		this._mru.splice(index, 1);
		index = this._keymapInfos.indexOf(layout);
		this._keymapInfos.splice(index, 1);
	}

	getMatchedKeymapInfo(keyMapping: IKeyboardMapping | null): { result: KeymapInfo; score: number } | null {
		if (!keyMapping) {
			return null;
		}

		const usStandard = this.getUSStandardLayout();

		if (usStandard) {
			let maxScore = usStandard.getScore(keyMapping);
			if (maxScore === 0) {
				return {
					result: usStandard,
					score: 0
				};
			}

			let result = usStandard;
			for (let i = 0; i < this._mru.length; i++) {
				const score = this._mru[i].getScore(keyMapping);
				if (score > maxScore) {
					if (score === 0) {
						return {
							result: this._mru[i],
							score: 0
						};
					}

					maxScore = score;
					result = this._mru[i];
				}
			}

			return {
				result,
				score: maxScore
			};
		}

		for (let i = 0; i < this._mru.length; i++) {
			if (this._mru[i].fuzzyEqual(keyMapping)) {
				return {
					result: this._mru[i],
					score: 0
				};
			}
		}

		return null;
	}

	getUSStandardLayout() {
		const usStandardLayouts = this._mru.filter(layout => layout.layout.isUSStandard);

		if (usStandardLayouts.length) {
			return usStandardLayouts[0];
		}

		return null;
	}

	isKeyMappingActive(keymap: IKeyboardMapping | null) {
		return this._activeKeymapInfo && keymap && this._activeKeymapInfo.fuzzyEqual(keymap);
	}

	setUSKeyboardLayout() {
		this._activeKeymapInfo = this.getUSStandardLayout();
	}

	setActiveKeyMapping(keymap: IKeyboardMapping | null) {
		let keymapUpdated = false;
		const matchedKeyboardLayout = this.getMatchedKeymapInfo(keymap);
		if (matchedKeyboardLayout) {
			// let score = matchedKeyboardLayout.score;

			// Due to https://bugs.chromium.org/p/chromium/issues/detail?id=977609, any key after a dead key will generate a wrong mapping,
			// we shoud avoid yielding the false error.
			// if (keymap && score < 0) {
			// const donotAskUpdateKey = 'missing.keyboardlayout.donotask';
			// if (this._storageService.getBoolean(donotAskUpdateKey, StorageScope.APPLICATION)) {
			// 	return;
			// }

			// the keyboard layout doesn't actually match the key event or the keymap from chromium
			// this._notificationService.prompt(
			// 	Severity.Info,
			// 	nls.localize('missing.keyboardlayout', 'Fail to find matching keyboard layout'),
			// 	[{
			// 		label: nls.localize('keyboardLayoutMissing.configure', "Configure"),
			// 		run: () => this._commandService.executeCommand('workbench.action.openKeyboardLayoutPicker')
			// 	}, {
			// 		label: nls.localize('neverAgain', "Don't Show Again"),
			// 		isSecondary: true,
			// 		run: () => this._storageService.store(donotAskUpdateKey, true, StorageScope.APPLICATION)
			// 	}]
			// );

			// console.warn('Active keymap/keyevent does not match current keyboard layout', JSON.stringify(keymap), this._activeKeymapInfo ? JSON.stringify(this._activeKeymapInfo.layout) : '');

			// return;
			// }

			if (!this._activeKeymapInfo) {
				this._activeKeymapInfo = matchedKeyboardLayout.result;
				keymapUpdated = true;
			} else if (keymap) {
				if (matchedKeyboardLayout.result.getScore(keymap) > this._activeKeymapInfo.getScore(keymap)) {
					this._activeKeymapInfo = matchedKeyboardLayout.result;
					keymapUpdated = true;
				}
			}
		}

		if (!this._activeKeymapInfo) {
			this._activeKeymapInfo = this.getUSStandardLayout();
			keymapUpdated = true;
		}

		if (!this._activeKeymapInfo || !keymapUpdated) {
			return;
		}

		const index = this._mru.indexOf(this._activeKeymapInfo);

		this._mru.splice(index, 1);
		this._mru.unshift(this._activeKeymapInfo);

		this._setKeyboardData(this._activeKeymapInfo);
	}

	setActiveKeymapInfo(keymapInfo: KeymapInfo) {
		this._activeKeymapInfo = keymapInfo;

		const index = this._mru.indexOf(this._activeKeymapInfo);

		if (index === 0) {
			return;
		}

		this._mru.splice(index, 1);
		this._mru.unshift(this._activeKeymapInfo);

		this._setKeyboardData(this._activeKeymapInfo);
	}

	public setLayoutFromBrowserAPI(): void {
		this._updateKeyboardLayoutAsync(this._initialized);
	}

	private _updateKeyboardLayoutAsync(initialized: boolean, keyboardEvent?: IKeyboardEvent) {
		if (!initialized) {
			return;
		}

		this._getBrowserKeyMapping(keyboardEvent).then(keyMap => {
			// might be false positive
			if (this.isKeyMappingActive(keyMap)) {
				return;
			}
			this.setActiveKeyMapping(keyMap);
		});
	}

	public getKeyboardMapper(): IKeyboardMapper {
		const config = readKeyboardConfig(this._configurationService);
		if (config.dispatch === DispatchConfig.KeyCode || !this._initialized || !this._activeKeymapInfo) {
			// Forcefully set to use keyCode
			return new FallbackKeyboardMapper(config.mapAltGrToCtrlAlt, OS);
		}
		if (!this._keyboardMapper) {
			this._keyboardMapper = new CachedKeyboardMapper(BrowserKeyboardMapperFactory._createKeyboardMapper(this._activeKeymapInfo, config.mapAltGrToCtrlAlt));
		}
		return this._keyboardMapper;
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		if (!this._initialized) {
			return;
		}

		const isCurrentKeyboard = this._validateCurrentKeyboardMapping(keyboardEvent);

		if (isCurrentKeyboard) {
			return;
		}

		this._updateKeyboardLayoutAsync(true, keyboardEvent);
	}

	public setKeyboardLayout(layoutName: string) {
		const matchedLayouts: KeymapInfo[] = this.keymapInfos.filter(keymapInfo => getKeyboardLayoutId(keymapInfo.layout) === layoutName);

		if (matchedLayouts.length > 0) {
			this.setActiveKeymapInfo(matchedLayouts[0]);
		}
	}

	private _setKeyboardData(keymapInfo: KeymapInfo): void {
		this._initialized = true;

		this._keyboardMapper = null;
		this._onDidChangeKeyboardMapper.fire();
	}

	private static _createKeyboardMapper(keymapInfo: KeymapInfo, mapAltGrToCtrlAlt: boolean): IKeyboardMapper {
		const rawMapping = keymapInfo.mapping;
		const isUSStandard = !!keymapInfo.layout.isUSStandard;
		if (OS === OperatingSystem.Windows) {
			return new WindowsKeyboardMapper(isUSStandard, <IWindowsKeyboardMapping>rawMapping, mapAltGrToCtrlAlt);
		}
		if (Object.keys(rawMapping).length === 0) {
			// Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
			return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
		}

		return new MacLinuxKeyboardMapper(isUSStandard, <IMacLinuxKeyboardMapping>rawMapping, mapAltGrToCtrlAlt, OS);
	}

	//#region Browser API
	private _validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): boolean {
		if (!this._initialized) {
			return true;
		}

		const standardKeyboardEvent = keyboardEvent as StandardKeyboardEvent;
		const currentKeymap = this._activeKeymapInfo;
		if (!currentKeymap) {
			return true;
		}

		if (standardKeyboardEvent.browserEvent.key === 'Dead' || standardKeyboardEvent.browserEvent.isComposing) {
			return true;
		}

		const mapping = currentKeymap.mapping[standardKeyboardEvent.code];

		if (!mapping) {
			return false;
		}

		if (mapping.value === '') {
			// The value is empty when the key is not a printable character, we skip validation.
			if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
				setTimeout(() => {
					this._getBrowserKeyMapping().then((keymap: IRawMixedKeyboardMapping | null) => {
						if (this.isKeyMappingActive(keymap)) {
							return;
						}

						this.setLayoutFromBrowserAPI();
					});
				}, 350);
			}
			return true;
		}

		const expectedValue = standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey ? mapping.withShiftAltGr :
			standardKeyboardEvent.altKey ? mapping.withAltGr :
				standardKeyboardEvent.shiftKey ? mapping.withShift : mapping.value;

		const isDead = (standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey && mapping.withShiftAltGrIsDeadKey) ||
			(standardKeyboardEvent.altKey && mapping.withAltGrIsDeadKey) ||
			(standardKeyboardEvent.shiftKey && mapping.withShiftIsDeadKey) ||
			mapping.valueIsDeadKey;

		if (isDead && standardKeyboardEvent.browserEvent.key !== 'Dead') {
			return false;
		}

		// TODO, this assumption is wrong as `browserEvent.key` doesn't necessarily equal expectedValue from real keymap
		if (!isDead && standardKeyboardEvent.browserEvent.key !== expectedValue) {
			return false;
		}

		return true;
	}

	private async _getBrowserKeyMapping(keyboardEvent?: IKeyboardEvent): Promise<IRawMixedKeyboardMapping | null> {
		if (this.keyboardLayoutMapAllowed) {
			try {
				return await (navigator as INavigatorWithKeyboard).keyboard.getLayoutMap().then((e: any) => {
					const ret: IKeyboardMapping = {};
					for (const key of e) {
						ret[key[0]] = {
							'value': key[1],
							'withShift': '',
							'withAltGr': '',
							'withShiftAltGr': ''
						};
					}

					return ret;

					// const matchedKeyboardLayout = this.getMatchedKeymapInfo(ret);

					// if (matchedKeyboardLayout) {
					// 	return matchedKeyboardLayout.result.mapping;
					// }

					// return null;
				});
			} catch {
				// getLayoutMap can throw if invoked from a nested browsing context
				this.keyboardLayoutMapAllowed = false;
			}
		}
		if (keyboardEvent && !keyboardEvent.shiftKey && !keyboardEvent.altKey && !keyboardEvent.metaKey && !keyboardEvent.metaKey) {
			const ret: IKeyboardMapping = {};
			const standardKeyboardEvent = keyboardEvent as StandardKeyboardEvent;
			ret[standardKeyboardEvent.browserEvent.code] = {
				'value': standardKeyboardEvent.browserEvent.key,
				'withShift': '',
				'withAltGr': '',
				'withShiftAltGr': ''
			};

			const matchedKeyboardLayout = this.getMatchedKeymapInfo(ret);

			if (matchedKeyboardLayout) {
				return ret;
			}

			return null;
		}

		return null;
	}

	//#endregion
}

export class BrowserKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
	constructor(configurationService: IConfigurationService, notificationService: INotificationService, storageService: IStorageService, commandService: ICommandService) {
		// super(notificationService, storageService, commandService);
		super(configurationService);

		const platform = isWindows ? 'win' : isMacintosh ? 'darwin' : 'linux';

		import(FileAccess.asBrowserUri(`vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.${platform}.js` satisfies AppResourcePath).path).then((m) => {
			const keymapInfos: IKeymapInfo[] = m.KeyboardLayoutContribution.INSTANCE.layoutInfos;
			this._keymapInfos.push(...keymapInfos.map(info => (new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout))));
			this._mru = this._keymapInfos;
			this._initialized = true;
			this.setLayoutFromBrowserAPI();
		});
	}
}

class UserKeyboardLayout extends Disposable {

	private readonly reloadConfigurationScheduler: RunOnceScheduler;
	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _keyboardLayout: KeymapInfo | null;
	get keyboardLayout(): KeymapInfo | null { return this._keyboardLayout; }

	constructor(
		private readonly keyboardLayoutResource: URI,
		private readonly fileService: IFileService
	) {
		super();

		this._keyboardLayout = null;

		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(changed => {
			if (changed) {
				this._onDidChange.fire();
			}
		}), 50));

		this._register(Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.keyboardLayoutResource))(() => this.reloadConfigurationScheduler.schedule()));
	}

	async initialize(): Promise<void> {
		await this.reload();
	}

	private async reload(): Promise<boolean> {
		const existing = this._keyboardLayout;
		try {
			const content = await this.fileService.readFile(this.keyboardLayoutResource);
			const value = parse(content.value.toString());
			if (getNodeType(value) === 'object') {
				const layoutInfo = value.layout;
				const mappings = value.rawMapping;
				this._keyboardLayout = KeymapInfo.createKeyboardLayoutFromDebugInfo(layoutInfo, mappings, true);
			} else {
				this._keyboardLayout = null;
			}
		} catch (e) {
			this._keyboardLayout = null;
		}

		return existing ? !objects.equals(existing, this._keyboardLayout) : true;
	}

}

export class BrowserKeyboardLayoutService extends Disposable implements IKeyboardLayoutService {
	public _serviceBrand: undefined;

	private readonly _onDidChangeKeyboardLayout = new Emitter<void>();
	public readonly onDidChangeKeyboardLayout: Event<void> = this._onDidChangeKeyboardLayout.event;

	private _userKeyboardLayout: UserKeyboardLayout;

	private readonly _factory: BrowserKeyboardMapperFactory;
	private _keyboardLayoutMode: string;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super();
		const keyboardConfig = configurationService.getValue<{ layout: string }>('keyboard');
		const layout = keyboardConfig.layout;
		this._keyboardLayoutMode = layout ?? 'autodetect';
		this._factory = new BrowserKeyboardMapperFactory(configurationService, notificationService, storageService, commandService);

		this._register(this._factory.onDidChangeKeyboardMapper(() => {
			this._onDidChangeKeyboardLayout.fire();
		}));

		if (layout && layout !== 'autodetect') {
			// set keyboard layout
			this._factory.setKeyboardLayout(layout);
		}

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('keyboard.layout')) {
				const keyboardConfig = configurationService.getValue<{ layout: string }>('keyboard');
				const layout = keyboardConfig.layout;
				this._keyboardLayoutMode = layout;

				if (layout === 'autodetect') {
					this._factory.setLayoutFromBrowserAPI();
				} else {
					this._factory.setKeyboardLayout(layout);
				}
			}
		}));

		this._userKeyboardLayout = new UserKeyboardLayout(environmentService.keyboardLayoutResource, fileService);
		this._userKeyboardLayout.initialize().then(() => {
			if (this._userKeyboardLayout.keyboardLayout) {
				this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);

				this.setUserKeyboardLayoutIfMatched();
			}
		});

		this._register(this._userKeyboardLayout.onDidChange(() => {
			const userKeyboardLayouts = this._factory.keymapInfos.filter(layout => layout.isUserKeyboardLayout);

			if (userKeyboardLayouts.length) {
				if (this._userKeyboardLayout.keyboardLayout) {
					userKeyboardLayouts[0].update(this._userKeyboardLayout.keyboardLayout);
				} else {
					this._factory.removeKeyboardLayout(userKeyboardLayouts[0]);
				}
			} else {
				if (this._userKeyboardLayout.keyboardLayout) {
					this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
				}
			}

			this.setUserKeyboardLayoutIfMatched();
		}));
	}

	setUserKeyboardLayoutIfMatched() {
		const keyboardConfig = this.configurationService.getValue<{ layout: string }>('keyboard');
		const layout = keyboardConfig.layout;

		if (layout && this._userKeyboardLayout.keyboardLayout) {
			if (getKeyboardLayoutId(this._userKeyboardLayout.keyboardLayout.layout) === layout && this._factory.activeKeymap) {

				if (!this._userKeyboardLayout.keyboardLayout.equal(this._factory.activeKeymap)) {
					this._factory.setActiveKeymapInfo(this._userKeyboardLayout.keyboardLayout);
				}
			}
		}
	}

	getKeyboardMapper(): IKeyboardMapper {
		return this._factory.getKeyboardMapper();
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return this._factory.activeKeyboardLayout;
	}

	public getAllKeyboardLayouts(): IKeyboardLayoutInfo[] {
		return this._factory.keyboardLayouts;
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return this._factory.activeKeyMapping;
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		if (this._keyboardLayoutMode !== 'autodetect') {
			return;
		}

		this._factory.validateCurrentKeyboardMapping(keyboardEvent);
	}
}

registerSingleton(IKeyboardLayoutService, BrowserKeyboardLayoutService, InstantiationType.Delayed);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigExtensions.Configuration);
const keyboardConfiguration: IConfigurationNode = {
	'id': 'keyboard',
	'order': 15,
	'type': 'object',
	'title': nls.localize('keyboardConfigurationTitle', "Keyboard"),
	'properties': {
		'keyboard.layout': {
			'type': 'string',
			'default': 'autodetect',
			'description': nls.localize('keyboard.layout.config', "Control the keyboard layout used in web.")
		}
	}
};

configurationRegistry.registerConfiguration(keyboardConfiguration);
