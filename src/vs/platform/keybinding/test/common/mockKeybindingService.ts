/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { Keybinding } from 'vs/base/common/keyCodes';
import { KeybindingLabels } from 'vs/base/common/keybinding';
import Event from 'vs/base/common/event';
import { IKeybindingService, IKeybindingEvent } from 'vs/platform/keybinding/common/keybinding';
import { IContextKey, IContextKeyService, IContextKeyServiceTarget, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';

class MockKeybindingContextKey<T> implements IContextKey<T> {
	private _key: string;
	private _defaultValue: T;
	private _value: T;

	constructor(key: string, defaultValue: T) {
		this._key = key;
		this._defaultValue = defaultValue;
		this._value = this._defaultValue;
	}

	public set(value: T): void {
		this._value = value;
	}

	public reset(): void {
		this._value = this._defaultValue;
	}

	public get(): T {
		return this._value;
	}
}

export class MockKeybindingService implements IContextKeyService {
	public _serviceBrand: any;

	public dispose(): void { }

	public createKey<T>(key: string, defaultValue: T): IContextKey<T> {
		return new MockKeybindingContextKey(key, defaultValue);
	}
	public contextMatchesRules(rules: ContextKeyExpr): boolean {
		return false;
	}
	public get onDidChangeContext(): Event<string[]> {
		return Event.None;
	}
	public getContextKeyValue(key: string) {
		return;
	}
	public getContextValue(domNode: HTMLElement): any {
		return null;
	}
	public createScoped(domNode: HTMLElement): IContextKeyService {
		return this;
	}
}

export class MockKeybindingService2 implements IKeybindingService {
	public _serviceBrand: any;

	public get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		return Event.None;
	}

	public getLabelFor(keybinding: Keybinding): string {
		return KeybindingLabels._toUSLabel(keybinding);
	}

	public getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[] {
		return KeybindingLabels._toUSHTMLLabel(keybinding);
	}

	public getAriaLabelFor(keybinding: Keybinding): string {
		return KeybindingLabels._toUSAriaLabel(keybinding);
	}

	public getElectronAcceleratorFor(keybinding: Keybinding): string {
		return KeybindingLabels._toElectronAccelerator(keybinding);
	}

	public getDefaultKeybindings(): string {
		return null;
	}

	public lookupKeybindings(commandId: string): Keybinding[] {
		return [];
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public resolve(keybinding: Keybinding, target: IContextKeyServiceTarget): IResolveResult {
		return null;
	}
}
