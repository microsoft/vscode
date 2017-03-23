/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SimpleKeybinding, KeyCode, KeybindingType, createKeybinding, Keybinding } from 'vs/base/common/keyCodes';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommandsRegistry, ICommandHandler, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { Registry } from 'vs/platform/platform';

export interface IKeybindingItem {
	keybinding: Keybinding;
	command: string;
	commandArgs?: any;
	when: ContextKeyExpr;
	weight1: number;
	weight2: number;
}

export interface IKeybindings {
	primary: number;
	secondary?: number[];
	win?: {
		primary: number;
		secondary?: number[];
	};
	linux?: {
		primary: number;
		secondary?: number[];
	};
	mac?: {
		primary: number;
		secondary?: number[];
	};
}

export interface IKeybindingRule extends IKeybindings {
	id: string;
	weight: number;
	when: ContextKeyExpr;
}

export interface IKeybindingRule2 {
	primary: Keybinding;
	win?: { primary: Keybinding; };
	linux?: { primary: Keybinding; };
	mac?: { primary: Keybinding; };
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
	registerKeybindingRule2(rule: IKeybindingRule2): void;
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
		if (OS === OperatingSystem.Windows) {
			if (kb && kb.win) {
				return kb.win;
			}
		} else if (OS === OperatingSystem.Macintosh) {
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

	/**
	 * Take current platform into account and reduce to primary & secondary.
	 */
	private static bindToCurrentPlatform2(kb: IKeybindingRule2): { primary?: Keybinding; } {
		if (OS === OperatingSystem.Windows) {
			if (kb && kb.win) {
				return kb.win;
			}
		} else if (OS === OperatingSystem.Macintosh) {
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

		if (actualKb && actualKb.primary) {
			this.registerDefaultKeybinding(createKeybinding(actualKb.primary, OS), rule.id, rule.weight, 0, rule.when);
		}

		if (actualKb && Array.isArray(actualKb.secondary)) {
			actualKb.secondary.forEach((k, i) => this.registerDefaultKeybinding(createKeybinding(k, OS), rule.id, rule.weight, -i - 1, rule.when));
		}
	}

	public registerKeybindingRule2(rule: IKeybindingRule2): void {
		let actualKb = KeybindingsRegistryImpl.bindToCurrentPlatform2(rule);

		if (actualKb && actualKb.primary) {
			this.registerDefaultKeybinding(actualKb.primary, rule.id, rule.weight, 0, rule.when);
		}
	}

	public registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule): void {
		this.registerKeybindingRule(desc);
		CommandsRegistry.registerCommand(desc.id, desc);
	}

	private static _mightProduceChar(keyCode: KeyCode): boolean {
		if (keyCode >= KeyCode.KEY_0 && keyCode <= KeyCode.KEY_9) {
			return true;
		}
		if (keyCode >= KeyCode.KEY_A && keyCode <= KeyCode.KEY_Z) {
			return true;
		}
		return (
			keyCode === KeyCode.US_SEMICOLON
			|| keyCode === KeyCode.US_EQUAL
			|| keyCode === KeyCode.US_COMMA
			|| keyCode === KeyCode.US_MINUS
			|| keyCode === KeyCode.US_DOT
			|| keyCode === KeyCode.US_SLASH
			|| keyCode === KeyCode.US_BACKTICK
			|| keyCode === KeyCode.US_OPEN_SQUARE_BRACKET
			|| keyCode === KeyCode.US_BACKSLASH
			|| keyCode === KeyCode.US_CLOSE_SQUARE_BRACKET
			|| keyCode === KeyCode.US_QUOTE
			|| keyCode === KeyCode.OEM_8
			|| keyCode === KeyCode.OEM_102
		);
	}

	private _assertNoCtrlAlt(keybinding: SimpleKeybinding, commandId: string): void {
		if (keybinding.ctrlKey && keybinding.altKey && !keybinding.metaKey) {
			if (KeybindingsRegistryImpl._mightProduceChar(keybinding.keyCode)) {
				console.warn('Ctrl+Alt+ keybindings should not be used by default under Windows. Offender: ', keybinding, ' for ', commandId);
			}
		}
	}

	private registerDefaultKeybinding(keybinding: Keybinding, commandId: string, weight1: number, weight2: number, when: ContextKeyExpr): void {
		if (OS === OperatingSystem.Windows) {
			if (keybinding.type === KeybindingType.Chord) {
				this._assertNoCtrlAlt(keybinding.firstPart, commandId);
			} else {
				this._assertNoCtrlAlt(keybinding, commandId);
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
		let result = this._keybindings.slice(0);
		result.sort(sorter);
		return result;
	}
}
export let KeybindingsRegistry: IKeybindingsRegistry = new KeybindingsRegistryImpl();

// Define extension point ids
export let Extensions = {
	EditorModes: 'platform.keybindingsRegistry'
};
Registry.add(Extensions.EditorModes, KeybindingsRegistry);

function sorter(a: IKeybindingItem, b: IKeybindingItem): number {
	if (a.weight1 !== b.weight1) {
		return a.weight1 - b.weight1;
	}
	if (a.command < b.command) {
		return -1;
	}
	if (a.command > b.command) {
		return 1;
	}
	return a.weight2 - b.weight2;
}
