/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./keybindings';
import * as nls from 'vs/nls';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {KeyCode, Keybinding} from 'vs/base/common/keyCodes';
import {IDisposable} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import {IKeyboardEvent, StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeybindingResolver} from 'vs/platform/keybinding/common/keybindingResolver';
import {ICommandHandler, IKeybindingContextKey, IKeybindingItem, IKeybindingScopeLocation, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IMessageService} from 'vs/platform/message/common/message';

let KEYBINDING_CONTEXT_ATTR = 'data-keybinding-context';

export class KeybindingContext {
	private _parent: KeybindingContext;
	private _value: any;
	private _id: number;

	constructor(id: number, parent: KeybindingContext) {
		this._id = id;
		this._parent = parent;
		this._value = Object.create(null);
		this._value['_contextId'] = id;
	}

	public setValue(key: string, value: any): void {
		//		console.log('SET ' + key + ' = ' + value + ' ON ' + this._id);
		this._value[key] = value;
	}

	public removeValue(key: string): void {
		//		console.log('REMOVE ' + key + ' FROM ' + this._id);
		delete this._value[key];
	}

	public getValue(): any {
		let r = this._parent ? this._parent.getValue() : Object.create(null);
		for (let key in this._value) {
			r[key] = this._value[key];
		}
		return r;
	}
}

class KeybindingContextKey<T> implements IKeybindingContextKey<T> {

	private _parent: AbstractKeybindingService;
	private _key: string;
	private _defaultValue: T;

	constructor(parent: AbstractKeybindingService, key: string, defaultValue: T) {
		this._parent = parent;
		this._key = key;
		this._defaultValue = defaultValue;
		if (typeof this._defaultValue !== 'undefined') {
			this._parent.setContext(this._key, this._defaultValue);
		}
	}

	public set(value: T): void {
		this._parent.setContext(this._key, value);
	}

	public reset(): void {
		if (typeof this._defaultValue === 'undefined') {
			this._parent.removeContext(this._key);
		} else {
			this._parent.setContext(this._key, this._defaultValue);
		}
	}

}

export abstract class AbstractKeybindingService {
	public serviceId = IKeybindingService;
	protected _myContextId: number;
	protected _instantiationService: IInstantiationService;
	protected _messageService: IMessageService;

	constructor(myContextId: number) {
		this._myContextId = myContextId;
		this._instantiationService = null;
		this._messageService = null;
	}

	public setMessageService(messageService: IMessageService): void {
		this._messageService = messageService;
	}

	public createKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T> {
		return new KeybindingContextKey(this, key, defaultValue);
	}

	public setInstantiationService(instantiationService: IInstantiationService): void {
		this._instantiationService = instantiationService;
	}

	public createScoped(domNode: IKeybindingScopeLocation): IKeybindingService {
		return new ScopedKeybindingService(this, domNode);
	}

	public setContext(key: string, value: any): void {
		this.getContext(this._myContextId).setValue(key, value);
	}

	public removeContext(key: string): void {
		this.getContext(this._myContextId).removeValue(key);
	}

	public abstract getLabelFor(keybinding: Keybinding): string;
	public abstract getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[];
	public abstract getElectronAcceleratorFor(keybinding: Keybinding): string;
	public abstract customKeybindingsCount(): number;
	public abstract getContext(contextId: number): KeybindingContext;
	public abstract createChildContext(parentContextId?: number): number;
	public abstract disposeContext(contextId: number): void;
	public abstract getDefaultKeybindings(): string;
	public abstract lookupKeybindings(commandId: string): Keybinding[];
	public abstract executeCommand(commandId: string, args: any): TPromise<any>;
}

export class KeybindingService extends AbstractKeybindingService implements IKeybindingService {

	private _lastContextId: number;
	private _contexts: {
		[contextId: string]: KeybindingContext;
	};

	protected _domNode: HTMLElement;
	private _toDispose: IDisposable;
	private _resolver: KeybindingResolver;
	private _currentChord: number;
	private _currentChordStatusMessage: IDisposable;

	constructor(domNode: HTMLElement) {
		this._lastContextId = -1;
		super((++this._lastContextId));
		this._domNode = domNode;
		this._contexts = Object.create(null);
		this._contexts[String(this._myContextId)] = new KeybindingContext(this._myContextId, null);
		this._toDispose = dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let keyEvent = new StandardKeyboardEvent(e);
			this._dispatch(keyEvent);
		});

		this._createOrUpdateResolver(true);
		this._currentChord = 0;
		this._currentChordStatusMessage = null;
	}

	public dispose(): void {
		this._toDispose.dispose();
		this._toDispose = null;
	}

	public getLabelFor(keybinding: Keybinding): string {
		return keybinding._toUSLabel();
	}

	public getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[] {
		return keybinding._toUSHTMLLabel();
	}

	public getElectronAcceleratorFor(keybinding: Keybinding): string {
		return keybinding._toElectronAccelerator();
	}

	protected updateResolver(): void {
		this._createOrUpdateResolver(false);
	}

	private _createOrUpdateResolver(isFirstTime: boolean): void {
		this._resolver = new KeybindingResolver(KeybindingsRegistry.getDefaultKeybindings(), this._getExtraKeybindings(isFirstTime));
	}

	protected _getExtraKeybindings(isFirstTime: boolean): IKeybindingItem[] {
		return [];
	}

	public getDefaultKeybindings(): string {
		return this._resolver.getDefaultKeybindings() + '\n\n' + this._getAllCommandsAsComment();
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public lookupKeybindings(commandId: string): Keybinding[] {
		return this._resolver.lookupKeybinding(commandId);
	}

	private _getAllCommandsAsComment(): string {
		let boundCommands = this._resolver.getDefaultBoundCommands();
		let unboundCommands = Object.keys(KeybindingsRegistry.getCommands()).filter(commandId => commandId[0] !== '_' && !boundCommands[commandId]);
		unboundCommands.sort();
		let pretty = unboundCommands.join('\n// - ');

		return '// ' + nls.localize('unboundCommands', "Here are other available commands: ") + '\n// - ' + pretty;
	}

	protected _getCommandHandler(commandId: string): ICommandHandler {
		return KeybindingsRegistry.getCommands()[commandId];
	}

	private _dispatch(e: IKeyboardEvent): void {
		let isModifierKey = (e.keyCode === KeyCode.Ctrl || e.keyCode === KeyCode.Shift || e.keyCode === KeyCode.Alt || e.keyCode === KeyCode.Meta);
		if (isModifierKey) {
			return;
		}

		let contextId = this._findContextAttr(e.target);
		let context = this.getContext(contextId);
		let contextValue = context.getValue();
		//		console.log(JSON.stringify(contextValue, null, '\t'));

		let resolveResult = this._resolver.resolve(contextValue, this._currentChord, e.asKeybinding());

		if (resolveResult && resolveResult.enterChord) {
			e.preventDefault();
			this._currentChord = resolveResult.enterChord;
			if (this._messageService) {
				let firstPartLabel = this.getLabelFor(new Keybinding(this._currentChord));
				this._currentChordStatusMessage = this._messageService.setStatusMessage(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", firstPartLabel));
			}
			return;
		}

		if (this._messageService && this._currentChord) {
			if (!resolveResult || !resolveResult.commandId) {
				let firstPartLabel = this.getLabelFor(new Keybinding(this._currentChord));
				let chordPartLabel = this.getLabelFor(new Keybinding(e.asKeybinding()));
				this._messageService.setStatusMessage(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", firstPartLabel, chordPartLabel), 10 * 1000 /* 10s */);
				e.preventDefault();
			}
		}
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChord = 0;

		if (resolveResult && resolveResult.commandId) {
			if (!/^\^/.test(resolveResult.commandId)) {
				e.preventDefault();
			}
			let commandId = resolveResult.commandId.replace(/^\^/, '');
			this._invokeHandler(commandId, { context: contextValue }).done(undefined, err => {
				this._messageService.show(Severity.Warning, err);
			});
		}
	}

	protected _invokeHandler(commandId: string, args: any): TPromise<any> {

		let handler = this._getCommandHandler(commandId);
		if (!handler) {
			return TPromise.wrapError(new Error(`No handler found for the command: '${commandId}'. Ensure there is an activation event defined, if you are an extension.`));
		}
		try {
			let result = this._instantiationService.invokeFunction(handler, args);
			return TPromise.as(result);
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}

	private _findContextAttr(domNode: HTMLElement): number {
		while (domNode) {
			if (domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
				return parseInt(domNode.getAttribute(KEYBINDING_CONTEXT_ATTR), 10);
			}
			domNode = domNode.parentElement;
		}
		return this._myContextId;
	}

	public getContext(contextId: number): KeybindingContext {
		return this._contexts[String(contextId)];
	}

	public createChildContext(parentContextId: number = this._myContextId): number {
		let id = (++this._lastContextId);
		this._contexts[String(id)] = new KeybindingContext(id, this.getContext(parentContextId));
		return id;
	}

	public disposeContext(contextId: number): void {
		delete this._contexts[String(contextId)];
	}

	public executeCommand(commandId: string, args: any = {}): TPromise<any> {
		if (!args.context) {
			let contextId = this._findContextAttr(<HTMLElement>document.activeElement);
			let context = this.getContext(contextId);
			let contextValue = context.getValue();

			args.context = contextValue;
		}

		return this._invokeHandler(commandId, args);
	}
}

class ScopedKeybindingService extends AbstractKeybindingService {

	private _parent: AbstractKeybindingService;
	private _domNode: IKeybindingScopeLocation;

	constructor(parent: AbstractKeybindingService, domNode: IKeybindingScopeLocation) {
		this._parent = parent;
		this._domNode = domNode;
		super(this._parent.createChildContext());
		this._domNode.setAttribute(KEYBINDING_CONTEXT_ATTR, String(this._myContextId));
	}

	public dispose(): void {
		this._parent.disposeContext(this._myContextId);
		this._domNode.removeAttribute(KEYBINDING_CONTEXT_ATTR);
	}

	public getLabelFor(keybinding: Keybinding): string {
		return this._parent.getLabelFor(keybinding);
	}

	public getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[] {
		return this._parent.getHTMLLabelFor(keybinding);
	}

	public getElectronAcceleratorFor(keybinding: Keybinding): string {
		return this._parent.getElectronAcceleratorFor(keybinding);
	}

	public getDefaultKeybindings(): string {
		return this._parent.getDefaultKeybindings();
	}

	public customKeybindingsCount(): number {
		return this._parent.customKeybindingsCount();
	}

	public lookupKeybindings(commandId: string): Keybinding[] {
		return this._parent.lookupKeybindings(commandId);
	}

	public getContext(contextId: number): KeybindingContext {
		return this._parent.getContext(contextId);
	}

	public createChildContext(parentContextId: number = this._myContextId): number {
		return this._parent.createChildContext(parentContextId);
	}

	public disposeContext(contextId: number): void {
		this._parent.disposeContext(contextId);
	}

	public executeCommand(commandId: string, args: any): TPromise<any> {
		return this._parent.executeCommand(commandId, args);
	}
}
