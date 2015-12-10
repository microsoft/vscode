/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import {TypeConstraint, validateConstraints} from 'vs/base/common/types';
import {ICommandHandler, ICommandHandlerDescription, ICommandsMap, IKeybindingItem, IKeybindings, IKeybindingContextRule} from 'vs/platform/keybinding/common/keybindingService';
import {KeybindingsUtils} from 'vs/platform/keybinding/common/keybindingsUtils';
import {KeyMod, KeyCode, BinaryKeybindings} from 'vs/base/common/keyCodes';
import Platform = require('vs/base/common/platform');

export interface ICommandRule extends IKeybindings {
	id: string;
	weight: number;
	context: IKeybindingContextRule[];
}

export interface ICommandDescriptor extends ICommandRule {
	handler: ICommandHandler;
	description?: string | ICommandHandlerDescription;
}

export interface IKeybindingsRegistry {
	registerCommandRule(rule:ICommandRule);
	registerCommandDesc(desc: ICommandDescriptor): void;
	getCommands(): ICommandsMap;
	getDefaultKeybindings(): IKeybindingItem[];

	KEYBINDING_CONTEXT_OPERATOR_EQUAL: string;
	KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL: string;

	WEIGHT: {
		editorCore(importance?: number): number;
		editorContrib(importance?: number): number;
		workbenchContrib(importance?: number): number;
		builtinExtension(importance?:number): number;
		externalExtension(importance?:number): number;
	};
}

class KeybindingsRegistryImpl implements IKeybindingsRegistry {

	private _keybindings: IKeybindingItem[];
	private _commands: ICommandsMap;

	public KEYBINDING_CONTEXT_OPERATOR_EQUAL = 'equal';
	public KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL = 'not_equal';

	public WEIGHT = {
		editorCore: (importance: number = 0): number => {
			return 0 + importance;
		},
		editorContrib: (importance: number = 0): number => {
			return 100 + importance;
		},
		workbenchContrib: (importance: number = 0): number => {
			return 200 + importance;
		},
		builtinExtension: (importance:number = 0): number => {
			return 300 + importance;
		},
		externalExtension: (importance:number = 0): number => {
			return 400 + importance;
		}
	};

	constructor() {
		this._keybindings = [];
		this._commands = Object.create(null);
	}

	public registerCommandRule(rule:ICommandRule): void {
		var actualKb = KeybindingsUtils.bindToCurrentPlatform(rule);

		if (actualKb && actualKb.primary) {
			this.registerDefaultKeybinding(actualKb.primary, rule.id, rule.weight, 0, rule.context);
		}

		if (actualKb && Array.isArray(actualKb.secondary)) {
			actualKb.secondary.forEach((k, i) => this.registerDefaultKeybinding(k, rule.id, rule.weight, -i - 1, rule.context));
		}
	}

	public registerCommandDesc(desc: ICommandDescriptor): void {
		this.registerCommandRule(desc);

		// if (_commands[desc.id]) {
		// 	console.warn('Duplicate handler for command: ' + desc.id);
		// }
		// this._commands[desc.id] = desc.handler;

		let {handler} = desc;
		let description = desc.description || handler.description;

		// add argument validation if rich command metadata is provided
		if (typeof description === 'object') {
			const metadata = <ICommandHandlerDescription>description;
			const constraints: TypeConstraint[] = [];
			for (let arg of metadata.args) {
				constraints.push(arg.constraint);
			}
			handler = function(accesor, args) {
				validateConstraints(args, constraints);
				return desc.handler(accesor, args);
			};
		}

		// make sure description is there
		handler.description = description;

		// register handler
		this._commands[desc.id] = handler;
	}

	public getCommands(): ICommandsMap {
		return this._commands;
	}

	private registerDefaultKeybinding(keybinding: number, commandId:string, weight1: number, weight2:number, context:IKeybindingContextRule[]): void {
		if (Platform.isWindows) {
			if (BinaryKeybindings.hasCtrlCmd(keybinding) && !BinaryKeybindings.hasShift(keybinding) && BinaryKeybindings.hasAlt(keybinding) && !BinaryKeybindings.hasWinCtrl(keybinding)) {
				if (/^[A-Z0-9\[\]\|\;\'\,\.\/\`]$/.test(KeyCode.toString(BinaryKeybindings.extractKeyCode(keybinding)))) {
					console.warn('Ctrl+Alt+ keybindings should not be used by default under Windows. Offender: ', keybinding, ' for ', commandId);
				}
			}
		}
		this._keybindings.push({
			keybinding: keybinding,
			command: commandId,
			context: context,
			weight1: weight1,
			weight2: weight2
		});
	}

	public getDefaultKeybindings(): IKeybindingItem[] {
		return this._keybindings;
	}
}
export var KeybindingsRegistry:IKeybindingsRegistry = new KeybindingsRegistryImpl();

// Define extension point ids
export var Extensions = {
	EditorModes: 'platform.keybindingsRegistry'
};
Registry.add(Extensions.EditorModes, KeybindingsRegistry);