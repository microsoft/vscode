/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { createKeybinding, Keybinding, SimpleKeybinding, ScanCodeBinding } from 'vs/base/common/keybindings';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { CommandsRegistry, ICommandHandler, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { combinedDisposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';

export interface IKeybindingItem {
	keybinding: (SimpleKeybinding | ScanCodeBinding)[];
	command: string;
	commandArgs?: any;
	when: ContextKeyExpression | null | undefined;
	weight1: number;
	weight2: number;
	extensionId: string | null;
	isBuiltinExtension: boolean;
}

export interface IKeybindings {
	primary?: number;
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
	args?: any;
	when?: ContextKeyExpression | null | undefined;
}

export interface IExtensionKeybindingRule {
	keybinding: (SimpleKeybinding | ScanCodeBinding)[];
	id: string;
	args?: any;
	weight: number;
	when: ContextKeyExpression | undefined;
	extensionId?: string;
	isBuiltinExtension?: boolean;
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
	registerKeybindingRule(rule: IKeybindingRule): IDisposable;
	setExtensionKeybindings(rules: IExtensionKeybindingRule[]): void;
	registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule): IDisposable;
	getDefaultKeybindings(): IKeybindingItem[];
}

class KeybindingsRegistryImpl implements IKeybindingsRegistry {

	private _coreKeybindings: LinkedList<IKeybindingItem>;
	private _extensionKeybindings: IKeybindingItem[];
	private _cachedMergedKeybindings: IKeybindingItem[] | null;

	constructor() {
		this._coreKeybindings = new LinkedList();
		this._extensionKeybindings = [];
		this._cachedMergedKeybindings = null;
	}

	/**
	 * Take current platform into account and reduce to primary & secondary.
	 */
	private static bindToCurrentPlatform(kb: IKeybindings): { primary?: number; secondary?: number[] } {
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

	public registerKeybindingRule(rule: IKeybindingRule): IDisposable {
		const actualKb = KeybindingsRegistryImpl.bindToCurrentPlatform(rule);
		const result = new DisposableStore();

		if (actualKb && actualKb.primary) {
			const kk = createKeybinding(actualKb.primary, OS);
			if (kk) {
				result.add(this._registerDefaultKeybinding(kk, rule.id, rule.args, rule.weight, 0, rule.when));
			}
		}

		if (actualKb && Array.isArray(actualKb.secondary)) {
			for (let i = 0, len = actualKb.secondary.length; i < len; i++) {
				const k = actualKb.secondary[i];
				const kk = createKeybinding(k, OS);
				if (kk) {
					result.add(this._registerDefaultKeybinding(kk, rule.id, rule.args, rule.weight, -i - 1, rule.when));
				}
			}
		}
		return result;
	}

	public setExtensionKeybindings(rules: IExtensionKeybindingRule[]): void {
		const result: IKeybindingItem[] = [];
		let keybindingsLen = 0;
		for (const rule of rules) {
			if (rule.keybinding.length > 0) {
				result[keybindingsLen++] = {
					keybinding: rule.keybinding,
					command: rule.id,
					commandArgs: rule.args,
					when: rule.when,
					weight1: rule.weight,
					weight2: 0,
					extensionId: rule.extensionId || null,
					isBuiltinExtension: rule.isBuiltinExtension || false
				};
			}
		}

		this._extensionKeybindings = result;
		this._cachedMergedKeybindings = null;
	}

	public registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule): IDisposable {
		return combinedDisposable(
			this.registerKeybindingRule(desc),
			CommandsRegistry.registerCommand(desc)
		);
	}

	private static _mightProduceChar(keyCode: KeyCode): boolean {
		if (keyCode >= KeyCode.Digit0 && keyCode <= KeyCode.Digit9) {
			return true;
		}
		if (keyCode >= KeyCode.KeyA && keyCode <= KeyCode.KeyZ) {
			return true;
		}
		return (
			keyCode === KeyCode.Semicolon
			|| keyCode === KeyCode.Equal
			|| keyCode === KeyCode.Comma
			|| keyCode === KeyCode.Minus
			|| keyCode === KeyCode.Period
			|| keyCode === KeyCode.Slash
			|| keyCode === KeyCode.Backquote
			|| keyCode === KeyCode.ABNT_C1
			|| keyCode === KeyCode.ABNT_C2
			|| keyCode === KeyCode.BracketLeft
			|| keyCode === KeyCode.Backslash
			|| keyCode === KeyCode.BracketRight
			|| keyCode === KeyCode.Quote
			|| keyCode === KeyCode.OEM_8
			|| keyCode === KeyCode.IntlBackslash
		);
	}

	private _assertNoCtrlAlt(keybinding: SimpleKeybinding, commandId: string): void {
		if (keybinding.ctrlKey && keybinding.altKey && !keybinding.metaKey) {
			if (KeybindingsRegistryImpl._mightProduceChar(keybinding.keyCode)) {
				console.warn('Ctrl+Alt+ keybindings should not be used by default under Windows. Offender: ', keybinding, ' for ', commandId);
			}
		}
	}

	private _registerDefaultKeybinding(keybinding: Keybinding, commandId: string, commandArgs: any, weight1: number, weight2: number, when: ContextKeyExpression | null | undefined): IDisposable {
		if (OS === OperatingSystem.Windows) {
			this._assertNoCtrlAlt(keybinding.parts[0], commandId);
		}
		const remove = this._coreKeybindings.push({
			keybinding: keybinding.parts,
			command: commandId,
			commandArgs: commandArgs,
			when: when,
			weight1: weight1,
			weight2: weight2,
			extensionId: null,
			isBuiltinExtension: false
		});
		this._cachedMergedKeybindings = null;

		return toDisposable(() => {
			remove();
			this._cachedMergedKeybindings = null;
		});
	}

	public getDefaultKeybindings(): IKeybindingItem[] {
		if (!this._cachedMergedKeybindings) {
			this._cachedMergedKeybindings = Array.from(this._coreKeybindings).concat(this._extensionKeybindings);
			this._cachedMergedKeybindings.sort(sorter);
		}
		return this._cachedMergedKeybindings.slice(0);
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
