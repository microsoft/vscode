/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, Keybinding, KeybindingType, SimpleKeybinding, createKeybinding } from 'vs/base/common/keyCodes';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { CommandsRegistry, ICommandHandler, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';

export interface IKeybindingItem {
	keybinding: Keybinding;
	command: string;
	commandArgs?: any;
	when: ContextKeyExpr | null | undefined;
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
	when: ContextKeyExpr | null | undefined;
}

export interface IKeybindingRule2 {
	primary: Keybinding | null;
	win?: { primary: Keybinding | null; } | null;
	linux?: { primary: Keybinding | null; } | null;
	mac?: { primary: Keybinding | null; } | null;
	id: string;
	args?: any;
	weight: number;
	when: ContextKeyExpr | null;
}

export const enum KeybindingRuleSource {
	Core = 0,
	Extension = 1
}

export const enum KeybindingWeight {
	EditorCore = 0,
	EditorContrib = 100,
	WorkbenchContrib = 200,
	BuiltinExtension = 300,
	ExternalExtension = 400
}

export interface ICommandAndKeybindingRule extends IKeybindingRule {
	handler: ICommandHandler;
	description?: ICommandHandlerDescription | null;
}

export interface IKeybindingsRegistry {
	registerKeybindingRule(rule: IKeybindingRule, source?: KeybindingRuleSource): void;
	registerKeybindingRule2(rule: IKeybindingRule2, source?: KeybindingRuleSource): void;
	registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule, source?: KeybindingRuleSource): void;
	getDefaultKeybindings(): IKeybindingItem[];
}

class KeybindingsRegistryImpl implements IKeybindingsRegistry {

	private _keybindings: IKeybindingItem[];
	private _keybindingsSorted: boolean;

	constructor() {
		this._keybindings = [];
		this._keybindingsSorted = true;
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
	private static bindToCurrentPlatform2(kb: IKeybindingRule2): { primary?: Keybinding | null; } {
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

	public registerKeybindingRule(rule: IKeybindingRule, source: KeybindingRuleSource = KeybindingRuleSource.Core): void {
		let actualKb = KeybindingsRegistryImpl.bindToCurrentPlatform(rule);

		if (actualKb && actualKb.primary) {
			const kk = createKeybinding(actualKb.primary, OS);
			if (kk) {
				this._registerDefaultKeybinding(kk, rule.id, undefined, rule.weight, 0, rule.when, source);
			}
		}

		if (actualKb && Array.isArray(actualKb.secondary)) {
			for (let i = 0, len = actualKb.secondary.length; i < len; i++) {
				const k = actualKb.secondary[i];
				const kk = createKeybinding(k, OS);
				if (kk) {
					this._registerDefaultKeybinding(kk, rule.id, undefined, rule.weight, -i - 1, rule.when, source);
				}
			}
		}
	}

	public registerKeybindingRule2(rule: IKeybindingRule2, source: KeybindingRuleSource = KeybindingRuleSource.Core): void {
		let actualKb = KeybindingsRegistryImpl.bindToCurrentPlatform2(rule);

		if (actualKb && actualKb.primary) {
			this._registerDefaultKeybinding(actualKb.primary, rule.id, rule.args, rule.weight, 0, rule.when, source);
		}
	}

	public registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule, source: KeybindingRuleSource = KeybindingRuleSource.Core): void {
		this.registerKeybindingRule(desc, source);
		CommandsRegistry.registerCommand(desc);
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
			|| keyCode === KeyCode.ABNT_C1
			|| keyCode === KeyCode.ABNT_C2
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

	private _registerDefaultKeybinding(keybinding: Keybinding, commandId: string, commandArgs: any, weight1: number, weight2: number, when: ContextKeyExpr | null | undefined, source: KeybindingRuleSource): void {
		if (source === KeybindingRuleSource.Core && OS === OperatingSystem.Windows) {
			if (keybinding.type === KeybindingType.Chord) {
				this._assertNoCtrlAlt(keybinding.firstPart, commandId);
			} else {
				this._assertNoCtrlAlt(keybinding, commandId);
			}
		}
		this._keybindings.push({
			keybinding: keybinding,
			command: commandId,
			commandArgs: commandArgs,
			when: when,
			weight1: weight1,
			weight2: weight2
		});
		this._keybindingsSorted = false;
	}

	public getDefaultKeybindings(): IKeybindingItem[] {
		if (!this._keybindingsSorted) {
			this._keybindings.sort(sorter);
			this._keybindingsSorted = true;
		}
		return this._keybindings.slice(0);
	}
}
export const KeybindingsRegistry: IKeybindingsRegistry = new KeybindingsRegistryImpl();

// Define extension point ids
export const Extensions = {
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
