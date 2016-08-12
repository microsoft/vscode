/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {Keybinding} from 'vs/base/common/keyCodes';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {ContextKeyExpr} from 'vs/platform/contextkey/common/contextkey';

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

export interface IKeybindingItem {
	keybinding: number;
	command: string;
	when: ContextKeyExpr;
	weight1: number;
	weight2: number;
}

export let IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IKeybindingService {
	_serviceBrand: any;

	getLabelFor(keybinding: Keybinding): string;
	getAriaLabelFor(keybinding: Keybinding): string;
	getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[];
	getElectronAcceleratorFor(keybinding: Keybinding): string;

	getDefaultKeybindings(): string;
	lookupKeybindings(commandId: string): Keybinding[];
	customKeybindingsCount(): number;
}

