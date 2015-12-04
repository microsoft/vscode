/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, IInstantiationService, ServiceIdentifier, ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {Keybinding} from 'vs/base/common/keyCodes';

export interface IUserFriendlyKeybinding {
	key: string;
	command: string;
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

export interface IKeybindingContextRule {
	key: string;
	/**
	 * Defaults to 'equal' (string)
	 */
	operator?: string;
	/**
	 * Defaults to true (boolean)
	 */
	operand?: any;
}

export interface IKeybindingItem {
	keybinding: number;
	command: string;
	context: IKeybindingContextRule[];
	weight1: number;
	weight2: number;
}

export interface ICommandHandler {
	(accessor: ServicesAccessor, args: any): void;
}

export interface ICommandsMap {
	[id: string]: ICommandHandler
}

export interface IKeybindingContextKey<T> {
	set(value: T): void;
	reset(): void;
}

export var IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IKeybindingScopeLocation {
	setAttribute(attr:string, value:string): void;
	removeAttribute(attr:string): void;
}

export interface IKeybindingService {
	serviceId : ServiceIdentifier<any>;
	dispose(): void;

	createKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T>;

	createScoped(domNode: IKeybindingScopeLocation): IKeybindingService;

	getDefaultKeybindings(): string;
	lookupKeybindings(commandId: string): Keybinding[];
	customKeybindingsCount(): number;

	getLabelFor(keybinding:Keybinding): string;

	executeCommand<T>(commandId: string, args?: any): TPromise<T>;
	executeCommand(commandId: string, args?: any): TPromise<any>;
}
