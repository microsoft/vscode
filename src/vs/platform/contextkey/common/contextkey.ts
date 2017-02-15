/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export enum ContextKeyExprType {
	Defined = 1,
	Not = 2,
	Equals = 3,
	NotEquals = 4,
	And = 5
}

export abstract class ContextKeyExpr {

	public static has(key: string): ContextKeyExpr {
		return new ContextKeyDefinedExpr(key);
	}

	public static equals(key: string, value: any): ContextKeyExpr {
		return new ContextKeyEqualsExpr(key, value);
	}

	public static notEquals(key: string, value: any): ContextKeyExpr {
		return new ContextKeyNotEqualsExpr(key, value);
	}

	public static not(key: string): ContextKeyExpr {
		return new ContextKeyNotExpr(key);
	}

	public static and(...expr: ContextKeyExpr[]): ContextKeyExpr {
		return new ContextKeyAndExpr(expr);
	}

	public static deserialize(serialized: string): ContextKeyExpr {
		if (!serialized) {
			return null;
		}

		let pieces = serialized.split('&&');
		let result = new ContextKeyAndExpr(pieces.map(p => this._deserializeOne(p)));
		return result.normalize();
	}

	private static _deserializeOne(serializedOne: string): ContextKeyExpr {
		serializedOne = serializedOne.trim();

		if (serializedOne.indexOf('!=') >= 0) {
			let pieces = serializedOne.split('!=');
			return new ContextKeyNotEqualsExpr(pieces[0].trim(), this._deserializeValue(pieces[1]));
		}

		if (serializedOne.indexOf('==') >= 0) {
			let pieces = serializedOne.split('==');
			return new ContextKeyEqualsExpr(pieces[0].trim(), this._deserializeValue(pieces[1]));
		}

		if (/^\!\s*/.test(serializedOne)) {
			return new ContextKeyNotExpr(serializedOne.substr(1).trim());
		}

		return new ContextKeyDefinedExpr(serializedOne);
	}

	private static _deserializeValue(serializedValue: string): any {
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

	public abstract getType(): ContextKeyExprType;
	public abstract equals(other: ContextKeyExpr): boolean;
	public abstract evaluate(context: any): boolean;
	public abstract normalize(): ContextKeyExpr;
	public abstract serialize(): string;
	public abstract keys(): string[];
}

function cmp(a: ContextKeyExpr, b: ContextKeyExpr): number {
	let aType = a.getType();
	let bType = b.getType();
	if (aType !== bType) {
		return aType - bType;
	}
	switch (aType) {
		case ContextKeyExprType.Defined:
			return (<ContextKeyDefinedExpr>a).cmp(<ContextKeyDefinedExpr>b);
		case ContextKeyExprType.Not:
			return (<ContextKeyNotExpr>a).cmp(<ContextKeyNotExpr>b);
		case ContextKeyExprType.Equals:
			return (<ContextKeyEqualsExpr>a).cmp(<ContextKeyEqualsExpr>b);
		case ContextKeyExprType.NotEquals:
			return (<ContextKeyNotEqualsExpr>a).cmp(<ContextKeyNotEqualsExpr>b);
		default:
			throw new Error('Unknown ContextKeyExpr!');
	}
}

export class ContextKeyDefinedExpr implements ContextKeyExpr {
	constructor(protected key: string) {
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.Defined;
	}

	public cmp(other: ContextKeyDefinedExpr): number {
		if (this.key < other.key) {
			return -1;
		}
		if (this.key > other.key) {
			return 1;
		}
		return 0;
	}

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyDefinedExpr) {
			return (this.key === other.key);
		}
		return false;
	}

	public evaluate(context: any): boolean {
		return (!!context[this.key]);
	}

	public normalize(): ContextKeyExpr {
		return this;
	}

	public serialize(): string {
		return this.key;
	}

	public keys(): string[] {
		return [this.key];
	}
}

export class ContextKeyEqualsExpr implements ContextKeyExpr {
	constructor(private key: string, private value: any) {
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.Equals;
	}

	public cmp(other: ContextKeyEqualsExpr): number {
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

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyEqualsExpr) {
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

	public normalize(): ContextKeyExpr {
		if (typeof this.value === 'boolean') {
			if (this.value) {
				return new ContextKeyDefinedExpr(this.key);
			}
			return new ContextKeyNotExpr(this.key);
		}
		return this;
	}

	public serialize(): string {
		if (typeof this.value === 'boolean') {
			return this.normalize().serialize();
		}

		return this.key + ' == \'' + this.value + '\'';
	}

	public keys(): string[] {
		return [this.key];
	}
}

export class ContextKeyNotEqualsExpr implements ContextKeyExpr {
	constructor(private key: string, private value: any) {
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.NotEquals;
	}

	public cmp(other: ContextKeyNotEqualsExpr): number {
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

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyNotEqualsExpr) {
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

	public normalize(): ContextKeyExpr {
		if (typeof this.value === 'boolean') {
			if (this.value) {
				return new ContextKeyNotExpr(this.key);
			}
			return new ContextKeyDefinedExpr(this.key);
		}
		return this;
	}

	public serialize(): string {
		if (typeof this.value === 'boolean') {
			return this.normalize().serialize();
		}

		return this.key + ' != \'' + this.value + '\'';
	}

	public keys(): string[] {
		return [this.key];
	}
}

export class ContextKeyNotExpr implements ContextKeyExpr {
	constructor(private key: string) {
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.Not;
	}

	public cmp(other: ContextKeyNotExpr): number {
		if (this.key < other.key) {
			return -1;
		}
		if (this.key > other.key) {
			return 1;
		}
		return 0;
	}

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyNotExpr) {
			return (this.key === other.key);
		}
		return false;
	}

	public evaluate(context: any): boolean {
		return (!context[this.key]);
	}

	public normalize(): ContextKeyExpr {
		return this;
	}

	public serialize(): string {
		return '!' + this.key;
	}

	public keys(): string[] {
		return [this.key];
	}
}

export class ContextKeyAndExpr implements ContextKeyExpr {
	private expr: ContextKeyExpr[];

	constructor(expr: ContextKeyExpr[]) {
		this.expr = ContextKeyAndExpr._normalizeArr(expr);
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.And;
	}

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyAndExpr) {
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
		return false;
	}

	public evaluate(context: any): boolean {
		for (let i = 0, len = this.expr.length; i < len; i++) {
			if (!this.expr[i].evaluate(context)) {
				return false;
			}
		}
		return true;
	}

	private static _normalizeArr(arr: ContextKeyExpr[]): ContextKeyExpr[] {
		let expr: ContextKeyExpr[] = [];

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

				if (e instanceof ContextKeyAndExpr) {
					expr = expr.concat(e.expr);
					continue;
				}

				expr.push(e);
			}

			expr.sort(cmp);
		}

		return expr;
	}

	public normalize(): ContextKeyExpr {
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

	public keys(): string[] {
		const result: string[] = [];
		for (let expr of this.expr) {
			result.push(...expr.keys());
		}
		return result;
	}
}

export class RawContextKey<T> extends ContextKeyDefinedExpr {

	private _defaultValue: T;

	constructor(key: string, defaultValue: T) {
		super(key);
		this._defaultValue = defaultValue;
	}

	public bindTo(target: IContextKeyService): IContextKey<T> {
		return target.createKey(this.key, this._defaultValue);
	}

	public getValue(target: IContextKeyService): T {
		return target.getContextKeyValue<T>(this.key);
	}

	public toNegated(): ContextKeyExpr {
		return ContextKeyExpr.not(this.key);
	}

	public isEqualTo(value: string): ContextKeyExpr {
		return ContextKeyExpr.equals(this.key, value);
	}
}

export interface IContextKey<T> {
	set(value: T): void;
	reset(): void;
	get(): T;
}

export interface IContextKeyServiceTarget {
	parentElement: IContextKeyServiceTarget;
	setAttribute(attr: string, value: string): void;
	removeAttribute(attr: string): void;
	hasAttribute(attr: string): boolean;
	getAttribute(attr: string): string;
}

export let IContextKeyService = createDecorator<IContextKeyService>('contextKeyService');

export interface IContextKeyService {
	_serviceBrand: any;
	dispose(): void;

	onDidChangeContext: Event<string[]>;
	createKey<T>(key: string, defaultValue: T): IContextKey<T>;
	contextMatchesRules(rules: ContextKeyExpr): boolean;
	getContextKeyValue<T>(key: string): T;

	createScoped(target?: IContextKeyServiceTarget): IContextKeyService;
	getContextValue(target: IContextKeyServiceTarget): any;
}

export const SET_CONTEXT_COMMAND_ID = 'setContext';
