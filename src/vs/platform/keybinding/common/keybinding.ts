/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {Keybinding} from 'vs/base/common/keyCodes';
import {TPromise} from 'vs/base/common/winjs.base';
import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

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

export enum KbExprType {
	KbDefinedExpression = 1,
	KbNotExpression = 2,
	KbEqualsExpression = 3,
	KbNotEqualsExpression = 4,
	KbAndExpression = 5
}

export interface KbExpr {
	getType(): KbExprType;
	equals(other: KbExpr): boolean;
	evaluate(context: any): boolean;
	normalize(): KbExpr;
	serialize(): string;
	keys(): string[];
}

function cmp(a:KbExpr, b:KbExpr): number {
	let aType = a.getType();
	let bType = b.getType();
	if (aType !== bType) {
		return aType - bType;
	}
	switch(aType) {
		case KbExprType.KbDefinedExpression:
			return (<KbDefinedExpression>a).cmp(<KbDefinedExpression>b);
		case KbExprType.KbNotExpression:
			return (<KbNotExpression>a).cmp(<KbNotExpression>b);
		case KbExprType.KbEqualsExpression:
			return (<KbEqualsExpression>a).cmp(<KbEqualsExpression>b);
		case KbExprType.KbNotEqualsExpression:
			return (<KbNotEqualsExpression>a).cmp(<KbNotEqualsExpression>b);
		default:
			throw new Error('Unknown KbExpr!');
	}
}

export class KbDefinedExpression implements KbExpr {
	constructor(private key: string) {
	}

	public getType(): KbExprType {
		return KbExprType.KbDefinedExpression;
	}

	public cmp(other:KbDefinedExpression): number {
		if (this.key < other.key) {
			return -1;
		}
		if (this.key > other.key) {
			return 1;
		}
		return 0;
	}

	public equals(other: KbExpr): boolean {
		if (other instanceof KbDefinedExpression) {
			return (this.key === other.key);
		}
		return false;
	}

	public evaluate(context: any): boolean {
		return (!!context[this.key]);
	}

	public normalize(): KbExpr {
		return this;
	}

	public serialize(): string {
		return this.key;
	}

	public keys(): string[]{
		return [this.key];
	}
}

export class KbEqualsExpression implements KbExpr {
	constructor(private key: string, private value: any) {
	}

	public getType(): KbExprType {
		return KbExprType.KbEqualsExpression;
	}

	public cmp(other:KbEqualsExpression): number {
		if (this.key < other.key) {
			return -1;
		}
		if (this.key > other.key) {
			return 1;
		}
		if (this.value < other.value) {
			return -1;
		}
		if (this.value > other.value) {
			return 1;
		}
		return 0;
	}

	public equals(other: KbExpr): boolean {
		if (other instanceof KbEqualsExpression) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public evaluate(context: any): boolean {
		/* tslint:disable:triple-equals */
		// Intentional ==
		return (context[this.key] == this.value);
		/* tslint:enable:triple-equals */
	}

	public normalize(): KbExpr {
		if (typeof this.value === 'boolean') {
			if (this.value) {
				return new KbDefinedExpression(this.key);
			}
			return new KbNotExpression(this.key);
		}
		return this;
	}

	public serialize(): string {
		if (typeof this.value === 'boolean') {
			return this.normalize().serialize();
		}

		return this.key + ' == \'' + this.value + '\'';
	}

	public keys(): string[]{
		return [this.key];
	}
}

export class KbNotEqualsExpression implements KbExpr {
	constructor(private key: string, private value: any) {
	}

	public getType(): KbExprType {
		return KbExprType.KbNotEqualsExpression;
	}

	public cmp(other:KbNotEqualsExpression): number {
		if (this.key < other.key) {
			return -1;
		}
		if (this.key > other.key) {
			return 1;
		}
		if (this.value < other.value) {
			return -1;
		}
		if (this.value > other.value) {
			return 1;
		}
		return 0;
	}

	public equals(other: KbExpr): boolean {
		if (other instanceof KbNotEqualsExpression) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public evaluate(context: any): boolean {
		/* tslint:disable:triple-equals */
		// Intentional !=
		return (context[this.key] != this.value);
		/* tslint:enable:triple-equals */
	}

	public normalize(): KbExpr {
		if (typeof this.value === 'boolean') {
			if (this.value) {
				return new KbNotExpression(this.key);
			}
			return new KbDefinedExpression(this.key);
		}
		return this;
	}

	public serialize(): string {
		if (typeof this.value === 'boolean') {
			return this.normalize().serialize();
		}

		return this.key + ' != \'' + this.value + '\'';
	}

	public keys(): string[]{
		return [this.key];
	}
}

export class KbNotExpression implements KbExpr {
	constructor(private key: string) {
	}

	public getType(): KbExprType {
		return KbExprType.KbNotExpression;
	}

	public cmp(other:KbNotExpression): number {
		if (this.key < other.key) {
			return -1;
		}
		if (this.key > other.key) {
			return 1;
		}
		return 0;
	}

	public equals(other: KbExpr): boolean {
		if (other instanceof KbNotExpression) {
			return (this.key === other.key);
		}
		return false;
	}

	public evaluate(context: any): boolean {
		return (!context[this.key]);
	}

	public normalize(): KbExpr {
		return this;
	}

	public serialize(): string {
		return '!' + this.key;
	}

	public keys(): string[]{
		return [this.key];
	}
}

export class KbAndExpression implements KbExpr {
	private expr: KbExpr[];

	constructor(expr: KbExpr[]) {
		this.expr = KbAndExpression._normalizeArr(expr);
	}

	public getType(): KbExprType {
		return KbExprType.KbAndExpression;
	}

	public equals(other: KbExpr): boolean {
		if (other instanceof KbAndExpression) {
			if (this.expr.length !== other.expr.length) {
				return false;
			}
			for (let i = 0, len = this.expr.length; i < len; i++) {
				if (!this.expr[i].equals(other.expr[i])) {
					return false;
				}
			}
			return true;
		}
	}

	public evaluate(context: any): boolean {
		for (let i = 0, len = this.expr.length; i < len; i++) {
			if (!this.expr[i].evaluate(context)) {
				return false;
			}
		}
		return true;
	}

	private static _normalizeArr(arr:KbExpr[]): KbExpr[] {
		let expr: KbExpr[] = [];

		if (arr) {
			for (let i = 0, len = arr.length; i < len; i++) {
				let e = arr[i];
				if (!e) {
					continue;
				}

				e = e.normalize();
				if (!e) {
					continue;
				}

				if (e instanceof KbAndExpression) {
					expr = expr.concat(e.expr);
					continue;
				}

				expr.push(e);
			}

			expr.sort(cmp);
		}

		return expr;
	}

	public normalize(): KbExpr {
		if (this.expr.length === 0) {
			return null;
		}

		if (this.expr.length === 1) {
			return this.expr[0];
		}

		return this;
	}

	public serialize(): string {
		if (this.expr.length === 0) {
			return '';
		}
		if (this.expr.length === 1) {
			return this.normalize().serialize();
		}
		return this.expr.map(e => e.serialize()).join(' && ');
	}

	public keys(): string[]{
		const result: string[] = [];
		for (let expr of this.expr) {
			result.push(...expr.keys());
		}
		return result;
	}
}


export let KbExpr = {
	has: (key: string) => new KbDefinedExpression(key),
	equals: (key: string, value: any) => new KbEqualsExpression(key, value),
	notEquals: (key: string, value: any) => new KbNotEqualsExpression(key, value),
	not: (key: string) => new KbNotExpression(key),
	and: (...expr: KbExpr[]) => new KbAndExpression(expr),
	deserialize: (serialized: string): KbExpr => {
		if (!serialized) {
			return null;
		}

		let pieces = serialized.split('&&');
		let result = new KbAndExpression(pieces.map(p => KbExpr._deserializeOne(p)));
		return result.normalize();
	},

	_deserializeOne: (serializedOne: string): KbExpr => {
		serializedOne = serializedOne.trim();

		if (serializedOne.indexOf('!=') >= 0) {
			let pieces = serializedOne.split('!=');
			return new KbNotEqualsExpression(pieces[0].trim(), KbExpr._deserializeValue(pieces[1]));
		}

		if (serializedOne.indexOf('==') >= 0) {
			let pieces = serializedOne.split('==');
			return new KbEqualsExpression(pieces[0].trim(), KbExpr._deserializeValue(pieces[1]));
		}

		if (/^\!\s*/.test(serializedOne)) {
			return new KbNotExpression(serializedOne.substr(1).trim());
		}

		return new KbDefinedExpression(serializedOne);
	},

	_deserializeValue: (serializedValue: string): any => {
		serializedValue = serializedValue.trim();

		if (serializedValue === 'true') {
			return true;
		}

		if (serializedValue === 'false') {
			return false;
		}

		let m = /^'([^']*)'$/.exec(serializedValue);
		if (m) {
			return m[1].trim();
		}

		return serializedValue;
	}
};

export interface IKeybindingItem {
	keybinding: number;
	command: string;
	when: KbExpr;
	weight1: number;
	weight2: number;
}

export interface IKeybindingContextKey<T> {
	set(value: T): void;
	reset(): void;
}

export let IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IKeybindingScopeLocation {
	setAttribute(attr: string, value: string): void;
	removeAttribute(attr: string): void;
}

export interface IKeybindingService {
	serviceId: ServiceIdentifier<any>;
	dispose(): void;

	onDidChangeContext: Event<string[]>;
	createKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T>;
	contextMatchesRules(rules: KbExpr): boolean;
	getContextValue<T>(key: string): T;

	createScoped(domNode: IKeybindingScopeLocation): IKeybindingService;

	getDefaultKeybindings(): string;
	lookupKeybindings(commandId: string): Keybinding[];
	customKeybindingsCount(): number;

	getLabelFor(keybinding: Keybinding): string;
	getAriaLabelFor(keybinding: Keybinding): string;
	getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[];
	getElectronAcceleratorFor(keybinding: Keybinding): string;

	executeCommand<T>(commandId: string, ...args: any[]): TPromise<T>;
	executeCommand(commandId: string, ...args: any[]): TPromise<any>;
	hasCommand(commandId: string): boolean;
}

export const SET_CONTEXT_COMMAND_ID = 'setContext';
