/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeKeybinding, Keybinding } from '../../../base/common/keybindings.js';
import { OperatingSystem, OS } from '../../../base/common/platform.js';
import { CommandsRegistry, ICommandHandler, ICommandMetadata } from '../../commands/common/commands.js';
import { ContextKeyExpression } from '../../contextkey/common/contextkey.js';
import { Registry } from '../../registry/common/platform.js';
import { combinedDisposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';

export interface IKeybindingItem {
	keybinding: Keybinding | null;
	command: string | null;
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
	/**
	 * Keybinding is disabled if expression returns false.
	 */
	when?: ContextKeyExpression | null | undefined;
}

export interface IExtensionKeybindingRule {
	keybinding: Keybinding | null;
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
	metadata?: ICommandMetadata | null;
}

export interface IKeybindingsRegistry {
	registerKeybindingRule(rule: IKeybindingRule): IDisposable;
	setExtensionKeybindings(rules: IExtensionKeybindingRule[]): void;
	registerCommandAndKeybindingRule(desc: ICommandAndKeybindingRule): IDisposable;
	getDefaultKeybindings(): IKeybindingItem[];
}

/**
 * Stores all built-in and extension-provided keybindings (but not ones that user defines themselves)
 */
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
			const kk = decodeKeybinding(actualKb.primary, OS);
			if (kk) {
				result.add(this._registerDefaultKeybinding(kk, rule.id, rule.args, rule.weight, 0, rule.when));
			}
		}

		if (actualKb && Array.isArray(actualKb.secondary)) {
			for (let i = 0, len = actualKb.secondary.length; i < len; i++) {
				const k = actualKb.secondary[i];
				const kk = decodeKeybinding(k, OS);
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
			if (rule.keybinding) {
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

	private _registerDefaultKeybinding(keybinding: Keybinding, commandId: string, commandArgs: any, weight1: number, weight2: number, when: ContextKeyExpression | null | undefined): IDisposable {
		const remove = this._coreKeybindings.push({
			keybinding: keybinding,
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
	if (a.command && b.command) {
		if (a.command < b.command) {
			return -1;
		}
		if (a.command > b.command) {
			return 1;
		}
	}
	return a.weight2 - b.weight2;
}
