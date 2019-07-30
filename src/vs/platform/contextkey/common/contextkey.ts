/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const enum ContextKeyExprType {
	Defined = 1,
	Not = 2,
	Equals = 3,
	NotEquals = 4,
	And = 5,
	Regex = 6,
	NotRegex = 7,
	Or = 8
}

export interface IContextKeyExprMapper {
	mapDefined(key: string): ContextKeyExpr;
	mapNot(key: string): ContextKeyExpr;
	mapEquals(key: string, value: any): ContextKeyExpr;
	mapNotEquals(key: string, value: any): ContextKeyExpr;
	mapRegex(key: string, regexp: RegExp | null): ContextKeyRegexExpr;
}

export abstract class ContextKeyExpr {

	public static has(key: string): ContextKeyExpr {
		return ContextKeyDefinedExpr.create(key);
	}

	public static equals(key: string, value: any): ContextKeyExpr {
		return ContextKeyEqualsExpr.create(key, value);
	}

	public static notEquals(key: string, value: any): ContextKeyExpr {
		return ContextKeyNotEqualsExpr.create(key, value);
	}

	public static regex(key: string, value: RegExp): ContextKeyExpr {
		return ContextKeyRegexExpr.create(key, value);
	}

	public static not(key: string): ContextKeyExpr {
		return ContextKeyNotExpr.create(key);
	}

	public static and(...expr: Array<ContextKeyExpr | undefined | null>): ContextKeyExpr | undefined {
		return ContextKeyAndExpr.create(expr);
	}

	public static or(...expr: Array<ContextKeyExpr | undefined | null>): ContextKeyExpr | undefined {
		return ContextKeyOrExpr.create(expr);
	}

	public static deserialize(serialized: string | null | undefined, strict: boolean = false): ContextKeyExpr | undefined {
		if (!serialized) {
			return undefined;
		}

		return this._deserializeOrExpression(serialized, strict);
	}

	private static _deserializeOrExpression(serialized: string, strict: boolean): ContextKeyExpr | undefined {
		let pieces = serialized.split('||');
		return ContextKeyOrExpr.create(pieces.map(p => this._deserializeAndExpression(p, strict)));
	}

	private static _deserializeAndExpression(serialized: string, strict: boolean): ContextKeyExpr | undefined {
		let pieces = serialized.split('&&');
		return ContextKeyAndExpr.create(pieces.map(p => this._deserializeOne(p, strict)));
	}

	private static _deserializeOne(serializedOne: string, strict: boolean): ContextKeyExpr {
		serializedOne = serializedOne.trim();

		if (serializedOne.indexOf('!=') >= 0) {
			let pieces = serializedOne.split('!=');
			return ContextKeyNotEqualsExpr.create(pieces[0].trim(), this._deserializeValue(pieces[1], strict));
		}

		if (serializedOne.indexOf('==') >= 0) {
			let pieces = serializedOne.split('==');
			return ContextKeyEqualsExpr.create(pieces[0].trim(), this._deserializeValue(pieces[1], strict));
		}

		if (serializedOne.indexOf('=~') >= 0) {
			let pieces = serializedOne.split('=~');
			return ContextKeyRegexExpr.create(pieces[0].trim(), this._deserializeRegexValue(pieces[1], strict));
		}

		if (/^\!\s*/.test(serializedOne)) {
			return ContextKeyNotExpr.create(serializedOne.substr(1).trim());
		}

		return ContextKeyDefinedExpr.create(serializedOne);
	}

	private static _deserializeValue(serializedValue: string, strict: boolean): any {
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

	private static _deserializeRegexValue(serializedValue: string, strict: boolean): RegExp | null {

		if (isFalsyOrWhitespace(serializedValue)) {
			if (strict) {
				throw new Error('missing regexp-value for =~-expression');
			} else {
				console.warn('missing regexp-value for =~-expression');
			}
			return null;
		}

		let start = serializedValue.indexOf('/');
		let end = serializedValue.lastIndexOf('/');
		if (start === end || start < 0 /* || to < 0 */) {
			if (strict) {
				throw new Error(`bad regexp-value '${serializedValue}', missing /-enclosure`);
			} else {
				console.warn(`bad regexp-value '${serializedValue}', missing /-enclosure`);
			}
			return null;
		}

		let value = serializedValue.slice(start + 1, end);
		let caseIgnoreFlag = serializedValue[end + 1] === 'i' ? 'i' : '';
		try {
			return new RegExp(value, caseIgnoreFlag);
		} catch (e) {
			if (strict) {
				throw new Error(`bad regexp-value '${serializedValue}', parse error: ${e}`);
			} else {
				console.warn(`bad regexp-value '${serializedValue}', parse error: ${e}`);
			}
			return null;
		}
	}

	public abstract getType(): ContextKeyExprType;
	public abstract equals(other: ContextKeyExpr): boolean;
	public abstract evaluate(context: IContext): boolean;
	public abstract serialize(): string;
	public abstract keys(): string[];
	public abstract map(mapFnc: IContextKeyExprMapper): ContextKeyExpr;
	public abstract negate(): ContextKeyExpr;
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
		case ContextKeyExprType.Regex:
			return (<ContextKeyRegexExpr>a).cmp(<ContextKeyRegexExpr>b);
		case ContextKeyExprType.NotRegex:
			return (<ContextKeyNotRegexExpr>a).cmp(<ContextKeyNotRegexExpr>b);
		case ContextKeyExprType.And:
			return (<ContextKeyAndExpr>a).cmp(<ContextKeyAndExpr>b);
		default:
			throw new Error('Unknown ContextKeyExpr!');
	}
}

export class ContextKeyDefinedExpr implements ContextKeyExpr {
	public static create(key: string): ContextKeyDefinedExpr {
		return new ContextKeyDefinedExpr(key);
	}

	protected constructor(protected key: string) {
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

	public evaluate(context: IContext): boolean {
		return (!!context.getValue(this.key));
	}

	public serialize(): string {
		return this.key;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpr {
		return mapFnc.mapDefined(this.key);
	}

	public negate(): ContextKeyExpr {
		return ContextKeyNotExpr.create(this.key);
	}
}

export class ContextKeyEqualsExpr implements ContextKeyExpr {

	public static create(key: string, value: any): ContextKeyExpr {
		if (typeof value === 'boolean') {
			if (value) {
				return ContextKeyDefinedExpr.create(key);
			}
			return ContextKeyNotExpr.create(key);
		}
		return new ContextKeyEqualsExpr(key, value);
	}

	private constructor(private readonly key: string, private readonly value: any) {
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

	public evaluate(context: IContext): boolean {
		/* tslint:disable:triple-equals */
		// Intentional ==
		return (context.getValue(this.key) == this.value);
		/* tslint:enable:triple-equals */
	}

	public serialize(): string {
		return this.key + ' == \'' + this.value + '\'';
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpr {
		return mapFnc.mapEquals(this.key, this.value);
	}

	public negate(): ContextKeyExpr {
		return ContextKeyNotEqualsExpr.create(this.key, this.value);
	}
}

export class ContextKeyNotEqualsExpr implements ContextKeyExpr {

	public static create(key: string, value: any): ContextKeyExpr {
		if (typeof value === 'boolean') {
			if (value) {
				return ContextKeyNotExpr.create(key);
			}
			return ContextKeyDefinedExpr.create(key);
		}
		return new ContextKeyNotEqualsExpr(key, value);
	}

	private constructor(private key: string, private value: any) {
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

	public evaluate(context: IContext): boolean {
		/* tslint:disable:triple-equals */
		// Intentional !=
		return (context.getValue(this.key) != this.value);
		/* tslint:enable:triple-equals */
	}

	public serialize(): string {
		return this.key + ' != \'' + this.value + '\'';
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpr {
		return mapFnc.mapNotEquals(this.key, this.value);
	}

	public negate(): ContextKeyExpr {
		return ContextKeyEqualsExpr.create(this.key, this.value);
	}
}

export class ContextKeyNotExpr implements ContextKeyExpr {

	public static create(key: string): ContextKeyExpr {
		return new ContextKeyNotExpr(key);
	}

	private constructor(private key: string) {
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

	public evaluate(context: IContext): boolean {
		return (!context.getValue(this.key));
	}

	public serialize(): string {
		return '!' + this.key;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpr {
		return mapFnc.mapNot(this.key);
	}

	public negate(): ContextKeyExpr {
		return ContextKeyDefinedExpr.create(this.key);
	}
}

export class ContextKeyRegexExpr implements ContextKeyExpr {

	public static create(key: string, regexp: RegExp | null): ContextKeyRegexExpr {
		return new ContextKeyRegexExpr(key, regexp);
	}

	private constructor(private key: string, private regexp: RegExp | null) {
		//
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.Regex;
	}

	public cmp(other: ContextKeyRegexExpr): number {
		if (this.key < other.key) {
			return -1;
		}
		if (this.key > other.key) {
			return 1;
		}
		const thisSource = this.regexp ? this.regexp.source : '';
		const otherSource = other.regexp ? other.regexp.source : '';
		if (thisSource < otherSource) {
			return -1;
		}
		if (thisSource > otherSource) {
			return 1;
		}
		return 0;
	}

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyRegexExpr) {
			const thisSource = this.regexp ? this.regexp.source : '';
			const otherSource = other.regexp ? other.regexp.source : '';
			return (this.key === other.key && thisSource === otherSource);
		}
		return false;
	}

	public evaluate(context: IContext): boolean {
		let value = context.getValue<any>(this.key);
		return this.regexp ? this.regexp.test(value) : false;
	}

	public serialize(): string {
		const value = this.regexp
			? `/${this.regexp.source}/${this.regexp.ignoreCase ? 'i' : ''}`
			: '/invalid/';
		return `${this.key} =~ ${value}`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyRegexExpr {
		return mapFnc.mapRegex(this.key, this.regexp);
	}

	public negate(): ContextKeyExpr {
		return ContextKeyNotRegexExpr.create(this);
	}
}

export class ContextKeyNotRegexExpr implements ContextKeyExpr {

	public static create(actual: ContextKeyRegexExpr): ContextKeyExpr {
		return new ContextKeyNotRegexExpr(actual);
	}

	private constructor(private readonly _actual: ContextKeyRegexExpr) {
		//
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.NotRegex;
	}

	public cmp(other: ContextKeyNotRegexExpr): number {
		return this._actual.cmp(other._actual);
	}

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyNotRegexExpr) {
			return this._actual.equals(other._actual);
		}
		return false;
	}

	public evaluate(context: IContext): boolean {
		return !this._actual.evaluate(context);
	}

	public serialize(): string {
		throw new Error('Method not implemented.');
	}

	public keys(): string[] {
		return this._actual.keys();
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpr {
		return new ContextKeyNotRegexExpr(this._actual.map(mapFnc));
	}

	public negate(): ContextKeyExpr {
		return this._actual;
	}
}

export class ContextKeyAndExpr implements ContextKeyExpr {

	public static create(_expr: Array<ContextKeyExpr | null | undefined>): ContextKeyExpr | undefined {
		const expr = ContextKeyAndExpr._normalizeArr(_expr);
		if (expr.length === 0) {
			return undefined;
		}

		if (expr.length === 1) {
			return expr[0];
		}

		return new ContextKeyAndExpr(expr);
	}

	private constructor(public readonly expr: ContextKeyExpr[]) {
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.And;
	}

	public cmp(other: ContextKeyAndExpr): number {
		if (this.expr.length < other.expr.length) {
			return -1;
		}
		if (this.expr.length > other.expr.length) {
			return 1;
		}
		for (let i = 0, len = this.expr.length; i < len; i++) {
			const r = cmp(this.expr[i], other.expr[i]);
			if (r !== 0) {
				return r;
			}
		}
		return 0;
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

	public evaluate(context: IContext): boolean {
		for (let i = 0, len = this.expr.length; i < len; i++) {
			if (!this.expr[i].evaluate(context)) {
				return false;
			}
		}
		return true;
	}

	private static _normalizeArr(arr: Array<ContextKeyExpr | null | undefined>): ContextKeyExpr[] {
		let expr: ContextKeyExpr[] = [];

		if (arr) {
			for (let i = 0, len = arr.length; i < len; i++) {
				let e: ContextKeyExpr | null | undefined = arr[i];
				if (!e) {
					continue;
				}

				if (e instanceof ContextKeyAndExpr) {
					expr = expr.concat(e.expr);
					continue;
				}

				if (e instanceof ContextKeyOrExpr) {
					// Not allowed, because we don't have parens!
					throw new Error(`It is not allowed to have an or expression here due to lack of parens!`);
				}

				expr.push(e);
			}

			expr.sort(cmp);
		}

		return expr;
	}

	public serialize(): string {
		return this.expr.map(e => e.serialize()).join(' && ');
	}

	public keys(): string[] {
		const result: string[] = [];
		for (let expr of this.expr) {
			result.push(...expr.keys());
		}
		return result;
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpr {
		return new ContextKeyAndExpr(this.expr.map(expr => expr.map(mapFnc)));
	}

	public negate(): ContextKeyExpr {
		let result: ContextKeyExpr[] = [];
		for (let expr of this.expr) {
			result.push(expr.negate());
		}
		return ContextKeyOrExpr.create(result)!;
	}
}

export class ContextKeyOrExpr implements ContextKeyExpr {

	public static create(_expr: Array<ContextKeyExpr | null | undefined>): ContextKeyExpr | undefined {
		const expr = ContextKeyOrExpr._normalizeArr(_expr);
		if (expr.length === 0) {
			return undefined;
		}

		if (expr.length === 1) {
			return expr[0];
		}

		return new ContextKeyOrExpr(expr);
	}

	private constructor(public readonly expr: ContextKeyExpr[]) {
	}

	public getType(): ContextKeyExprType {
		return ContextKeyExprType.Or;
	}

	public equals(other: ContextKeyExpr): boolean {
		if (other instanceof ContextKeyOrExpr) {
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

	public evaluate(context: IContext): boolean {
		for (let i = 0, len = this.expr.length; i < len; i++) {
			if (this.expr[i].evaluate(context)) {
				return true;
			}
		}
		return false;
	}

	private static _normalizeArr(arr: Array<ContextKeyExpr | null | undefined>): ContextKeyExpr[] {
		let expr: ContextKeyExpr[] = [];

		if (arr) {
			for (let i = 0, len = arr.length; i < len; i++) {
				let e: ContextKeyExpr | null | undefined = arr[i];
				if (!e) {
					continue;
				}

				if (e instanceof ContextKeyOrExpr) {
					expr = expr.concat(e.expr);
					continue;
				}

				expr.push(e);
			}

			expr.sort(cmp);
		}

		return expr;
	}

	public serialize(): string {
		return this.expr.map(e => e.serialize()).join(' || ');
	}

	public keys(): string[] {
		const result: string[] = [];
		for (let expr of this.expr) {
			result.push(...expr.keys());
		}
		return result;
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpr {
		return new ContextKeyOrExpr(this.expr.map(expr => expr.map(mapFnc)));
	}

	public negate(): ContextKeyExpr {
		let result: ContextKeyExpr[] = [];
		for (let expr of this.expr) {
			result.push(expr.negate());
		}

		const terminals = (node: ContextKeyExpr) => {
			if (node instanceof ContextKeyOrExpr) {
				return node.expr;
			}
			return [node];
		};

		// We don't support parens, so here we distribute the AND over the OR terminals
		// We always take the first 2 AND pairs and distribute them
		while (result.length > 1) {
			const LEFT = result.shift()!;
			const RIGHT = result.shift()!;

			const all: ContextKeyExpr[] = [];
			for (const left of terminals(LEFT)) {
				for (const right of terminals(RIGHT)) {
					all.push(ContextKeyExpr.and(left, right)!);
				}
			}
			result.unshift(ContextKeyExpr.or(...all)!);
		}

		return result[0];
	}
}

export class RawContextKey<T> extends ContextKeyDefinedExpr {

	private _defaultValue: T | undefined;

	constructor(key: string, defaultValue: T | undefined) {
		super(key);
		this._defaultValue = defaultValue;
	}

	public bindTo(target: IContextKeyService): IContextKey<T> {
		return target.createKey(this.key, this._defaultValue);
	}

	public getValue(target: IContextKeyService): T | undefined {
		return target.getContextKeyValue<T>(this.key);
	}

	public toNegated(): ContextKeyExpr {
		return ContextKeyExpr.not(this.key);
	}

	public isEqualTo(value: string): ContextKeyExpr {
		return ContextKeyExpr.equals(this.key, value);
	}

	public notEqualsTo(value: string): ContextKeyExpr {
		return ContextKeyExpr.notEquals(this.key, value);
	}
}

export interface IContext {
	getValue<T>(key: string): T | undefined;
}

export interface IContextKey<T> {
	set(value: T): void;
	reset(): void;
	get(): T | undefined;
}

export interface IContextKeyServiceTarget {
	parentElement: IContextKeyServiceTarget | null;
	setAttribute(attr: string, value: string): void;
	removeAttribute(attr: string): void;
	hasAttribute(attr: string): boolean;
	getAttribute(attr: string): string | null;
}

export const IContextKeyService = createDecorator<IContextKeyService>('contextKeyService');

export interface IReadableSet<T> {
	has(value: T): boolean;
}

export interface IContextKeyChangeEvent {
	affectsSome(keys: IReadableSet<string>): boolean;
}

export interface IContextKeyService {
	_serviceBrand: any;
	dispose(): void;

	onDidChangeContext: Event<IContextKeyChangeEvent>;
	bufferChangeEvents(callback: Function): void;


	createKey<T>(key: string, defaultValue: T | undefined): IContextKey<T>;
	contextMatchesRules(rules: ContextKeyExpr | undefined): boolean;
	getContextKeyValue<T>(key: string): T | undefined;

	createScoped(target?: IContextKeyServiceTarget): IContextKeyService;
	getContext(target: IContextKeyServiceTarget | null): IContext;
}

export const SET_CONTEXT_COMMAND_ID = 'setContext';
