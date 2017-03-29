/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ResolvedKeybinding, Keybinding, KeyCode } from 'vs/base/common/keyCodes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import Event from 'vs/base/common/event';

export interface IUserFriendlyKeybinding {
	key: string;
	command: string;
	args?: any;
	when?: string;
}

export enum KeybindingSource {
	Default = 1,
	User
}

export interface IKeybindingEvent {
	source: KeybindingSource;
	keybindings?: IUserFriendlyKeybinding[];
}

export interface IKeyboardEvent {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly keyCode: KeyCode;
	readonly code: string;
}

export let IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IKeybindingService {
	_serviceBrand: any;

	onDidUpdateKeybindings: Event<IKeybindingEvent>;

	/**
	 * Returns none, one or many (depending on keyboard layout)!
	 */
	resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[];

	resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding;

	resolveUserBinding(userBinding: string): ResolvedKeybinding[];

	/**
	 * Resolve and dispatch `keyboardEvent`, but do not invoke the command or change inner state.
	 */
	softDispatch(keyboardEvent: IKeyboardEvent, target: IContextKeyServiceTarget): IResolveResult;

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

	getDefaultKeybindingsContent(): string;

	getDefaultKeybindings(): ResolvedKeybindingItem[];

	getKeybindings(): ResolvedKeybindingItem[];

	customKeybindingsCount(): number;
}

