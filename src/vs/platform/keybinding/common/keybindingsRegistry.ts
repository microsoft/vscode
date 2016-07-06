/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {BinaryKeybindings, KeyCode} from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import {TypeConstraint, validateConstraints} from 'vs/base/common/types';
import {ICommandHandler, ICommandHandlerDescription, ICommandsMap, IKeybindingItem, IKeybindings, KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {Registry} from 'vs/platform/platform';

export interface ICommandRule extends IKeybindings {
	id: string;
	weight: number;
	when: KbExpr;
}

export interface ICommandDescriptor extends ICommandRule {
	handler: ICommandHandler;
	description?: string | ICommandHandlerDescription;
}

export interface IKeybindingsRegistry {
	registerCommandRule(rule: ICommandRule);
	registerCommandDesc(desc: ICommandDescriptor): void;
	getCommands(): ICommandsMap;
	getDefaultKeybindings(): IKeybindingItem[];

	WEIGHT: {
		editorCore(importance?: number): number;
		editorContrib(importance?: number): number;
		workbenchContrib(importance?: number): number;
		builtinExtension(importance?: number): number;
		externalExtension(importance?: number): number;
	};
}

class KeybindingsRegistryImpl implements IKeybindingsRegistry {

	private _keybindings: IKeybindingItem[];
	private _commands: ICommandsMap;

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
		builtinExtension: (importance: number = 0): number => {
			return 300 + importance;
		},
		externalExtension: (importance: number = 0): number => {
			return 400 + importance;
		}
	};

	constructor() {
		this._keybindings = [];
		this._commands = Object.create(null);
	}

	/**
	 * Take current platform into account and reduce to primary & secondary.
	 */
	private static bindToCurrentPlatform(kb: IKeybindings): { primary?: number; secondary?: number[]; } {
		if (platform.isWindows) {
			if (kb && kb.win) {
				return kb.win;
			}
		} else if (platform.isMacintosh) {
			if (kb && kb.mac) {
				return kb.mac;
			}
		} else {
			if (kb && kb.linux) {
				return kb.linux;
			}
		}

		return kb;
	}

	public registerCommandRule(rule: ICommandRule): void {
		let actualKb = KeybindingsRegistryImpl.bindToCurrentPlatform(rule);

		// here
		if (actualKb && actualKb.primary) {
			this.registerDefaultKeybinding(actualKb.primary, rule.id, rule.weight, 0, rule.when);
		}

		// here
		if (actualKb && Array.isArray(actualKb.secondary)) {
			actualKb.secondary.forEach((k, i) => this.registerDefaultKeybinding(k, rule.id, rule.weight, -i - 1, rule.when));
		}
	}

	public registerCommandDesc(desc: ICommandDescriptor): void {
		this.registerCommandRule(desc);

		// if (_commands[desc.id]) {
		// 	console.warn('Duplicate handler for command: ' + desc.id);
		// }
		// this._commands[desc.id] = desc.handler;

		let handler = desc.handler;
		let description = desc.description || handler.description;

		// add argument validation if rich command metadata is provided
		if (typeof description === 'object') {
			let constraints: TypeConstraint[] = [];
			for (let arg of description.args) {
				constraints.push(arg.constraint);
			}
			handler = function (accesor, ...args: any[]) {
				validateConstraints(args, constraints);
				return desc.handler(accesor, ...args);
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

	private registerDefaultKeybinding(keybinding: number, commandId: string, weight1: number, weight2: number, when: KbExpr): void {
		if (platform.isWindows) {
			if (BinaryKeybindings.hasCtrlCmd(keybinding) && !BinaryKeybindings.hasShift(keybinding) && BinaryKeybindings.hasAlt(keybinding) && !BinaryKeybindings.hasWinCtrl(keybinding)) {
				if (/^[A-Z0-9\[\]\|\;\'\,\.\/\`]$/.test(KeyCode.toString(BinaryKeybindings.extractKeyCode(keybinding)))) {
					console.warn('Ctrl+Alt+ keybindings should not be used by default under Windows. Offender: ', keybinding, ' for ', commandId);
				}
			}
		}
		this._keybindings.push({
			keybinding: keybinding,
			command: commandId,
			when: when,
			weight1: weight1,
			weight2: weight2
		});
	}

	public getDefaultKeybindings(): IKeybindingItem[] {
		return this._keybindings;
	}
}
export let KeybindingsRegistry: IKeybindingsRegistry = new KeybindingsRegistryImpl();

// Define extension point ids
export let Extensions = {
	EditorModes: 'platform.keybindingsRegistry'
};
Registry.add(Extensions.EditorModes, KeybindingsRegistry);