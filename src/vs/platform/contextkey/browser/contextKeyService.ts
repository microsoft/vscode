/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { IContextKey, IContextKeyServiceTarget, IContextKeyService, SET_CONTEXT_COMMAND_ID, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import Event, { Emitter, debounceEvent } from 'vs/base/common/event';

const KEYBINDING_CONTEXT_ATTR = 'data-keybinding-context';

export class ContextValuesContainer {
	protected _parent: ContextValuesContainer;
	protected _value: { [key: string]: any; };
	protected _id: number;

	constructor(id: number, parent: ContextValuesContainer) {
		this._id = id;
		this._parent = parent;
		this._value = Object.create(null);
		this._value['_contextId'] = id;
	}

	public setValue(key: string, value: any): boolean {
		// console.log('SET ' + key + ' = ' + value + ' ON ' + this._id);
		if (this._value[key] !== value) {
			this._value[key] = value;
			return true;
		}
		return false;
	}

	public removeValue(key: string): boolean {
		// console.log('REMOVE ' + key + ' FROM ' + this._id);
		return delete this._value[key];
	}

	public getValue<T>(key: string): T {
		const ret = this._value[key];
		if (typeof ret === 'undefined' && this._parent) {
			return this._parent.getValue<T>(key);
		}
		return ret;
	}

	public fillInContext(bucket: any): void {
		if (this._parent) {
			this._parent.fillInContext(bucket);
		}
		for (let key in this._value) {
			bucket[key] = this._value[key];
		}
	}
}

class ConfigAwareContextValuesContainer extends ContextValuesContainer {

	private _emitter: Emitter<string>;
	private _subscription: IDisposable;

	constructor(id: number, configurationService: IConfigurationService, emitter: Emitter<string>) {
		super(id, null);

		this._emitter = emitter;
		this._subscription = configurationService.onDidUpdateConfiguration(e => this._updateConfigurationContext(e.config));
		this._updateConfigurationContext(configurationService.getConfiguration());
	}

	public dispose() {
		this._subscription.dispose();
	}

	private _updateConfigurationContext(config: any) {

		// remove old config.xyz values
		for (let key in this._value) {
			if (key.indexOf('config.') === 0) {
				delete this._value[key];
			}
		}

		// add new value from config
		const walk = (obj: any, keys: string[]) => {
			for (let key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					keys.push(key);
					let value = obj[key];
					if (typeof value === 'boolean') {
						const configKey = keys.join('.');
						this._value[configKey] = value;
						this._emitter.fire(configKey);
					} else if (typeof value === 'object') {
						walk(value, keys);
					}
					keys.pop();
				}
			}
		};
		walk(config, ['config']);
	}
}

class ContextKey<T> implements IContextKey<T> {

	private _parent: AbstractContextKeyService;
	private _key: string;
	private _defaultValue: T;

	constructor(parent: AbstractContextKeyService, key: string, defaultValue: T) {
		this._parent = parent;
		this._key = key;
		this._defaultValue = defaultValue;
		this.reset();
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

	public get(): T {
		return this._parent.getContextKeyValue<T>(this._key);
	}
}

export abstract class AbstractContextKeyService {
	public _serviceBrand: any;

	protected _onDidChangeContext: Event<string[]>;
	protected _onDidChangeContextKey: Emitter<string>;
	protected _myContextId: number;

	constructor(myContextId: number) {
		this._myContextId = myContextId;
		this._onDidChangeContextKey = new Emitter<string>();
	}

	public createKey<T>(key: string, defaultValue: T): IContextKey<T> {
		return new ContextKey(this, key, defaultValue);
	}

	public get onDidChangeContext(): Event<string[]> {
		if (!this._onDidChangeContext) {
			this._onDidChangeContext = debounceEvent(this._onDidChangeContextKey.event, (prev: string[], cur) => {
				if (!prev) {
					prev = [cur];
				} else if (prev.indexOf(cur) < 0) {
					prev.push(cur);
				}
				return prev;
			}, 25);
		}
		return this._onDidChangeContext;
	}

	public createScoped(domNode: IContextKeyServiceTarget): IContextKeyService {
		return new ScopedContextKeyService(this, this._onDidChangeContextKey, domNode);
	}

	public contextMatchesRules(rules: ContextKeyExpr): boolean {
		const ctx = Object.create(null);
		this.getContextValuesContainer(this._myContextId).fillInContext(ctx);
		const result = KeybindingResolver.contextMatchesRules(ctx, rules);
		// console.group(rules.serialize() + ' -> ' + result);
		// rules.keys().forEach(key => { console.log(key, ctx[key]); });
		// console.groupEnd();
		return result;
	}

	public getContextKeyValue<T>(key: string): T {
		return this.getContextValuesContainer(this._myContextId).getValue<T>(key);
	}

	public setContext(key: string, value: any): void {
		if (this.getContextValuesContainer(this._myContextId).setValue(key, value)) {
			this._onDidChangeContextKey.fire(key);
		}
	}

	public removeContext(key: string): void {
		if (this.getContextValuesContainer(this._myContextId).removeValue(key)) {
			this._onDidChangeContextKey.fire(key);
		}
	}

	public getContextValue(target: IContextKeyServiceTarget): any {
		let res = Object.create(null);
		this.getContextValuesContainer(findContextAttr(target)).fillInContext(res);
		return res;
	}

	public abstract getContextValuesContainer(contextId: number): ContextValuesContainer;
	public abstract createChildContext(parentContextId?: number): number;
	public abstract disposeContext(contextId: number): void;
}

export class ContextKeyService extends AbstractContextKeyService implements IContextKeyService {

	private _lastContextId: number;
	private _contexts: {
		[contextId: string]: ContextValuesContainer;
	};

	private _toDispose: IDisposable[] = [];

	constructor( @IConfigurationService configurationService: IConfigurationService) {
		super(0);
		this._lastContextId = 0;
		this._contexts = Object.create(null);

		const myContext = new ConfigAwareContextValuesContainer(this._myContextId, configurationService, this._onDidChangeContextKey);
		this._contexts[String(this._myContextId)] = myContext;
		this._toDispose.push(myContext);

		// Uncomment this to see the contexts continuously logged
		// let lastLoggedValue: string = null;
		// setInterval(() => {
		// 	let values = Object.keys(this._contexts).map((key) => this._contexts[key]);
		// 	let logValue = values.map(v => JSON.stringify(v._value, null, '\t')).join('\n');
		// 	if (lastLoggedValue !== logValue) {
		// 		lastLoggedValue = logValue;
		// 		console.log(lastLoggedValue);
		// 	}
		// }, 2000);
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	public getContextValuesContainer(contextId: number): ContextValuesContainer {
		return this._contexts[String(contextId)];
	}

	public createChildContext(parentContextId: number = this._myContextId): number {
		let id = (++this._lastContextId);
		this._contexts[String(id)] = new ContextValuesContainer(id, this.getContextValuesContainer(parentContextId));
		return id;
	}

	public disposeContext(contextId: number): void {
		delete this._contexts[String(contextId)];
	}
}

class ScopedContextKeyService extends AbstractContextKeyService {

	private _parent: AbstractContextKeyService;
	private _domNode: IContextKeyServiceTarget;

	constructor(parent: AbstractContextKeyService, emitter: Emitter<string>, domNode?: IContextKeyServiceTarget) {
		super(parent.createChildContext());
		this._parent = parent;
		this._onDidChangeContextKey = emitter;

		if (domNode) {
			this._domNode = domNode;
			this._domNode.setAttribute(KEYBINDING_CONTEXT_ATTR, String(this._myContextId));
		}
	}

	public dispose(): void {
		this._parent.disposeContext(this._myContextId);
		if (this._domNode) {
			this._domNode.removeAttribute(KEYBINDING_CONTEXT_ATTR);
		}
	}

	public get onDidChangeContext(): Event<string[]> {
		return this._parent.onDidChangeContext;
	}

	public getContextValuesContainer(contextId: number): ContextValuesContainer {
		return this._parent.getContextValuesContainer(contextId);
	}

	public createChildContext(parentContextId: number = this._myContextId): number {
		return this._parent.createChildContext(parentContextId);
	}

	public disposeContext(contextId: number): void {
		this._parent.disposeContext(contextId);
	}
}

function findContextAttr(domNode: IContextKeyServiceTarget): number {
	while (domNode) {
		if (domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
			return parseInt(domNode.getAttribute(KEYBINDING_CONTEXT_ATTR), 10);
		}
		domNode = domNode.parentElement;
	}
	return 0;
}

CommandsRegistry.registerCommand(SET_CONTEXT_COMMAND_ID, function (accessor, contextKey: any, contextValue: any) {
	accessor.get(IContextKeyService).createKey(String(contextKey), contextValue);
});
