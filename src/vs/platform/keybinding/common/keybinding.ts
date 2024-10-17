/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { ResolvedKeybinding, Keybinding } from '../../../base/common/keybindings.js';
import { IContextKeyService, IContextKeyServiceTarget } from '../../contextkey/common/contextkey.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ResolutionResult } from './keybindingResolver.js';
import { ResolvedKeybindingItem } from './resolvedKeybindingItem.js';

export interface IUserFriendlyKeybinding {
	key: string;
	command: string;
	args?: any;
	when?: string;
}

export interface IKeyboardEvent {
	readonly _standardKeyboardEventBrand: true;

	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly altGraphKey: boolean;
	readonly keyCode: KeyCode;
	readonly code: string;
}

export interface KeybindingsSchemaContribution {
	readonly onDidChange?: Event<void>;

	getSchemaAdditions(): IJSONSchema[];
}

export const IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IKeybindingService {
	readonly _serviceBrand: undefined;

	readonly inChordMode: boolean;

	onDidUpdateKeybindings: Event<void>;

	/**
	 * Returns none, one or many (depending on keyboard layout)!
	 */
	resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[];

	resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding;

	resolveUserBinding(userBinding: string): ResolvedKeybinding[];

	/**
	 * Resolve and dispatch `keyboardEvent` and invoke the command.
	 */
	dispatchEvent(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean;

	/**
	 * Resolve and dispatch `keyboardEvent`, but do not invoke the command or change inner state.
	 */
	softDispatch(keyboardEvent: IKeyboardEvent, target: IContextKeyServiceTarget): ResolutionResult;

	/**
	 * Enable hold mode for this command. This is only possible if the command is current being dispatched, meaning
	 * we are after its keydown and before is keyup event.
	 *
	 * @returns A promise that resolves when hold stops, returns undefined if hold mode could not be enabled.
	 */
	enableKeybindingHoldMode(commandId: string): Promise<void> | undefined;

	dispatchByUserSettingsLabel(userSettingsLabel: string, target: IContextKeyServiceTarget): void;

	/**
	 * Look up keybindings for a command.
	 * Use `lookupKeybinding` if you are interested in the preferred keybinding.
	 */
	lookupKeybindings(commandId: string): ResolvedKeybinding[];

	/**
	 * Look up the preferred (last defined) keybinding for a command.
	 * @returns The preferred keybinding or null if the command is not bound.
	 */
	lookupKeybinding(commandId: string, context?: IContextKeyService): ResolvedKeybinding | undefined;

	getDefaultKeybindingsContent(): string;

	getDefaultKeybindings(): readonly ResolvedKeybindingItem[];

	getKeybindings(): readonly ResolvedKeybindingItem[];

	customKeybindingsCount(): number;

	/**
	 * Will the given key event produce a character that's rendered on screen, e.g. in a
	 * text box. *Note* that the results of this function can be incorrect.
	 */
	mightProducePrintableCharacter(event: IKeyboardEvent): boolean;

	registerSchemaContribution(contribution: KeybindingsSchemaContribution): void;

	toggleLogging(): boolean;

	_dumpDebugInfo(): string;
	_dumpDebugInfoJSON(): string;
}
