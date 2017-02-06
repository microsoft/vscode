/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { BinaryKeybindings, KeyCodeUtils } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import { IKeybindingItem, IKeybindings } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommandsRegistry, ICommandHandler, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/platform';

export interface IKeybindingRule extends IKeybindings {
	id: string;
	weight: number;
	when: ContextKeyExpr;
}

export interface ICommandAndKeybindingRule extends IKeybindingRule {
	handler: ICommandHandler;
	description?: ICommandHandlerDescription;
}

export interface IKeybindingsRegistry {
	registerKeybindingRule(rule: IKeybindingRule): void;
	registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule): void;
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

	public registerKeybindingRule(rule: IKeybindingRule): void {
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

	public registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule): void {
		this.registerKeybindingRule(desc);
		CommandsRegistry.registerCommand(desc.id, desc);
	}

	private registerDefaultKeybinding(keybinding: number, commandId: string, weight1: number, weight2: number, when: ContextKeyExpr): void {
		if (platform.isWindows) {
			if (BinaryKeybindings.hasCtrlCmd(keybinding) && !BinaryKeybindings.hasShift(keybinding) && BinaryKeybindings.hasAlt(keybinding) && !BinaryKeybindings.hasWinCtrl(keybinding)) {
				if (/^[A-Z0-9\[\]\|\;\'\,\.\/\`]$/.test(KeyCodeUtils.toString(BinaryKeybindings.extractKeyCode(keybinding)))) {
					console.warn('Ctrl+Alt+ keybindings should not be used by default under Windows. Offender: ', keybinding, ' for ', commandId);
				}
			}
		}
		this._keybindings.push({
			keybinding: keybinding,
			command: commandId,
			commandArgs: null,
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