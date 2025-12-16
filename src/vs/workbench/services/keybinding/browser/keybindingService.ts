/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';

// base
import * as browser from '../../../../base/browser/browser.js';
import { BrowserFeatures, KeyboardSupport } from '../../../../base/browser/canIUse.js';
import * as dom from '../../../../base/browser/dom.js';
import { printKeyboardEvent, printStandardKeyboardEvent, StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DeferredPromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { IJSONSchema, TypeFromJsonSchema } from '../../../../base/common/jsonSchema.js';
import { UserSettingsLabelProvider } from '../../../../base/common/keybindingLabels.js';
import { KeybindingParser } from '../../../../base/common/keybindingParser.js';
import { Keybinding, KeyCodeChord, ResolvedKeybinding, ScanCodeChord } from '../../../../base/common/keybindings.js';
import { IMMUTABLE_CODE_TO_KEY_CODE, KeyCode, KeyCodeUtils, KeyMod, ScanCode, ScanCodeUtils } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import { isMacintosh, OperatingSystem, OS } from '../../../../base/common/platform.js';
import { dirname } from '../../../../base/common/resources.js';

// platform
import { ILocalizedString, isLocalizedString } from '../../../../platform/action/common/action.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { FileOperation, IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Extensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { AbstractKeybindingService } from '../../../../platform/keybinding/common/abstractKeybindingService.js';
import { IKeybindingService, IKeyboardEvent, KeybindingsSchemaContribution } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingResolver } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { IExtensionKeybindingRule, IKeybindingItem, KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { IKeyboardLayoutService } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { IKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';

// workbench
import { remove } from '../../../../base/common/arrays.js';
import { commandsExtensionPoint } from '../../actions/common/menusExtensionPoint.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ExtensionMessageCollector, ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { IHostService } from '../../host/browser/host.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserKeybindingItem, KeybindingIO, OutputBuilder } from '../common/keybindingIO.js';
import { IKeyboard, INavigatorWithKeyboard } from './navigatorKeyboard.js';
import { getAllUnboundCommands } from './unboundCommands.js';

function isValidContributedKeyBinding(keyBinding: ContributedKeyBinding, rejects: string[]): boolean {
	if (!keyBinding) {
		rejects.push(nls.localize('nonempty', "expected non-empty value."));
		return false;
	}
	if (typeof keyBinding.command !== 'string') {
		rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
		return false;
	}
	if (keyBinding.key && typeof keyBinding.key !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'key'));
		return false;
	}
	if (keyBinding.when && typeof keyBinding.when !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
		return false;
	}
	if (keyBinding.mac && typeof keyBinding.mac !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'mac'));
		return false;
	}
	if (keyBinding.linux && typeof keyBinding.linux !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'linux'));
		return false;
	}
	if (keyBinding.win && typeof keyBinding.win !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'win'));
		return false;
	}
	return true;
}

const keybindingType = {
	type: 'object',
	default: { command: '', key: '' },
	required: ['command', 'key'],
	properties: {
		command: {
			description: nls.localize('vscode.extension.contributes.keybindings.command', 'Identifier of the command to run when keybinding is triggered.'),
			type: 'string'
		},
		args: {
			description: nls.localize('vscode.extension.contributes.keybindings.args', "Arguments to pass to the command to execute.")
		},
		key: {
			description: nls.localize('vscode.extension.contributes.keybindings.key', 'Key or key sequence (separate keys with plus-sign and sequences with space, e.g. Ctrl+O and Ctrl+L L for a chord).'),
			type: 'string'
		},
		mac: {
			description: nls.localize('vscode.extension.contributes.keybindings.mac', 'Mac specific key or key sequence.'),
			type: 'string'
		},
		linux: {
			description: nls.localize('vscode.extension.contributes.keybindings.linux', 'Linux specific key or key sequence.'),
			type: 'string'
		},
		win: {
			description: nls.localize('vscode.extension.contributes.keybindings.win', 'Windows specific key or key sequence.'),
			type: 'string'
		},
		when: {
			description: nls.localize('vscode.extension.contributes.keybindings.when', 'Condition when the key is active.'),
			type: 'string'
		},
	}
} as const satisfies IJSONSchema;

type ContributedKeyBinding = TypeFromJsonSchema<typeof keybindingType>;

const keybindingsExtPoint = ExtensionsRegistry.registerExtensionPoint<ContributedKeyBinding | ContributedKeyBinding[]>({
	extensionPoint: 'keybindings',
	deps: [commandsExtensionPoint],
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.keybindings', "Contributes keybindings."),
		oneOf: [
			keybindingType,
			{
				type: 'array',
				items: keybindingType
			}
		]
	}
});

const NUMPAD_PRINTABLE_SCANCODES = [
	ScanCode.NumpadDivide,
	ScanCode.NumpadMultiply,
	ScanCode.NumpadSubtract,
	ScanCode.NumpadAdd,
	ScanCode.Numpad1,
	ScanCode.Numpad2,
	ScanCode.Numpad3,
	ScanCode.Numpad4,
	ScanCode.Numpad5,
	ScanCode.Numpad6,
	ScanCode.Numpad7,
	ScanCode.Numpad8,
	ScanCode.Numpad9,
	ScanCode.Numpad0,
	ScanCode.NumpadDecimal
];

const otherMacNumpadMapping = new Map<ScanCode, KeyCode>();
otherMacNumpadMapping.set(ScanCode.Numpad1, KeyCode.Digit1);
otherMacNumpadMapping.set(ScanCode.Numpad2, KeyCode.Digit2);
otherMacNumpadMapping.set(ScanCode.Numpad3, KeyCode.Digit3);
otherMacNumpadMapping.set(ScanCode.Numpad4, KeyCode.Digit4);
otherMacNumpadMapping.set(ScanCode.Numpad5, KeyCode.Digit5);
otherMacNumpadMapping.set(ScanCode.Numpad6, KeyCode.Digit6);
otherMacNumpadMapping.set(ScanCode.Numpad7, KeyCode.Digit7);
otherMacNumpadMapping.set(ScanCode.Numpad8, KeyCode.Digit8);
otherMacNumpadMapping.set(ScanCode.Numpad9, KeyCode.Digit9);
otherMacNumpadMapping.set(ScanCode.Numpad0, KeyCode.Digit0);

export class WorkbenchKeybindingService extends AbstractKeybindingService {

	private _keyboardMapper: IKeyboardMapper;
	private _cachedResolver: KeybindingResolver | null;
	private userKeybindings: UserKeybindings;
	private isComposingGlobalContextKey: IContextKey<boolean>;
	private _keybindingHoldMode: DeferredPromise<void> | null;
	private readonly _contributions: Array<{
		readonly listener?: IDisposable;
		readonly contribution: KeybindingsSchemaContribution;
	}> = [];
	private readonly kbsJsonSchema: KeybindingsJsonSchema;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IHostService private readonly hostService: IHostService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
		@IKeyboardLayoutService private readonly keyboardLayoutService: IKeyboardLayoutService
	) {
		super(contextKeyService, commandService, telemetryService, notificationService, logService);

		this.isComposingGlobalContextKey = contextKeyService.createKey('isComposing', false);

		this.kbsJsonSchema = new KeybindingsJsonSchema();
		this.updateKeybindingsJsonSchema();

		this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
		this._register(this.keyboardLayoutService.onDidChangeKeyboardLayout(() => {
			this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
			this.updateResolver();
		}));

		this._keybindingHoldMode = null;
		this._cachedResolver = null;

		this.userKeybindings = this._register(new UserKeybindings(userDataProfileService, uriIdentityService, fileService, logService));
		this.userKeybindings.initialize().then(() => {
			if (this.userKeybindings.keybindings.length) {
				this.updateResolver();
			}
		});
		this._register(this.userKeybindings.onDidChange(() => {
			logService.debug('User keybindings changed');
			this.updateResolver();
		}));

		keybindingsExtPoint.setHandler((extensions) => {

			const keybindings: IExtensionKeybindingRule[] = [];
			for (const extension of extensions) {
				this._handleKeybindingsExtensionPointUser(extension.description.identifier, extension.description.isBuiltin, extension.value, extension.collector, keybindings);
			}

			KeybindingsRegistry.setExtensionKeybindings(keybindings);
			this.updateResolver();
		});

		this.updateKeybindingsJsonSchema();
		this._register(extensionService.onDidRegisterExtensions(() => this.updateKeybindingsJsonSchema()));

		this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => disposables.add(this._registerKeyListeners(window)), { window: mainWindow, disposables: this._store }));

		this._register(browser.onDidChangeFullscreen(windowId => {
			if (windowId !== mainWindow.vscodeWindowId) {
				return;
			}

			const keyboard: IKeyboard | null = (<INavigatorWithKeyboard>navigator).keyboard;

			if (BrowserFeatures.keyboard === KeyboardSupport.None) {
				return;
			}

			if (browser.isFullscreen(mainWindow)) {
				keyboard?.lock(['Escape']);
			} else {
				keyboard?.unlock();
			}

			// update resolver which will bring back all unbound keyboard shortcuts
			this._cachedResolver = null;
			this._onDidUpdateKeybindings.fire();
		}));
	}

	public override dispose(): void {
		this._contributions.forEach(c => c.listener?.dispose());
		this._contributions.length = 0;

		super.dispose();
	}

	private _registerKeyListeners(window: Window): IDisposable {
		const disposables = new DisposableStore();

		// for standard keybindings
		disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (this._keybindingHoldMode) {
				return;
			}
			this.isComposingGlobalContextKey.set(e.isComposing);
			const keyEvent = new StandardKeyboardEvent(e);
			this._log(`/ Received  keydown event - ${printKeyboardEvent(e)}`);
			this._log(`| Converted keydown event - ${printStandardKeyboardEvent(keyEvent)}`);
			const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
			}
			this.isComposingGlobalContextKey.set(false);
		}));

		// for single modifier chord keybindings (e.g. shift shift)
		disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			this._resetKeybindingHoldMode();
			this.isComposingGlobalContextKey.set(e.isComposing);
			const keyEvent = new StandardKeyboardEvent(e);
			const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
			}
			this.isComposingGlobalContextKey.set(false);
		}));

		return disposables;
	}

	public registerSchemaContribution(contribution: KeybindingsSchemaContribution): IDisposable {
		const listener = contribution.onDidChange?.(() => this.updateKeybindingsJsonSchema());
		const entry = { listener, contribution };
		this._contributions.push(entry);

		this.updateKeybindingsJsonSchema();

		return toDisposable(() => {
			listener?.dispose();
			remove(this._contributions, entry);
			this.updateKeybindingsJsonSchema();
		});
	}

	private updateKeybindingsJsonSchema() {
		this.kbsJsonSchema.updateSchema(this._contributions.flatMap(x => x.contribution.getSchemaAdditions()));
	}

	private _printKeybinding(keybinding: Keybinding): string {
		return UserSettingsLabelProvider.toLabel(OS, keybinding.chords, (chord) => {
			if (chord instanceof KeyCodeChord) {
				return KeyCodeUtils.toString(chord.keyCode);
			}
			return ScanCodeUtils.toString(chord.scanCode);
		}) || '[null]';
	}

	private _printResolvedKeybinding(resolvedKeybinding: ResolvedKeybinding): string {
		return resolvedKeybinding.getDispatchChords().map(x => x || '[null]').join(' ');
	}

	private _printResolvedKeybindings(output: string[], input: string, resolvedKeybindings: ResolvedKeybinding[]): void {
		const padLength = 35;
		const firstRow = `${input.padStart(padLength, ' ')} => `;
		if (resolvedKeybindings.length === 0) {
			// no binding found
			output.push(`${firstRow}${'[NO BINDING]'.padStart(padLength, ' ')}`);
			return;
		}

		const firstRowIndentation = firstRow.length;
		const isFirst = true;
		for (const resolvedKeybinding of resolvedKeybindings) {
			if (isFirst) {
				output.push(`${firstRow}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, ' ')}`);
			} else {
				output.push(`${' '.repeat(firstRowIndentation)}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, ' ')}`);
			}
		}
	}

	private _dumpResolveKeybindingDebugInfo(): string {

		const seenBindings = new Set<string>();
		const result: string[] = [];

		result.push(`Default Resolved Keybindings (unique only):`);
		for (const item of KeybindingsRegistry.getDefaultKeybindings()) {
			if (!item.keybinding) {
				continue;
			}
			const input = this._printKeybinding(item.keybinding);
			if (seenBindings.has(input)) {
				continue;
			}
			seenBindings.add(input);
			const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
			this._printResolvedKeybindings(result, input, resolvedKeybindings);
		}

		result.push(`User Resolved Keybindings (unique only):`);
		for (const item of this.userKeybindings.keybindings) {
			if (!item.keybinding) {
				continue;
			}
			const input = item._sourceKey ?? 'Impossible: missing source key, but has keybinding';
			if (seenBindings.has(input)) {
				continue;
			}
			seenBindings.add(input);
			const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
			this._printResolvedKeybindings(result, input, resolvedKeybindings);
		}

		return result.join('\n');
	}

	public _dumpDebugInfo(): string {
		const layoutInfo = JSON.stringify(this.keyboardLayoutService.getCurrentKeyboardLayout(), null, '\t');
		const mapperInfo = this._keyboardMapper.dumpDebugInfo();
		const resolvedKeybindings = this._dumpResolveKeybindingDebugInfo();
		const rawMapping = JSON.stringify(this.keyboardLayoutService.getRawKeyboardMapping(), null, '\t');
		return `Layout info:\n${layoutInfo}\n\n${resolvedKeybindings}\n\n${mapperInfo}\n\nRaw mapping:\n${rawMapping}`;
	}

	public _dumpDebugInfoJSON(): string {
		const info = {
			layout: this.keyboardLayoutService.getCurrentKeyboardLayout(),
			rawMapping: this.keyboardLayoutService.getRawKeyboardMapping()
		};
		return JSON.stringify(info, null, '\t');
	}

	public override enableKeybindingHoldMode(commandId: string): Promise<void> | undefined {
		if (this._currentlyDispatchingCommandId !== commandId) {
			return undefined;
		}
		this._keybindingHoldMode = new DeferredPromise<void>();
		const focusTracker = dom.trackFocus(dom.getWindow(undefined));
		const listener = focusTracker.onDidBlur(() => this._resetKeybindingHoldMode());
		this._keybindingHoldMode.p.finally(() => {
			listener.dispose();
			focusTracker.dispose();
		});
		this._log(`+ Enabled hold-mode for ${commandId}.`);
		return this._keybindingHoldMode.p;
	}

	private _resetKeybindingHoldMode(): void {
		if (this._keybindingHoldMode) {
			this._keybindingHoldMode?.complete();
			this._keybindingHoldMode = null;
		}
	}

	public override customKeybindingsCount(): number {
		return this.userKeybindings.keybindings.length;
	}

	private updateResolver(): void {
		this._cachedResolver = null;
		this._onDidUpdateKeybindings.fire();
	}

	protected _getResolver(): KeybindingResolver {
		if (!this._cachedResolver) {
			const defaults = this._resolveKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
			const overrides = this._resolveUserKeybindingItems(this.userKeybindings.keybindings, false);
			this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
		}
		return this._cachedResolver;
	}

	protected _documentHasFocus(): boolean {
		// it is possible that the document has lost focus, but the
		// window is still focused, e.g. when a <webview> element
		// has focus
		return this.hostService.hasFocus;
	}

	private _resolveKeybindingItems(items: IKeybindingItem[], isDefault: boolean): ResolvedKeybindingItem[] {
		const result: ResolvedKeybindingItem[] = [];
		let resultLen = 0;
		for (const item of items) {
			const when = item.when || undefined;
			const keybinding = item.keybinding;
			if (!keybinding) {
				// This might be a removal keybinding item in user settings => accept it
				result[resultLen++] = new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
			} else {
				if (this._assertBrowserConflicts(keybinding)) {
					continue;
				}

				const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(keybinding);
				for (let i = resolvedKeybindings.length - 1; i >= 0; i--) {
					const resolvedKeybinding = resolvedKeybindings[i];
					result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
				}
			}
		}

		return result;
	}

	private _resolveUserKeybindingItems(items: IUserKeybindingItem[], isDefault: boolean): ResolvedKeybindingItem[] {
		const result: ResolvedKeybindingItem[] = [];
		let resultLen = 0;
		for (const item of items) {
			const when = item.when || undefined;
			if (!item.keybinding) {
				// This might be a removal keybinding item in user settings => accept it
				result[resultLen++] = new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, isDefault, null, false);
			} else {
				const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
				for (const resolvedKeybinding of resolvedKeybindings) {
					result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false);
				}
			}
		}

		return result;
	}

	private _assertBrowserConflicts(keybinding: Keybinding): boolean {
		if (BrowserFeatures.keyboard === KeyboardSupport.Always) {
			return false;
		}

		if (BrowserFeatures.keyboard === KeyboardSupport.FullScreen && browser.isFullscreen(mainWindow)) {
			return false;
		}

		for (const chord of keybinding.chords) {
			if (!chord.metaKey && !chord.altKey && !chord.ctrlKey && !chord.shiftKey) {
				continue;
			}

			const modifiersMask = KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift;

			let partModifiersMask = 0;
			if (chord.metaKey) {
				partModifiersMask |= KeyMod.CtrlCmd;
			}

			if (chord.shiftKey) {
				partModifiersMask |= KeyMod.Shift;
			}

			if (chord.altKey) {
				partModifiersMask |= KeyMod.Alt;
			}

			if (chord.ctrlKey && OS === OperatingSystem.Macintosh) {
				partModifiersMask |= KeyMod.WinCtrl;
			}

			if ((partModifiersMask & modifiersMask) === (KeyMod.CtrlCmd | KeyMod.Alt)) {
				if (chord instanceof ScanCodeChord && (chord.scanCode === ScanCode.ArrowLeft || chord.scanCode === ScanCode.ArrowRight)) {
					// console.warn('Ctrl/Cmd+Arrow keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
					return true;
				}
				if (chord instanceof KeyCodeChord && (chord.keyCode === KeyCode.LeftArrow || chord.keyCode === KeyCode.RightArrow)) {
					// console.warn('Ctrl/Cmd+Arrow keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
					return true;
				}
			}

			if ((partModifiersMask & modifiersMask) === KeyMod.CtrlCmd) {
				if (chord instanceof ScanCodeChord && (chord.scanCode >= ScanCode.Digit1 && chord.scanCode <= ScanCode.Digit0)) {
					// console.warn('Ctrl/Cmd+Num keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
					return true;
				}
				if (chord instanceof KeyCodeChord && (chord.keyCode >= KeyCode.Digit0 && chord.keyCode <= KeyCode.Digit9)) {
					// console.warn('Ctrl/Cmd+Num keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
					return true;
				}
			}
		}

		return false;
	}

	public resolveKeybinding(kb: Keybinding): ResolvedKeybinding[] {
		return this._keyboardMapper.resolveKeybinding(kb);
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		this.keyboardLayoutService.validateCurrentKeyboardMapping(keyboardEvent);
		return this._keyboardMapper.resolveKeyboardEvent(keyboardEvent);
	}

	public resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
		const keybinding = KeybindingParser.parseKeybinding(userBinding);
		return (keybinding ? this._keyboardMapper.resolveKeybinding(keybinding) : []);
	}

	private _handleKeybindingsExtensionPointUser(extensionId: ExtensionIdentifier, isBuiltin: boolean, keybindings: ContributedKeyBinding | ContributedKeyBinding[], collector: ExtensionMessageCollector, result: IExtensionKeybindingRule[]): void {
		if (Array.isArray(keybindings)) {
			for (let i = 0, len = keybindings.length; i < len; i++) {
				this._handleKeybinding(extensionId, isBuiltin, i + 1, keybindings[i], collector, result);
			}
		} else {
			this._handleKeybinding(extensionId, isBuiltin, 1, keybindings, collector, result);
		}
	}

	private _handleKeybinding(extensionId: ExtensionIdentifier, isBuiltin: boolean, idx: number, keybindings: ContributedKeyBinding, collector: ExtensionMessageCollector, result: IExtensionKeybindingRule[]): void {

		const rejects: string[] = [];

		if (isValidContributedKeyBinding(keybindings, rejects)) {
			const rule = this._asCommandRule(extensionId, isBuiltin, idx++, keybindings);
			if (rule) {
				result.push(rule);
			}
		}

		if (rejects.length > 0) {
			collector.error(nls.localize(
				'invalid.keybindings',
				"Invalid `contributes.{0}`: {1}",
				keybindingsExtPoint.name,
				rejects.join('\n')
			));
		}
	}

	private static bindToCurrentPlatform(key: string | undefined, mac: string | undefined, linux: string | undefined, win: string | undefined): string | undefined {
		if (OS === OperatingSystem.Windows && win) {
			if (win) {
				return win;
			}
		} else if (OS === OperatingSystem.Macintosh) {
			if (mac) {
				return mac;
			}
		} else {
			if (linux) {
				return linux;
			}
		}
		return key;
	}

	private _asCommandRule(extensionId: ExtensionIdentifier, isBuiltin: boolean, idx: number, binding: ContributedKeyBinding): IExtensionKeybindingRule | undefined {

		const { command, args, when, key, mac, linux, win } = binding;
		const keybinding = WorkbenchKeybindingService.bindToCurrentPlatform(key, mac, linux, win);
		if (!keybinding) {
			return undefined;
		}

		let weight: number;
		if (isBuiltin) {
			weight = KeybindingWeight.BuiltinExtension + idx;
		} else {
			weight = KeybindingWeight.ExternalExtension + idx;
		}

		const commandAction = MenuRegistry.getCommand(command);
		const precondition = commandAction && commandAction.precondition;
		let fullWhen: ContextKeyExpression | undefined;
		if (when && precondition) {
			fullWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(when));
		} else if (when) {
			fullWhen = ContextKeyExpr.deserialize(when);
		} else if (precondition) {
			fullWhen = precondition;
		}

		const desc: IExtensionKeybindingRule = {
			id: command,
			args,
			when: fullWhen,
			weight: weight,
			keybinding: KeybindingParser.parseKeybinding(keybinding),
			extensionId: extensionId.value,
			isBuiltinExtension: isBuiltin
		};
		return desc;
	}

	public override getDefaultKeybindingsContent(): string {
		const resolver = this._getResolver();
		const defaultKeybindings = resolver.getDefaultKeybindings();
		const boundCommands = resolver.getDefaultBoundCommands();
		return (
			WorkbenchKeybindingService._getDefaultKeybindings(defaultKeybindings)
			+ '\n\n'
			+ WorkbenchKeybindingService._getAllCommandsAsComment(boundCommands)
		);
	}

	private static _getDefaultKeybindings(defaultKeybindings: readonly ResolvedKeybindingItem[]): string {
		const out = new OutputBuilder();
		out.writeLine('[');

		const lastIndex = defaultKeybindings.length - 1;
		defaultKeybindings.forEach((k, index) => {
			KeybindingIO.writeKeybindingItem(out, k);
			if (index !== lastIndex) {
				out.writeLine(',');
			} else {
				out.writeLine();
			}
		});
		out.writeLine(']');
		return out.toString();
	}

	private static _getAllCommandsAsComment(boundCommands: Map<string, boolean>): string {
		const unboundCommands = getAllUnboundCommands(boundCommands);
		const pretty = unboundCommands.sort().join('\n// - ');
		return '// ' + nls.localize('unboundCommands', "Here are other available commands: ") + '\n// - ' + pretty;
	}

	override mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		if (event.ctrlKey || event.metaKey || event.altKey) {
			// ignore ctrl/cmd/alt-combination but not shift-combinatios
			return false;
		}
		const code = ScanCodeUtils.toEnum(event.code);

		if (NUMPAD_PRINTABLE_SCANCODES.indexOf(code) !== -1) {
			// This is a numpad key that might produce a printable character based on NumLock.
			// Let's check if NumLock is on or off based on the event's keyCode.
			// e.g.
			// - when NumLock is off, ScanCode.Numpad4 produces KeyCode.LeftArrow
			// - when NumLock is on, ScanCode.Numpad4 produces KeyCode.NUMPAD_4
			// However, ScanCode.NumpadAdd always produces KeyCode.NUMPAD_ADD
			if (event.keyCode === IMMUTABLE_CODE_TO_KEY_CODE[code]) {
				// NumLock is on or this is /, *, -, + on the numpad
				return true;
			}
			if (isMacintosh && event.keyCode === otherMacNumpadMapping.get(code)) {
				// on macOS, the numpad keys can also map to keys 1 - 0.
				return true;
			}
			return false;
		}

		const keycode = IMMUTABLE_CODE_TO_KEY_CODE[code];
		if (keycode !== -1) {
			// https://github.com/microsoft/vscode/issues/74934
			return false;
		}
		// consult the KeyboardMapperFactory to check the given event for
		// a printable value.
		const mapping = this.keyboardLayoutService.getRawKeyboardMapping();
		if (!mapping) {
			return false;
		}
		const keyInfo = mapping[event.code];
		if (!keyInfo) {
			return false;
		}
		if (!keyInfo.value || /\s/.test(keyInfo.value)) {
			return false;
		}
		return true;
	}
}

class UserKeybindings extends Disposable {

	private _rawKeybindings: Object[] = [];
	private _keybindings: IUserKeybindingItem[] = [];
	get keybindings(): IUserKeybindingItem[] { return this._keybindings; }

	private readonly reloadConfigurationScheduler: RunOnceScheduler;

	private readonly watchDisposables = this._register(new DisposableStore());

	private readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly userDataProfileService: IUserDataProfileService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly fileService: IFileService,
		logService: ILogService,
	) {
		super();

		this.watch();

		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(changed => {
			if (changed) {
				this._onDidChange.fire();
			}
		}), 50));

		this._register(Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.userDataProfileService.currentProfile.keybindingsResource))(() => {
			logService.debug('Keybindings file changed');
			this.reloadConfigurationScheduler.schedule();
		}));

		this._register(this.fileService.onDidRunOperation((e) => {
			if (e.operation === FileOperation.WRITE && e.resource.toString() === this.userDataProfileService.currentProfile.keybindingsResource.toString()) {
				logService.debug('Keybindings file written');
				this.reloadConfigurationScheduler.schedule();
			}
		}));

		this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
			if (!this.uriIdentityService.extUri.isEqual(e.previous.keybindingsResource, e.profile.keybindingsResource)) {
				e.join(this.whenCurrentProfileChanged());
			}
		}));
	}

	private async whenCurrentProfileChanged(): Promise<void> {
		this.watch();
		this.reloadConfigurationScheduler.schedule();
	}

	private watch(): void {
		this.watchDisposables.clear();
		this.watchDisposables.add(this.fileService.watch(dirname(this.userDataProfileService.currentProfile.keybindingsResource)));
		// Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
		this.watchDisposables.add(this.fileService.watch(this.userDataProfileService.currentProfile.keybindingsResource));
	}

	async initialize(): Promise<void> {
		await this.reload();
	}

	private async reload(): Promise<boolean> {
		const newKeybindings = await this.readUserKeybindings();
		if (objects.equals(this._rawKeybindings, newKeybindings)) {
			// no change
			return false;
		}

		this._rawKeybindings = newKeybindings;
		this._keybindings = this._rawKeybindings.map((k) => KeybindingIO.readUserKeybindingItem(k));
		return true;
	}

	private async readUserKeybindings(): Promise<Object[]> {
		try {
			const content = await this.fileService.readFile(this.userDataProfileService.currentProfile.keybindingsResource);
			const value = parse(content.value.toString());
			return Array.isArray(value)
				? value.filter(v => v && typeof v === 'object' /* just typeof === object doesn't catch `null` */)
				: [];
		} catch (e) {
			return [];
		}
	}
}

/**
 * Registers the `keybindings.json`'s schema with the JSON schema registry. Allows updating the schema, e.g., when new commands are registered (e.g., by extensions).
 *
 * Lifecycle owned by `WorkbenchKeybindingService`. Must be instantiated only once.
 */
class KeybindingsJsonSchema {

	private static readonly schemaId = 'vscode://schemas/keybindings';

	private readonly commandsSchemas: IJSONSchema[] = [];
	private readonly commandsEnum: string[] = [];
	private readonly removalCommandsEnum: string[] = [];
	private readonly commandsEnumDescriptions: string[] = [];
	private readonly schema: IJSONSchema = {
		id: KeybindingsJsonSchema.schemaId,
		type: 'array',
		title: nls.localize('keybindings.json.title', "Keybindings configuration"),
		allowTrailingCommas: true,
		allowComments: true,
		definitions: {
			'editorGroupsSchema': {
				'type': 'array',
				'items': {
					'type': 'object',
					'properties': {
						'groups': {
							'$ref': '#/definitions/editorGroupsSchema',
							'default': [{}, {}]
						},
						'size': {
							'type': 'number',
							'default': 0.5
						}
					}
				}
			},
			'commandNames': {
				'type': 'string',
				'enum': this.commandsEnum,
				'enumDescriptions': this.commandsEnumDescriptions,
				'description': nls.localize('keybindings.json.command', "Name of the command to execute"),
			},
			'commandType': {
				'anyOf': [ // repetition of this clause here and below is intentional: one is for nice diagnostics & one is for code completion
					{
						$ref: '#/definitions/commandNames'
					},
					{
						'type': 'string',
						'enum': this.removalCommandsEnum,
						'enumDescriptions': this.commandsEnumDescriptions,
						'description': nls.localize('keybindings.json.removalCommand', "Name of the command to remove keyboard shortcut for"),
					},
					{
						'type': 'string'
					},
				]
			},
			'commandsSchemas': {
				'allOf': this.commandsSchemas
			}
		},
		items: {
			'required': ['key'],
			'type': 'object',
			'defaultSnippets': [{ 'body': { 'key': '$1', 'command': '$2', 'when': '$3' } }],
			'properties': {
				'key': {
					'type': 'string',
					'description': nls.localize('keybindings.json.key', "Key or key sequence (separated by space)"),
				},
				'command': {
					'anyOf': [
						{
							'if': {
								'type': 'array'
							},
							'then': {
								'not': {
									'type': 'array'
								},
								'errorMessage': nls.localize('keybindings.commandsIsArray', "Incorrect type. Expected \"{0}\". The field 'command' does not support running multiple commands. Use command 'runCommands' to pass it multiple commands to run.", 'string')
							},
							'else': {
								'$ref': '#/definitions/commandType'
							}
						},
						{
							'$ref': '#/definitions/commandType'
						}
					]
				},
				'when': {
					'type': 'string',
					'description': nls.localize('keybindings.json.when', "Condition when the key is active.")
				},
				'args': {
					'description': nls.localize('keybindings.json.args', "Arguments to pass to the command to execute.")
				}
			},
			'$ref': '#/definitions/commandsSchemas'
		}
	};

	private readonly schemaRegistry = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution);

	constructor() {
		this.schemaRegistry.registerSchema(KeybindingsJsonSchema.schemaId, this.schema);
	}

	// TODO@ulugbekna: can updates happen incrementally rather than rebuilding; concerns:
	// - is just appending additional schemas enough for the registry to pick them up?
	// - can `CommandsRegistry.getCommands` and `MenuRegistry.getCommands` return different values at different times? ie would just pushing new schemas from `additionalContributions` not be enough?
	updateSchema(additionalContributions: readonly IJSONSchema[]) {
		this.commandsSchemas.length = 0;
		this.commandsEnum.length = 0;
		this.removalCommandsEnum.length = 0;
		this.commandsEnumDescriptions.length = 0;

		const knownCommands = new Set<string>();
		const addKnownCommand = (commandId: string, description?: string | ILocalizedString | undefined) => {
			if (!/^_/.test(commandId)) {
				if (!knownCommands.has(commandId)) {
					knownCommands.add(commandId);

					this.commandsEnum.push(commandId);
					this.commandsEnumDescriptions.push(
						description === undefined
							? '' // `enumDescriptions` is an array of strings, so we can't use undefined
							: (isLocalizedString(description) ? description.value : description)
					);

					// Also add the negative form for keybinding removal
					this.removalCommandsEnum.push(`-${commandId}`);
				}
			}
		};

		const allCommands = CommandsRegistry.getCommands();
		for (const [commandId, command] of allCommands) {
			const commandMetadata = command.metadata;

			addKnownCommand(commandId, commandMetadata?.description ?? MenuRegistry.getCommand(commandId)?.title);

			if (!commandMetadata || !commandMetadata.args || commandMetadata.args.length !== 1 || !commandMetadata.args[0].schema) {
				continue;
			}

			const argsSchema = commandMetadata.args[0].schema;
			const argsRequired = (
				(typeof commandMetadata.args[0].isOptional !== 'undefined')
					? (!commandMetadata.args[0].isOptional)
					: (Array.isArray(argsSchema.required) && argsSchema.required.length > 0)
			);
			const addition = {
				'if': {
					'required': ['command'],
					'properties': {
						'command': { 'const': commandId }
					}
				},
				'then': {
					'required': (<string[]>[]).concat(argsRequired ? ['args'] : []),
					'properties': {
						'args': argsSchema
					}
				}
			};

			this.commandsSchemas.push(addition);
		}

		const menuCommands = MenuRegistry.getCommands();
		for (const commandId of menuCommands.keys()) {
			addKnownCommand(commandId);
		}

		this.commandsSchemas.push(...additionalContributions);
		this.schemaRegistry.notifySchemaChanged(KeybindingsJsonSchema.schemaId);
	}
}

registerSingleton(IKeybindingService, WorkbenchKeybindingService, InstantiationType.Eager);
