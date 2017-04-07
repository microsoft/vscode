/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ResolvedKeybinding, Keybinding, SimpleKeybinding } from 'vs/base/common/keyCodes';
import Event from 'vs/base/common/event';
import { IKeybindingService, IKeybindingEvent, IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { IContextKey, IContextKeyService, IContextKeyServiceTarget, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { OS } from 'vs/base/common/platform';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';

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

export class MockContextKeyService implements IContextKeyService {
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
	public getContext(domNode: HTMLElement): any {
		return null;
	}
	public createScoped(domNode: HTMLElement): IContextKeyService {
		return this;
	}
}

export class MockKeybindingService implements IKeybindingService {
	public _serviceBrand: any;

	public get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		return Event.None;
	}

	public getDefaultKeybindingsContent(): string {
		return null;
	}

	public getDefaultKeybindings(): ResolvedKeybindingItem[] {
		return [];
	}

	public getKeybindings(): ResolvedKeybindingItem[] {
		return [];
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		return [new USLayoutResolvedKeybinding(keybinding, OS)];
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		let keybinding = new SimpleKeybinding(
			keyboardEvent.ctrlKey,
			keyboardEvent.shiftKey,
			keyboardEvent.altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		);
		return this.resolveKeybinding(keybinding)[0];
	}

	public resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
		return [];
	}

	public lookupKeybindings(commandId: string): ResolvedKeybinding[] {
		return [];
	}

	public lookupKeybinding(commandId: string): ResolvedKeybinding {
		return null;
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public softDispatch(keybinding: IKeyboardEvent, target: IContextKeyServiceTarget): IResolveResult {
		return null;
	}
}
