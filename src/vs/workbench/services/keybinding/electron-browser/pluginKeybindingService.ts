/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {IEventService} from 'vs/platform/event/common/event';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingItem, IUserFriendlyKeybinding, ICommandHandler} from 'vs/platform/keybinding/common/keybindingService';
import {PluginsRegistry, IMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import {IPluginService, IPluginDescription, IPointListener, IActivationEventListener} from 'vs/platform/plugins/common/plugins';
import {IOSupport} from 'vs/platform/keybinding/common/commonKeybindingResolver';
import {WorkbenchKeybindingService} from 'vs/workbench/services/keybinding/browser/keybindingService';
import {ICommandDescriptor, ICommandRule, KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {KeyCode, Keybinding, IKeyBindingLabelProvider, MacUIKeyLabelProvider, ClassicUIKeyLabelProvider} from 'vs/base/common/keyCodes';
import * as nativeKeymap from 'native-keymap';
import Platform = require('vs/base/common/platform');
import {IHTMLContentElement} from 'vs/base/common/htmlContent';

interface ContributedKeyBinding {
	command: string;
	key: string;
	when?: string;
	mac?: string;
	linux?: string;
	win?: string;
}

function isContributedKeyBindingsArray(thing: ContributedKeyBinding|ContributedKeyBinding[]): thing is ContributedKeyBinding[] {
	return Array.isArray(thing);
}

function isValidContributedKeyBinding(keyBinding: ContributedKeyBinding, rejects: string[]): boolean {
	if (!keyBinding) {
		rejects.push(nls.localize('nonempty', "expected non-empty value."));
		return false;
	}
	if (typeof keyBinding.command !== 'string') {
		rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'))
		return false;
	}
	if (typeof keyBinding.key !== 'string') {
		rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'key'))
		return false;
	}
	if (keyBinding.when && typeof keyBinding.when !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'))
		return false;
	}
	if (keyBinding.mac && typeof keyBinding.mac !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'mac'))
		return false;
	}
	if (keyBinding.linux && typeof keyBinding.linux !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'linux'))
		return false;
	}
	if (keyBinding.win && typeof keyBinding.win !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'win'))
		return false;
	}
	return true;
}

let keybindingType:IJSONSchema = {
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

let keybindingsExtPoint = PluginsRegistry.registerExtensionPoint<ContributedKeyBinding | ContributedKeyBinding[]>('keybindings', {
	description: nls.localize('vscode.extension.contributes.keybindings', "Contributes keybindings."),
	oneOf: [
		keybindingType,
		{
			type: 'array',
			items: keybindingType
		}
	]
});

export default class PluginWorkbenchKeybindingService extends WorkbenchKeybindingService {

	private _pluginService: IPluginService;
	private _eventService: IEventService;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService, telemetryService: ITelemetryService, domNode: HTMLElement) {
		super(contextService, eventService, telemetryService, domNode);
		this._eventService = eventService;
		keybindingsExtPoint.setHandler((extensions) => {
			let commandAdded = false;

			for (let extension of extensions) {
				commandAdded = this._handleKeybindingsExtensionPointUser(extension.description.isBuiltin, extension.value, extension.collector) || commandAdded;
			}

			if (commandAdded) {
				this.updateResolver();
			}
		});
	}

	setPluginService(pluginService: IPluginService): void {
		this._pluginService = pluginService;
	}

	public getLabelFor(keybinding:Keybinding): string {
		this._ensureNativeKeymap();
		return keybinding.toCustomLabel(this._nativeLabelProvider);
	}

	public getHTMLLabelFor(keybinding:Keybinding): IHTMLContentElement[] {
		this._ensureNativeKeymap();
		return keybinding.toCustomHTMLLabel(this._nativeLabelProvider);
	}

	private _handleKeybindingsExtensionPointUser(isBuiltin: boolean, keybindings:ContributedKeyBinding | ContributedKeyBinding[], collector:IMessageCollector): boolean {
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

	private _handleKeybinding(isBuiltin: boolean, idx:number, keybindings:ContributedKeyBinding, collector:IMessageCollector): boolean {

		let rejects: string[] = [];
		let commandAdded = false;

		if (isValidContributedKeyBinding(keybindings, rejects)) {
			let rule = this._asCommandRule(isBuiltin, idx++, keybindings);
			if (rule) {
				KeybindingsRegistry.registerCommandRule(rule);
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

	protected _invokeHandler(commandId: string, args: any): TPromise<any> {
		return this._pluginService.activateByEvent('onCommand:' + commandId).then(_ => {
			return super._invokeHandler(commandId, args);
		});
	}

	private _asCommandRule(isBuiltin: boolean, idx:number, binding: ContributedKeyBinding): ICommandRule {

		let {command, when, key, mac, linux, win} = binding;

		let weight: number;
		if (isBuiltin) {
			weight = KeybindingsRegistry.WEIGHT.builtinExtension(idx);
		} else {
			weight = KeybindingsRegistry.WEIGHT.externalExtension(idx);
		}

		let desc = {
			id: command,
			context: IOSupport.readKeybindingContexts(when),
			weight: weight,
			primary: IOSupport.readKeybinding(key),
			mac: mac && { primary: IOSupport.readKeybinding(mac) },
			linux: linux && { primary: IOSupport.readKeybinding(linux) },
			win: win && { primary: IOSupport.readKeybinding(win) }
		}

		if (!desc.primary && !desc.mac && !desc.linux && !desc.win) {
			return;
		}

		return desc;
	}

	private _gotNativeKeymap = false;
	private _nativeLabelProvider:IKeyBindingLabelProvider = null;
	private _ensureNativeKeymap(): void {
		if (this._gotNativeKeymap) {
			return;
		}
		this._gotNativeKeymap = true;

		// See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
		// See https://github.com/alexandrudima/vscode-keyboard/blob/master/deps/chromium/keyboard_codes_win.h
		let interestingKeyCodes:{[vkeyCode:string]:KeyCode;} = {
			VKEY_OEM_1:			KeyCode.US_SEMICOLON,				//  (0xBA) as ;
			VKEY_OEM_PLUS:		KeyCode.US_EQUAL,					//  (0xBB) as =
			VKEY_OEM_COMMA:		KeyCode.US_COMMA,					//  (0xBC) as ,
			VKEY_OEM_MINUS:		KeyCode.US_MINUS,					//  (0xBD) as -
			VKEY_OEM_PERIOD:	KeyCode.US_DOT,						//  (0xBE) as .
			VKEY_OEM_2:			KeyCode.US_SLASH,					//  (0xBF) as /
			VKEY_OEM_3:			KeyCode.US_BACKTICK,				//  (0xC0) as `
			VKEY_OEM_4:			KeyCode.US_OPEN_SQUARE_BRACKET,		//  (0xDB) as [
			VKEY_OEM_5:			KeyCode.US_BACKSLASH,				//  (0xDC) as \
			VKEY_OEM_6:			KeyCode.US_CLOSE_SQUARE_BRACKET,	//  (0xDD) as ]
			VKEY_OEM_7:			KeyCode.US_QUOTE,					//  (0xDE) as '
		};

		let remaps:string[] = [];
		for (let i = 0, len = KeyCode.MAX_VALUE; i < len; i++) {
			remaps[i] = null;
		}

		let nativeMappings = nativeKeymap.getKeyMap();
		let hadRemap = false;
		for (let i = 0, len = nativeMappings.length; i < len; i++) {
			let nativeMapping = nativeMappings[i];

			if (interestingKeyCodes[nativeMapping.key_code]) {
				let newValue = nativeMapping.value || nativeMapping.withShift;
				if (newValue.length > 0) {
					hadRemap = true;
					remaps[interestingKeyCodes[nativeMapping.key_code]] = newValue;
				} else {
					console.warn('invalid remap for ', nativeMapping);
				}
			}
		}

		if (hadRemap) {
			for (let interestingKeyCode in interestingKeyCodes) {
				if (interestingKeyCodes.hasOwnProperty(interestingKeyCode)) {
					let keyCode = interestingKeyCodes[interestingKeyCode];
					remaps[keyCode] = remaps[keyCode] || '';
				}
			}
		}

		if (Platform.isMacintosh) {
			this._nativeLabelProvider = new NativeMacUIKeyLabelProvider(remaps)
		} else {
			this._nativeLabelProvider = new NativeClassicUIKeyLabelProvider(remaps);
		}
	}
}

class NativeMacUIKeyLabelProvider extends MacUIKeyLabelProvider {
	constructor(private remaps:string[]) {
		super();
	}

	public getLabelForKey(keyCode:KeyCode): string {
		if (this.remaps[keyCode] !== null) {
			return this.remaps[keyCode];
		}
		return super.getLabelForKey(keyCode);
	}
}

class NativeClassicUIKeyLabelProvider extends ClassicUIKeyLabelProvider {
	constructor(private remaps:string[]) {
		super();
	}

	public getLabelForKey(keyCode:KeyCode): string {
		if (this.remaps[keyCode] !== null) {
			return this.remaps[keyCode];
		}
		return super.getLabelForKey(keyCode);
	}
}
