/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Keybinding } from 'vs/base/common/keyCodes';
import { KeybindingLabels } from 'vs/base/common/keybinding';
import * as platform from 'vs/base/common/platform';
import { toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { Extensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { KeybindingResolver, IOSupport } from 'vs/platform/keybinding/common/keybindingResolver';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingEvent, IKeybindingItem, IUserFriendlyKeybinding, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingRule, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { keybindingsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { getNativeLabelProvider, getNativeAriaLabelProvider } from 'vs/workbench/services/keybinding/electron-browser/nativeKeymap';
import { IMessageService } from 'vs/platform/message/common/message';
import { ConfigWatcher } from 'vs/base/node/config';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';

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
			let shouldPreventDefault = this._dispatch(keyEvent.toKeybinding(), keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
			}
		}));

		keybindingsTelemetry(telemetryService, this);
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
			this._cachedResolver = new KeybindingResolver(KeybindingsRegistry.getDefaultKeybindings(), this._getExtraKeybindings(this._firstTimeComputingResolver));
			this._firstTimeComputingResolver = false;
		}
		return this._cachedResolver;
	}

	private _getExtraKeybindings(isFirstTime: boolean): IKeybindingItem[] {
		let extraUserKeybindings: IUserFriendlyKeybinding[] = this._safeGetConfig();
		if (!isFirstTime) {
			let cnt = extraUserKeybindings.length;

			this.telemetryService.publicLog('customKeybindingsChanged', {
				keyCount: cnt
			});
		}

		return extraUserKeybindings.map((k, i) => IOSupport.readKeybindingItem(k, i));
	}

	public getLabelFor(keybinding: Keybinding): string {
		return KeybindingLabels.toCustomLabel(keybinding, getNativeLabelProvider());
	}

	public getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[] {
		return KeybindingLabels.toCustomHTMLLabel(keybinding, getNativeLabelProvider());
	}

	public getAriaLabelFor(keybinding: Keybinding): string {
		return KeybindingLabels.toCustomLabel(keybinding, getNativeAriaLabelProvider());
	}

	public getElectronAcceleratorFor(keybinding: Keybinding): string {
		if (platform.isWindows) {
			// electron menus always do the correct rendering on Windows
			return super.getElectronAcceleratorFor(keybinding);
		}

		let usLabel = KeybindingLabels._toUSLabel(keybinding);
		let label = this.getLabelFor(keybinding);
		if (usLabel !== label) {
			// electron menus are incorrect in rendering (linux) and in rendering and interpreting (mac)
			// for non US standard keyboard layouts
			return null;
		}

		return super.getElectronAcceleratorFor(keybinding);
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
			when: IOSupport.readKeybindingWhen(when),
			weight: weight,
			primary: IOSupport.readKeybinding(key),
			mac: mac && { primary: IOSupport.readKeybinding(mac) },
			linux: linux && { primary: IOSupport.readKeybinding(linux) },
			win: win && { primary: IOSupport.readKeybinding(win) }
		};

		if (!desc.primary && !desc.mac && !desc.linux && !desc.win) {
			return undefined;
		}

		return desc;
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
