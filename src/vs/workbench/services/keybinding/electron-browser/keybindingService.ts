/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ResolvedKeybinding, KeyCode, USER_SETTINGS, Keybinding, KeybindingType, SimpleKeybinding, KeyCodeUtils } from 'vs/base/common/keyCodes';
import { UILabelProvider, AriaLabelProvider, UserSettingsLabelProvider, ElectronAcceleratorLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { Extensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingEvent, IUserFriendlyKeybinding, KeybindingSource, IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingRule, IKeybindingItem, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { keybindingsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { getCurrentKeyboardLayout, getNativeLabelProviderRemaps } from 'vs/workbench/services/keybinding/electron-browser/nativeKeymap';
import { IMessageService } from 'vs/platform/message/common/message';
import { ConfigWatcher } from 'vs/base/node/config';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { KeybindingIO, OutputBuilder } from 'vs/workbench/services/keybinding/common/keybindingIO';

interface ContributedKeyBinding {
	command: string;
	key: string;
	when?: string;
	mac?: string;
	linux?: string;
	win?: string;
}

function isContributedKeyBindingsArray(thing: ContributedKeyBinding | ContributedKeyBinding[]): thing is ContributedKeyBinding[] {
	return Array.isArray(thing);
}

function isValidContributedKeyBinding(keyBinding: ContributedKeyBinding, rejects: string[]): boolean {
	if (!keyBinding) {
		rejects.push(nls.localize('nonempty', "expected non-empty value."));
		return false;
	}
	if (typeof keyBinding.command !== 'string') {
		rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
		return false;
	}
	if (typeof keyBinding.key !== 'string') {
		rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'key'));
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

let keybindingType: IJSONSchema = {
	type: 'object',
	default: { command: '', key: '' },
	properties: {
		command: {
			description: nls.localize('vscode.extension.contributes.keybindings.command', 'Identifier of the command to run when keybinding is triggered.'),
			type: 'string'
		},
		key: {
			description: nls.localize('vscode.extension.contributes.keybindings.key', 'Key or key sequence (separate keys with plus-sign and sequences with space, e.g Ctrl+O and Ctrl+L L for a chord'),
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
		}
	}
};

let keybindingsExtPoint = ExtensionsRegistry.registerExtensionPoint<ContributedKeyBinding | ContributedKeyBinding[]>('keybindings', [], {
	description: nls.localize('vscode.extension.contributes.keybindings', "Contributes keybindings."),
	oneOf: [
		keybindingType,
		{
			type: 'array',
			items: keybindingType
		}
	]
});

export class FancyResolvedKeybinding extends ResolvedKeybinding {

	private readonly _firstPart: SimpleKeybinding;
	private readonly _chordPart: SimpleKeybinding;

	constructor(actual: Keybinding) {
		super();
		if (actual === null) {
			this._firstPart = null;
			this._chordPart = null;
		} else if (actual.type === KeybindingType.Chord) {
			this._firstPart = actual.firstPart;
			this._chordPart = actual.chordPart;
		} else {
			this._firstPart = actual;
			this._chordPart = null;
		}
	}

	private _keyCodeToUILabel(keyCode: KeyCode): string {
		if (OS === OperatingSystem.Macintosh) {
			switch (keyCode) {
				case KeyCode.LeftArrow:
					return '←';
				case KeyCode.UpArrow:
					return '↑';
				case KeyCode.RightArrow:
					return '→';
				case KeyCode.DownArrow:
					return '↓';
			}
		}
		let remaps = getNativeLabelProviderRemaps();
		if (remaps[keyCode] !== null) {
			return remaps[keyCode].render();
		}

		return KeyCodeUtils.toString(keyCode);
	}

	public getLabel(): string {
		let firstPart = this._firstPart ? this._keyCodeToUILabel(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? this._keyCodeToUILabel(this._chordPart.keyCode) : null;
		return UILabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OS);
	}

	private _keyCodeToAriaLabel(keyCode: KeyCode): string {
		let remaps = getNativeLabelProviderRemaps();
		if (remaps[keyCode] !== null) {
			return remaps[keyCode].render();
		}
		return KeyCodeUtils.toString(keyCode);
	}

	public getAriaLabel(): string {
		let firstPart = this._firstPart ? this._keyCodeToAriaLabel(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? this._keyCodeToAriaLabel(this._chordPart.keyCode) : null;
		return AriaLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OS);
	}

	public getHTMLLabel(): IHTMLContentElement[] {
		let firstPart = this._firstPart ? this._keyCodeToUILabel(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? this._keyCodeToUILabel(this._chordPart.keyCode) : null;
		return UILabelProvider.toHTMLLabel(this._firstPart, firstPart, this._chordPart, chordPart, OS);
	}

	private _keyCodeToElectronAccelerator(keyCode: KeyCode): string {
		if (keyCode >= KeyCode.NUMPAD_0 && keyCode <= KeyCode.NUMPAD_DIVIDE) {
			// Electron cannot handle numpad keys
			return null;
		}

		switch (keyCode) {
			case KeyCode.UpArrow:
				return 'Up';
			case KeyCode.DownArrow:
				return 'Down';
			case KeyCode.LeftArrow:
				return 'Left';
			case KeyCode.RightArrow:
				return 'Right';
		}

		let remaps = getNativeLabelProviderRemaps();

		if (remaps[keyCode] === null) {
			return KeyCodeUtils.toString(keyCode);
		}

		let remapped = remaps[keyCode].render();
		if (OS === OperatingSystem.Windows) {
			// electron menus always do the correct rendering on Windows
			return remapped;
		} else {
			// electron menus are incorrect in rendering (linux) and in rendering and interpreting (mac)
			// for non US standard keyboard layouts
			if (remapped !== KeyCodeUtils.toString(keyCode)) {
				return null;
			}
			return remapped;
		}
	}

	public getElectronAccelerator(): string {
		if (this._chordPart !== null) {
			// Electron cannot handle chords
			return null;
		}

		let firstPart = this._firstPart ? this._keyCodeToElectronAccelerator(this._firstPart.keyCode) : null;
		return ElectronAcceleratorLabelProvider.toLabel(this._firstPart, firstPart, null, null, OS);
	}

	public getUserSettingsLabel(): string {
		let firstPart = this._firstPart ? USER_SETTINGS.fromKeyCode(this._firstPart.keyCode) : null;
		let chordPart = this._chordPart ? USER_SETTINGS.fromKeyCode(this._chordPart.keyCode) : null;
		let result = UserSettingsLabelProvider.toLabel(this._firstPart, firstPart, this._chordPart, chordPart, OS);
		return result.toLowerCase();
	}

	public isChord(): boolean {
		return (this._chordPart ? true : false);
	}

	public hasCtrlModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.ctrlKey;
	}

	public hasShiftModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.shiftKey;
	}

	public hasAltModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.altKey;
	}

	public hasMetaModifier(): boolean {
		if (this._chordPart) {
			return false;
		}
		return this._firstPart.metaKey;
	}

	public getDispatchParts(): [string, string] {
		let firstPart = this._firstPart ? this._getDispatchStr(this._firstPart) : null;
		let chordPart = this._chordPart ? this._getDispatchStr(this._chordPart) : null;
		return [firstPart, chordPart];
	}

	private _getDispatchStr(keybinding: SimpleKeybinding): string {
		if (keybinding.isModifierKey()) {
			return null;
		}
		let result = '';

		if (keybinding.ctrlKey) {
			result += 'ctrl+';
		}
		if (keybinding.shiftKey) {
			result += 'shift+';
		}
		if (keybinding.altKey) {
			result += 'alt+';
		}
		if (keybinding.metaKey) {
			result += 'meta+';
		}
		result += KeyCodeUtils.toString(keybinding.keyCode);

		return result;
	}
}

export class WorkbenchKeybindingService extends AbstractKeybindingService {

	private _cachedResolver: KeybindingResolver;
	private _firstTimeComputingResolver: boolean;
	private userKeybindings: ConfigWatcher<IUserFriendlyKeybinding[]>;

	constructor(
		windowElement: Window,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStatusbarService statusBarService: IStatusbarService
	) {
		super(contextKeyService, commandService, messageService, statusBarService);

		this._cachedResolver = null;
		this._firstTimeComputingResolver = true;

		this.userKeybindings = new ConfigWatcher(environmentService.appKeybindingsPath, { defaultConfig: [] });
		this.toDispose.push(toDisposable(() => this.userKeybindings.dispose()));

		keybindingsExtPoint.setHandler((extensions) => {
			let commandAdded = false;

			for (let extension of extensions) {
				commandAdded = this._handleKeybindingsExtensionPointUser(extension.description.isBuiltin, extension.value, extension.collector) || commandAdded;
			}

			if (commandAdded) {
				this.updateResolver({ source: KeybindingSource.Default });
			}
		});

		this.toDispose.push(this.userKeybindings.onDidUpdateConfiguration(event => this.updateResolver({
			source: KeybindingSource.User,
			keybindings: event.config
		})));

		this.toDispose.push(dom.addDisposableListener(windowElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let keyEvent = new StandardKeyboardEvent(e);
			let shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
			}
		}));

		keybindingsTelemetry(telemetryService, this);
		let data = getCurrentKeyboardLayout();
		telemetryService.publicLog('keyboardLayout', {
			currentKeyboardLayout: data
		});
	}

	private _safeGetConfig(): IUserFriendlyKeybinding[] {
		let rawConfig = this.userKeybindings.getConfig();
		if (Array.isArray(rawConfig)) {
			return rawConfig;
		}
		return [];
	}

	public customKeybindingsCount(): number {
		let userKeybindings = this._safeGetConfig();

		return userKeybindings.length;
	}

	private updateResolver(event: IKeybindingEvent): void {
		this._cachedResolver = null;
		this._onDidUpdateKeybindings.fire(event);
	}

	protected _getResolver(): KeybindingResolver {
		if (!this._cachedResolver) {
			const defaults = this._toNormalizedKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
			const overrides = this._toNormalizedKeybindingItems(this._getExtraKeybindings(this._firstTimeComputingResolver), false);
			this._cachedResolver = new KeybindingResolver(defaults, overrides);
			this._firstTimeComputingResolver = false;
		}
		return this._cachedResolver;
	}

	private _toNormalizedKeybindingItems(items: IKeybindingItem[], isDefault: boolean): ResolvedKeybindingItem[] {
		let result: ResolvedKeybindingItem[] = [], resultLen = 0;
		for (let i = 0, len = items.length; i < len; i++) {
			const item = items[i];
			const when = (item.when ? item.when.normalize() : null);
			const keybinding = item.keybinding;
			if (!keybinding) {
				// This might be a removal keybinding item in user settings => accept it
				result[resultLen++] = new ResolvedKeybindingItem(null, item.command, item.commandArgs, when, isDefault);
			} else {
				const resolvedKeybindings = this.resolveKeybinding(keybinding);
				for (let j = 0; j < resolvedKeybindings.length; j++) {
					result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybindings[j], item.command, item.commandArgs, when, isDefault);
				}
			}
		}

		return result;
	}

	private _getExtraKeybindings(isFirstTime: boolean): IKeybindingItem[] {
		let extraUserKeybindings: IUserFriendlyKeybinding[] = this._safeGetConfig();
		if (!isFirstTime) {
			let cnt = extraUserKeybindings.length;

			this.telemetryService.publicLog('customKeybindingsChanged', {
				keyCount: cnt
			});
		}

		return extraUserKeybindings.map((k, i) => KeybindingIO.readKeybindingItem(k, i, OS));
	}

	public resolveKeybinding(kb: Keybinding): ResolvedKeybinding[] {
		return [new FancyResolvedKeybinding(kb)];
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		let keybinding = new SimpleKeybinding(
			keyboardEvent.ctrlKey,
			keyboardEvent.shiftKey,
			keyboardEvent.altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		);
		return this.resolveKeybinding(keybinding)[0];
	}

	private _handleKeybindingsExtensionPointUser(isBuiltin: boolean, keybindings: ContributedKeyBinding | ContributedKeyBinding[], collector: ExtensionMessageCollector): boolean {
		if (isContributedKeyBindingsArray(keybindings)) {
			let commandAdded = false;
			for (let i = 0, len = keybindings.length; i < len; i++) {
				commandAdded = this._handleKeybinding(isBuiltin, i + 1, keybindings[i], collector) || commandAdded;
			}
			return commandAdded;
		} else {
			return this._handleKeybinding(isBuiltin, 1, keybindings, collector);
		}
	}

	private _handleKeybinding(isBuiltin: boolean, idx: number, keybindings: ContributedKeyBinding, collector: ExtensionMessageCollector): boolean {

		let rejects: string[] = [];
		let commandAdded = false;

		if (isValidContributedKeyBinding(keybindings, rejects)) {
			let rule = this._asCommandRule(isBuiltin, idx++, keybindings);
			if (rule) {
				KeybindingsRegistry.registerKeybindingRule(rule);
				commandAdded = true;
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

		return commandAdded;
	}

	private _asCommandRule(isBuiltin: boolean, idx: number, binding: ContributedKeyBinding): IKeybindingRule {

		let {command, when, key, mac, linux, win} = binding;

		let weight: number;
		if (isBuiltin) {
			weight = KeybindingsRegistry.WEIGHT.builtinExtension(idx);
		} else {
			weight = KeybindingsRegistry.WEIGHT.externalExtension(idx);
		}

		let desc = {
			id: command,
			when: ContextKeyExpr.deserialize(when),
			weight: weight,
			primary: KeybindingIO.readKeybinding(key, OS),
			mac: mac && { primary: KeybindingIO.readKeybinding(mac, OS) },
			linux: linux && { primary: KeybindingIO.readKeybinding(linux, OS) },
			win: win && { primary: KeybindingIO.readKeybinding(win, OS) }
		};

		if (!desc.primary && !desc.mac && !desc.linux && !desc.win) {
			return undefined;
		}

		return desc;
	}

	public getDefaultKeybindings(): string {
		const resolver = this._getResolver();
		const defaultKeybindings = resolver.getDefaultKeybindings();
		const boundCommands = resolver.getDefaultBoundCommands();
		return (
			WorkbenchKeybindingService._getDefaultKeybindings(defaultKeybindings)
			+ '\n\n'
			+ WorkbenchKeybindingService._getAllCommandsAsComment(boundCommands)
		);
	}

	private static _getDefaultKeybindings(defaultKeybindings: ResolvedKeybindingItem[]): string {
		let out = new OutputBuilder();
		out.writeLine('[');

		let lastIndex = defaultKeybindings.length - 1;
		defaultKeybindings.forEach((k, index) => {
			KeybindingIO.writeKeybindingItem(out, k, OS);
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
		const unboundCommands = KeybindingResolver.getAllUnboundCommands(boundCommands);
		let pretty = unboundCommands.sort().join('\n// - ');
		return '// ' + nls.localize('unboundCommands', "Here are other available commands: ") + '\n// - ' + pretty;
	}
}

let schemaId = 'vscode://schemas/keybindings';
let schema: IJSONSchema = {
	'id': schemaId,
	'type': 'array',
	'title': nls.localize('keybindings.json.title', "Keybindings configuration"),
	'items': {
		'required': ['key'],
		'type': 'object',
		'defaultSnippets': [{ 'body': { 'key': '$1', 'command': '$2', 'when': '$3' } }],
		'properties': {
			'key': {
				'type': 'string',
				'description': nls.localize('keybindings.json.key', "Key or key sequence (separated by space)"),
			},
			'command': {
				'description': nls.localize('keybindings.json.command', "Name of the command to execute"),
			},
			'when': {
				'type': 'string',
				'description': nls.localize('keybindings.json.when', "Condition when the key is active.")
			},
			'args': {
				'description': nls.localize('keybindings.json.args', "Arguments to pass to the command to execute.")
			}
		}
	}
};

let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
