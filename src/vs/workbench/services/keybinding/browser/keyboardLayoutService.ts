/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, toDisposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IKeymapService, IKeyboardLayoutInfo, IKeyboardMapping, IWindowsKeyboardMapping, IWindowsKeyboardLayoutInfo, IMacKeyboardLayoutInfo, ILinuxKeyboardLayoutInfo } from 'vs/workbench/services/keybinding/common/keymapService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DispatchConfig } from 'vs/workbench/services/keybinding/common/dispatchConfig';
import { IKeyboardMapper, CachedKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OS, OperatingSystem, isMacintosh, isWindows, isLinux } from 'vs/base/common/platform';
import { WindowsKeyboardMapper } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { MacLinuxFallbackKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { KeyCodeUtils, KeyCode } from 'vs/base/common/keyCodes';
import { IMacLinuxKeyboardMapping, MacLinuxKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxKeyboardMapper';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyboardLayoutProvider, KeyboardLayoutInfo } from 'vs/workbench/services/keybinding/browser/keyboardLayoutProvider';
import { URI } from 'vs/base/common/uri';
import { IFileService, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { RunOnceScheduler } from 'vs/base/common/async';
import { dirname, isEqual } from 'vs/base/common/resources';
import { parse } from 'vs/base/common/json';
import * as objects from 'vs/base/common/objects';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ConfigExtensions, IConfigurationRegistry, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INavigatorWithKeyboard } from 'vs/workbench/services/keybinding/common/navigatorKeyboard';

export class BrowserKeyboardMapperFactory {
	public static readonly INSTANCE = new BrowserKeyboardMapperFactory();
	private _layoutInfo: IKeyboardLayoutInfo | null;
	private _rawMapping: IKeyboardMapping | null;
	private _keyboardMapper: IKeyboardMapper | null;
	private _initialized: boolean;
	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	private constructor() {
		this._layoutInfo = null;
		this._rawMapping = null;
		this._keyboardMapper = null;
		this._initialized = false;

		const platform = isWindows ? 'win' : isMacintosh ? 'darwin' : 'linux';

		import('vs/workbench/services/keybinding/browser/keyboardlayouts/layout.contribution.' + platform).then(() => {
			this._initialized = true;
			this.onKeyboardLayoutChanged();
		});

		if ((<INavigatorWithKeyboard>navigator).keyboard && (<INavigatorWithKeyboard>navigator).keyboard.addEventListener) {
			(<INavigatorWithKeyboard>navigator).keyboard.addEventListener!('layoutchange', () => {
				// Update user keyboard map settings
				this.getBrowserKeyMap().then((keymap: IKeyboardMapping) => {
					if (KeyboardLayoutProvider.INSTANCE.isActive(keymap)) {
						return;
					}

					this.onKeyboardLayoutChanged();
				});
			});
		}
	}

	public onKeyboardLayoutChanged(): void {
		this._updateKeyboardLayoutAsync(this._initialized);
	}

	private _updateKeyboardLayoutAsync(initialized: boolean) {
		if (!initialized) {
			return;
		}

		this.getBrowserKeyMap().then(keyMap => {
			// might be false positive
			if (KeyboardLayoutProvider.INSTANCE.isActive(keyMap)) {
				return;
			}
			KeyboardLayoutProvider.INSTANCE.setActive(keyMap);
			let currentKeyboardLayout = KeyboardLayoutProvider.INSTANCE.activeKeyboardLayout;

			if (currentKeyboardLayout) {
				this._setKeyboardData(currentKeyboardLayout.layout, keyMap);
			}
		});
	}

	public getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		if (!this._initialized) {
			return new MacLinuxFallbackKeyboardMapper(OS);
		}
		if (dispatchConfig === DispatchConfig.KeyCode) {
			// Forcefully set to use keyCode
			return new MacLinuxFallbackKeyboardMapper(OS);
		}
		return this._keyboardMapper!;

	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		if (!this._initialized) {
			return null;
		}
		return this._layoutInfo;
	}

	public getAllKeyboardLayouts(): IKeyboardLayoutInfo[] {
		return KeyboardLayoutProvider.INSTANCE.getKeyboardLayouts().map(info => info.layout);
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		if (!this._initialized) {
			return;
		}

		let isCurrentKeyboard = this._validateCurrentKeyboardMapping(keyboardEvent);

		if (isCurrentKeyboard) {
			return;
		}

		this._updateKeyboardLayoutAsync(true);
	}

	private _validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): boolean {
		if (!this._initialized) {
			return true;
		}

		const standardKeyboardEvent = keyboardEvent as StandardKeyboardEvent;
		const currentKeymap = KeyboardLayoutProvider.INSTANCE.activeKeyboardLayout;
		if (!currentKeymap) {
			return true;
		}

		const mapping = currentKeymap.value[standardKeyboardEvent.code];

		if (!mapping) {
			return false;
		}

		if (mapping.value === '') {
			// we don't undetstand
			if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
				setTimeout(() => {
					this.getBrowserKeyMap().then((keymap: IKeyboardMapping) => {
						if (KeyboardLayoutProvider.INSTANCE.isActive(keymap)) {
							return;
						}

						this.onKeyboardLayoutChanged();
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

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		if (!this._initialized) {
			return null;
		}
		return this._rawMapping;
	}

	public setKeyboardLayout(layoutName: string) {
		let allKeyboardLayouts = KeyboardLayoutProvider.INSTANCE.getKeyboardLayouts();
		let matchedLayouts: KeyboardLayoutInfo[] = [];
		if (isWindows) {
			matchedLayouts = allKeyboardLayouts.filter(layout => (<IWindowsKeyboardLayoutInfo>layout.layout).name === layoutName);
		}

		if (isMacintosh) {
			// todo, probably we should use layout.id?
			matchedLayouts = allKeyboardLayouts.filter(layout => (<IMacKeyboardLayoutInfo>layout.layout).lang === layoutName);
		}

		if (isLinux) {
			// todo, probably we should use layout.id?
			matchedLayouts = allKeyboardLayouts.filter(layout => (<ILinuxKeyboardLayoutInfo>layout.layout).layout === layoutName);
		}

		if (matchedLayouts.length > 0) {
			KeyboardLayoutProvider.INSTANCE.setActive2(matchedLayouts[0]);

			let currentKeyboardLayout = KeyboardLayoutProvider.INSTANCE.activeKeyboardLayout;

			if (currentKeyboardLayout) {
				this._setKeyboardData(currentKeyboardLayout.layout, currentKeyboardLayout.value);

				return;
			}
		}
	}

	private _setKeyboardData(layoutInfo: IKeyboardLayoutInfo, rawMapping: IKeyboardMapping): void {
		this._layoutInfo = layoutInfo;
		this._initialized = true;
		this._rawMapping = rawMapping;
		this._keyboardMapper = new CachedKeyboardMapper(BrowserKeyboardMapperFactory._createKeyboardMapper(this._layoutInfo, this._rawMapping));
		this._onDidChangeKeyboardMapper.fire();
	}

	private static _isUSStandard(rawMapping: IKeyboardMapping): boolean {
		for (let key in rawMapping) {
			let str = rawMapping[key].value;
			let keyCode = KeyCodeUtils.fromString(str);
			let usKeyCode = US_SCANCODE_MAP[key];

			if (keyCode !== usKeyCode) {
				return false;
			}

		}
		return true;
	}

	private static _createKeyboardMapper(layoutInfo: IKeyboardLayoutInfo, rawMapping: IKeyboardMapping): IKeyboardMapper {
		const isUSStandard = BrowserKeyboardMapperFactory._isUSStandard(rawMapping);
		if (OS === OperatingSystem.Windows) {
			return new WindowsKeyboardMapper(isUSStandard, <IWindowsKeyboardMapping>rawMapping);
		}
		if (Object.keys(rawMapping).length === 0) {
			// Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
			return new MacLinuxFallbackKeyboardMapper(OS);
		}

		return new MacLinuxKeyboardMapper(isUSStandard, <IMacLinuxKeyboardMapping>rawMapping, OS);
	}

	async getBrowserKeyMap() {
		if ((navigator as any).keyboard) {
			try {
				return (navigator as any).keyboard.getLayoutMap().then((e: any) => {
					let ret: IKeyboardMapping = {};
					for (let key of e) {
						ret[key[0]] = {
							'value': key[1],
							'withShift': '',
							'withAltGr': '',
							'withShiftAltGr': ''
						};
					}

					const matchedKeyboardLayout = KeyboardLayoutProvider.INSTANCE.getMatchedKeyboardLayout(ret);

					if (matchedKeyboardLayout) {
						return matchedKeyboardLayout.value;
					}

					return {};
				});
			} catch {
				// getLayoutMap can throw if invoked from a nested browsing context
			}
		}

		return {};
	}
}


export const US_SCANCODE_MAP: { [str: string]: KeyCode; } = {};

(function () {
	function define(scanCode: string, keyCode: KeyCode): void {
		US_SCANCODE_MAP[scanCode] = keyCode;
	}

	define('Backquote', KeyCode.US_BACKTICK);
	define('Backslash', KeyCode.US_BACKSLASH);
	define('BracketLeft', KeyCode.US_OPEN_SQUARE_BRACKET);
	define('BracketRight', KeyCode.US_CLOSE_SQUARE_BRACKET);
	define('Comma', KeyCode.US_COMMA);
	define('Digit0', KeyCode.KEY_0);
	define('Digit1', KeyCode.KEY_1);
	define('Digit2', KeyCode.KEY_2);
	define('Digit3', KeyCode.KEY_3);
	define('Digit4', KeyCode.KEY_4);
	define('Digit5', KeyCode.KEY_5);
	define('Digit6', KeyCode.KEY_6);
	define('Digit7', KeyCode.KEY_7);
	define('Digit8', KeyCode.KEY_8);
	define('Digit9', KeyCode.KEY_9);
	define('Equal', KeyCode.US_EQUAL);
	define('IntlBackslash', KeyCode.Unknown);
	define('KeyA', KeyCode.KEY_A);
	define('KeyB', KeyCode.KEY_B);
	define('KeyC', KeyCode.KEY_C);
	define('KeyD', KeyCode.KEY_D);
	define('KeyE', KeyCode.KEY_E);
	define('KeyF', KeyCode.KEY_F);
	define('KeyG', KeyCode.KEY_G);
	define('KeyH', KeyCode.KEY_H);
	define('KeyI', KeyCode.KEY_I);
	define('KeyJ', KeyCode.KEY_J);
	define('KeyK', KeyCode.KEY_K);
	define('KeyL', KeyCode.KEY_L);
	define('KeyM', KeyCode.KEY_M);
	define('KeyN', KeyCode.KEY_N);
	define('KeyO', KeyCode.KEY_O);
	define('KeyP', KeyCode.KEY_P);
	define('KeyQ', KeyCode.KEY_Q);
	define('KeyR', KeyCode.KEY_R);
	define('KeyS', KeyCode.KEY_S);
	define('KeyT', KeyCode.KEY_T);
	define('KeyU', KeyCode.KEY_U);
	define('KeyV', KeyCode.KEY_V);
	define('KeyW', KeyCode.KEY_W);
	define('KeyX', KeyCode.KEY_X);
	define('KeyY', KeyCode.KEY_Y);
	define('KeyZ', KeyCode.KEY_Z);
	define('Minus', KeyCode.US_MINUS);
	define('Period', KeyCode.US_DOT);
	define('Quote', KeyCode.US_QUOTE);
	define('Semicolon', KeyCode.US_SEMICOLON);
	define('Slash', KeyCode.US_SLASH);
})();

class UserKeyboardLayout extends Disposable {
	private readonly reloadConfigurationScheduler: RunOnceScheduler;
	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private fileWatcherDisposable: IDisposable = Disposable.None;
	private directoryWatcherDisposable: IDisposable = Disposable.None;

	private _keyboardLayout: KeyboardLayoutInfo | null;
	get keyboardLayout(): KeyboardLayoutInfo | null { return this._keyboardLayout; }

	constructor(
		private readonly keyboardLayoutResource: URI,
		private readonly fileService: IFileService
	) {
		super();

		this._keyboardLayout = null;

		this._register(fileService.onFileChanges(e => this.handleFileEvents(e)));
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(changed => {
			if (changed) {
				this._onDidChange.fire();
			}
		}), 50));

		this._register(toDisposable(() => {
			this.stopWatchingResource();
			this.stopWatchingDirectory();
		}));
	}

	async initialize(): Promise<void> {
		const exists = await this.fileService.exists(this.keyboardLayoutResource);
		this.onResourceExists(exists);
		await this.reload();
	}

	private async reload(): Promise<boolean> {
		const existing = this._keyboardLayout;
		try {
			const content = await this.fileService.readFile(this.keyboardLayoutResource);
			const value = parse(content.value.toString());
			const layoutInfo = value.layout;
			const mappings = value.rawMapping;
			this._keyboardLayout = KeyboardLayoutInfo.createKeyboardLayoutFromDebugInfo(layoutInfo, mappings, true);
		} catch (e) {
			this._keyboardLayout = null;
		}

		return existing ? !objects.equals(existing, this._keyboardLayout) : true;
	}

	private watchResource(): void {
		this.fileWatcherDisposable = this.fileService.watch(this.keyboardLayoutResource);
	}

	private watchDirectory(): void {
		const directory = dirname(this.keyboardLayoutResource);
		this.directoryWatcherDisposable = this.fileService.watch(directory);
	}

	private stopWatchingResource(): void {
		this.fileWatcherDisposable.dispose();
		this.fileWatcherDisposable = Disposable.None;
	}

	private stopWatchingDirectory(): void {
		this.directoryWatcherDisposable.dispose();
		this.directoryWatcherDisposable = Disposable.None;
	}

	private async handleFileEvents(event: FileChangesEvent): Promise<void> {
		const events = event.changes;

		let affectedByChanges = false;

		// Find changes that affect the resource
		for (const event of events) {
			affectedByChanges = isEqual(this.keyboardLayoutResource, event.resource);
			if (affectedByChanges) {
				if (event.type === FileChangeType.ADDED) {
					this.onResourceExists(true);
				} else if (event.type === FileChangeType.DELETED) {
					this.onResourceExists(false);
				}
				break;
			}
		}

		if (affectedByChanges) {
			this.reloadConfigurationScheduler.schedule();
		}
	}

	private onResourceExists(exists: boolean): void {
		if (exists) {
			this.stopWatchingDirectory();
			this.watchResource();
		} else {
			this.stopWatchingResource();
			this.watchDirectory();
		}
	}
}

class BrowserKeymapService extends Disposable implements IKeymapService {
	public _serviceBrand: any;

	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	private _userKeyboardLayout: UserKeyboardLayout;

	private readonly layoutChangeListener = this._register(new MutableDisposable());

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
	) {
		super();
		const keyboardConfig = configurationService.getValue<{ layout: string }>('keyboard');
		const layout = keyboardConfig.layout;

		if (!layout || layout === 'autodetect') {
			this.registerKeyboardListener();
		} else {
			// set keyboard layout
			BrowserKeyboardMapperFactory.INSTANCE.setKeyboardLayout(layout);
		}

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.indexOf('keyboard.layout') >= 0) {
				const keyboardConfig = configurationService.getValue<{ layout: string }>('keyboard');
				const layout = keyboardConfig.layout;

				if (layout === 'autodetect') {
					this.registerKeyboardListener();
					BrowserKeyboardMapperFactory.INSTANCE.onKeyboardLayoutChanged();
				} else {
					BrowserKeyboardMapperFactory.INSTANCE.setKeyboardLayout(layout);
				}
			}
		}));

		this._userKeyboardLayout = new UserKeyboardLayout(environmentService.keyboardLayoutResource, fileService);
		this._userKeyboardLayout.initialize();

		if (this._userKeyboardLayout.keyboardLayout) {
			KeyboardLayoutProvider.INSTANCE.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
		}

		this._register(this._userKeyboardLayout.onDidChange(() => {
			let userKeyboardLayouts = KeyboardLayoutProvider.INSTANCE.getKeyboardLayouts().filter(layout => layout.isUserKeyboardLayout);

			if (userKeyboardLayouts.length) {
				if (this._userKeyboardLayout.keyboardLayout) {
					userKeyboardLayouts[0].update(this._userKeyboardLayout.keyboardLayout);
				} else {
					KeyboardLayoutProvider.INSTANCE.removeKeyboardLayout(userKeyboardLayouts[0]);
				}
			} else {
				if (this._userKeyboardLayout.keyboardLayout) {
					KeyboardLayoutProvider.INSTANCE.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
				}
			}

			// TODO: trigger keymap update
		}));
	}

	registerKeyboardListener() {
		this.layoutChangeListener.value = BrowserKeyboardMapperFactory.INSTANCE.onDidChangeKeyboardMapper(() => {
			this._onDidChangeKeyboardMapper.fire();
		});
	}

	getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		return BrowserKeyboardMapperFactory.INSTANCE.getKeyboardMapper(dispatchConfig);
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return BrowserKeyboardMapperFactory.INSTANCE.getCurrentKeyboardLayout();
	}

	public getAllKeyboardLayouts(): IKeyboardLayoutInfo[] {
		return BrowserKeyboardMapperFactory.INSTANCE.getAllKeyboardLayouts();
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return BrowserKeyboardMapperFactory.INSTANCE.getRawKeyboardMapping();
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		BrowserKeyboardMapperFactory.INSTANCE.validateCurrentKeyboardMapping(keyboardEvent);
	}
}

registerSingleton(IKeymapService, BrowserKeymapService, true);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigExtensions.Configuration);
const keyboardConfiguration: IConfigurationNode = {
	'id': 'keyboard',
	'order': 15,
	'type': 'object',
	'title': nls.localize('keyboardConfigurationTitle', "Keyboard"),
	'overridable': true,
	'properties': {
		'keyboard.layout': {
			'type': 'string',
			'default': 'autodetect',
			'description': nls.localize('keyboard.layout.config', "Control the keyboard layout used in web.")
		}
	}
};

configurationRegistry.registerConfiguration(keyboardConfiguration);