/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ResolvedKeybinding, RuntimeKeybinding, SimpleRuntimeKeybinding } from 'vs/base/common/keyCodes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';
import Event from 'vs/base/common/event';

export interface IUserFriendlyKeybinding {
	key: string;
	command: string;
	args?: any;
	when?: string;
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

export interface IKeybindingItem {
	keybinding: RuntimeKeybinding;
	command: string;
	commandArgs?: any;
	when: ContextKeyExpr;
	weight1: number;
	weight2: number;
}

export interface IKeybindingItem2 {
	keybinding: ResolvedKeybinding;
	command: string;
	source: KeybindingSource;
	when: ContextKeyExpr;
}

export enum KeybindingSource {
	Default = 1,
	User
}

export interface IKeybindingEvent {
	source: KeybindingSource;
	keybindings?: IUserFriendlyKeybinding[];
}

export let IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IKeybindingService {
	_serviceBrand: any;

	onDidUpdateKeybindings: Event<IKeybindingEvent>;

	resolveKeybinding(keybinding: RuntimeKeybinding): ResolvedKeybinding;

	getDefaultKeybindings(): string;

	getKeybindings(): IKeybindingItem2[];

	/**
	 * Look up keybindings for a command.
	 * Use `lookupKeybinding` if you are interested in the preferred keybinding.
	 */
	lookupKeybindings(commandId: string): ResolvedKeybinding[];

	/**
	 * Look up the preferred (last defined) keybinding for a command.
	 * @returns The preferred keybinding or null if the command is not bound.
	 */
	lookupKeybinding(commandId: string): ResolvedKeybinding;

	customKeybindingsCount(): number;

	resolve(keybinding: SimpleRuntimeKeybinding, target: IContextKeyServiceTarget): IResolveResult;
}

