/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { isChrome, isEdge, isFirefox, isLinux, isMacintosh, isSafari, isWeb, isWindows } from 'vs/base/common/platform';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

const CONSTANT_VALUES = new Map<string, boolean>();
CONSTANT_VALUES.set('false', false);
CONSTANT_VALUES.set('true', true);
CONSTANT_VALUES.set('isMac', isMacintosh);
CONSTANT_VALUES.set('isLinux', isLinux);
CONSTANT_VALUES.set('isWindows', isWindows);
CONSTANT_VALUES.set('isWeb', isWeb);
CONSTANT_VALUES.set('isMacNative', isMacintosh && !isWeb);
CONSTANT_VALUES.set('isEdge', isEdge);
CONSTANT_VALUES.set('isFirefox', isFirefox);
CONSTANT_VALUES.set('isChrome', isChrome);
CONSTANT_VALUES.set('isSafari', isSafari);

const hasOwnProperty = Object.prototype.hasOwnProperty;

export const enum ContextKeyExprType {
	False = 0,
	True = 1,
	Defined = 2,
	Not = 3,
	Equals = 4,
	NotEquals = 5,
	And = 6,
	Regex = 7,
	NotRegex = 8,
	Or = 9,
	In = 10,
	NotIn = 11,
	Greater = 12,
	GreaterEquals = 13,
	Smaller = 14,
	SmallerEquals = 15,
}

export interface IContextKeyExprMapper {
	mapDefined(key: string): ContextKeyExpression;
	mapNot(key: string): ContextKeyExpression;
	mapEquals(key: string, value: any): ContextKeyExpression;
	mapNotEquals(key: string, value: any): ContextKeyExpression;
	mapGreater(key: string, value: any): ContextKeyExpression;
	mapGreaterEquals(key: string, value: any): ContextKeyExpression;
	mapSmaller(key: string, value: any): ContextKeyExpression;
	mapSmallerEquals(key: string, value: any): ContextKeyExpression;
	mapRegex(key: string, regexp: RegExp | null): ContextKeyRegexExpr;
	mapIn(key: string, valueKey: string): ContextKeyInExpr;
	mapNotIn(key: string, valueKey: string): ContextKeyNotInExpr;
}

export interface IContextKeyExpression {
	cmp(other: ContextKeyExpression): number;
	equals(other: ContextKeyExpression): boolean;
	substituteConstants(): ContextKeyExpression | undefined;
	evaluate(context: IContext): boolean;
	serialize(): string;
	keys(): string[];
	map(mapFnc: IContextKeyExprMapper): ContextKeyExpression;
	negate(): ContextKeyExpression;

}

export type ContextKeyExpression = (
	ContextKeyFalseExpr | ContextKeyTrueExpr | ContextKeyDefinedExpr | ContextKeyNotExpr
	| ContextKeyEqualsExpr | ContextKeyNotEqualsExpr | ContextKeyRegexExpr
	| ContextKeyNotRegexExpr | ContextKeyAndExpr | ContextKeyOrExpr | ContextKeyInExpr
	| ContextKeyNotInExpr | ContextKeyGreaterExpr | ContextKeyGreaterEqualsExpr
	| ContextKeySmallerExpr | ContextKeySmallerEqualsExpr
);

export abstract class ContextKeyExpr {

	public static false(): ContextKeyExpression {
		return ContextKeyFalseExpr.INSTANCE;
	}
	public static true(): ContextKeyExpression {
		return ContextKeyTrueExpr.INSTANCE;
	}
	public static has(key: string): ContextKeyExpression {
		return ContextKeyDefinedExpr.create(key);
	}
	public static equals(key: string, value: any): ContextKeyExpression {
		return ContextKeyEqualsExpr.create(key, value);
	}
	public static notEquals(key: string, value: any): ContextKeyExpression {
		return ContextKeyNotEqualsExpr.create(key, value);
	}
	public static regex(key: string, value: RegExp): ContextKeyExpression {
		return ContextKeyRegexExpr.create(key, value);
	}
	public static in(key: string, value: string): ContextKeyExpression {
		return ContextKeyInExpr.create(key, value);
	}
	public static notIn(key: string, value: string): ContextKeyExpression {
		return ContextKeyNotInExpr.create(key, value);
	}
	public static not(key: string): ContextKeyExpression {
		return ContextKeyNotExpr.create(key);
	}
	public static and(...expr: Array<ContextKeyExpression | undefined | null>): ContextKeyExpression | undefined {
		return ContextKeyAndExpr.create(expr, null);
	}
	public static or(...expr: Array<ContextKeyExpression | undefined | null>): ContextKeyExpression | undefined {
		return ContextKeyOrExpr.create(expr, null, true);
	}
	public static greater(key: string, value: number): ContextKeyExpression {
		return ContextKeyGreaterExpr.create(key, value);
	}
	public static greaterEquals(key: string, value: number): ContextKeyExpression {
		return ContextKeyGreaterEqualsExpr.create(key, value);
	}
	public static smaller(key: string, value: number): ContextKeyExpression {
		return ContextKeySmallerExpr.create(key, value);
	}
	public static smallerEquals(key: string, value: number): ContextKeyExpression {
		return ContextKeySmallerEqualsExpr.create(key, value);
	}

	public static deserialize(serialized: string | null | undefined, strict: boolean = false): ContextKeyExpression | undefined {
		if (!serialized) {
			return undefined;
		}

		return this._deserializeOrExpression(serialized, strict);
	}

	private static _deserializeOrExpression(serialized: string, strict: boolean): ContextKeyExpression | undefined {
		const pieces = serialized.split('||');
		return ContextKeyOrExpr.create(pieces.map(p => this._deserializeAndExpression(p, strict)), null, true);
	}

	private static _deserializeAndExpression(serialized: string, strict: boolean): ContextKeyExpression | undefined {
		const pieces = serialized.split('&&');
		return ContextKeyAndExpr.create(pieces.map(p => this._deserializeOne(p, strict)), null);
	}

	private static _deserializeOne(serializedOne: string, strict: boolean): ContextKeyExpression {
		serializedOne = serializedOne.trim();

		if (serializedOne.indexOf('!=') >= 0) {
			const pieces = serializedOne.split('!=');
			return ContextKeyNotEqualsExpr.create(pieces[0].trim(), this._deserializeValue(pieces[1], strict));
		}

		if (serializedOne.indexOf('==') >= 0) {
			const pieces = serializedOne.split('==');
			return ContextKeyEqualsExpr.create(pieces[0].trim(), this._deserializeValue(pieces[1], strict));
		}

		if (serializedOne.indexOf('=~') >= 0) {
			const pieces = serializedOne.split('=~');
			return ContextKeyRegexExpr.create(pieces[0].trim(), this._deserializeRegexValue(pieces[1], strict));
		}

		if (serializedOne.indexOf(' not in ') >= 0) {
			const pieces = serializedOne.split(' not in ');
			return ContextKeyNotInExpr.create(pieces[0].trim(), pieces[1].trim());
		}

		if (serializedOne.indexOf(' in ') >= 0) {
			const pieces = serializedOne.split(' in ');
			return ContextKeyInExpr.create(pieces[0].trim(), pieces[1].trim());
		}

		if (/^[^<=>]+>=[^<=>]+$/.test(serializedOne)) {
			const pieces = serializedOne.split('>=');
			return ContextKeyGreaterEqualsExpr.create(pieces[0].trim(), pieces[1].trim());
		}

		if (/^[^<=>]+>[^<=>]+$/.test(serializedOne)) {
			const pieces = serializedOne.split('>');
			return ContextKeyGreaterExpr.create(pieces[0].trim(), pieces[1].trim());
		}

		if (/^[^<=>]+<=[^<=>]+$/.test(serializedOne)) {
			const pieces = serializedOne.split('<=');
			return ContextKeySmallerEqualsExpr.create(pieces[0].trim(), pieces[1].trim());
		}

		if (/^[^<=>]+<[^<=>]+$/.test(serializedOne)) {
			const pieces = serializedOne.split('<');
			return ContextKeySmallerExpr.create(pieces[0].trim(), pieces[1].trim());
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

		const m = /^'([^']*)'$/.exec(serializedValue);
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

		const start = serializedValue.indexOf('/');
		const end = serializedValue.lastIndexOf('/');
		if (start === end || start < 0 /* || to < 0 */) {
			if (strict) {
				throw new Error(`bad regexp-value '${serializedValue}', missing /-enclosure`);
			} else {
				console.warn(`bad regexp-value '${serializedValue}', missing /-enclosure`);
			}
			return null;
		}

		const value = serializedValue.slice(start + 1, end);
		const caseIgnoreFlag = serializedValue[end + 1] === 'i' ? 'i' : '';
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
}

export function expressionsAreEqualWithConstantSubstitution(a: ContextKeyExpression | null | undefined, b: ContextKeyExpression | null | undefined): boolean {
	const aExpr = a ? a.substituteConstants() : undefined;
	const bExpr = b ? b.substituteConstants() : undefined;
	if (!aExpr && !bExpr) {
		return true;
	}
	if (!aExpr || !bExpr) {
		return false;
	}
	return aExpr.equals(bExpr);
}

function cmp(a: ContextKeyExpression, b: ContextKeyExpression): number {
	return a.cmp(b);
}

export class ContextKeyFalseExpr implements IContextKeyExpression {
	public static INSTANCE = new ContextKeyFalseExpr();

	public readonly type = ContextKeyExprType.False;

	protected constructor() {
	}

	public cmp(other: ContextKeyExpression): number {
		return this.type - other.type;
	}

	public equals(other: ContextKeyExpression): boolean {
		return (other.type === this.type);
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		return false;
	}

	public serialize(): string {
		return 'false';
	}

	public keys(): string[] {
		return [];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return this;
	}

	public negate(): ContextKeyExpression {
		return ContextKeyTrueExpr.INSTANCE;
	}
}

export class ContextKeyTrueExpr implements IContextKeyExpression {
	public static INSTANCE = new ContextKeyTrueExpr();

	public readonly type = ContextKeyExprType.True;

	protected constructor() {
	}

	public cmp(other: ContextKeyExpression): number {
		return this.type - other.type;
	}

	public equals(other: ContextKeyExpression): boolean {
		return (other.type === this.type);
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		return true;
	}

	public serialize(): string {
		return 'true';
	}

	public keys(): string[] {
		return [];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return this;
	}

	public negate(): ContextKeyExpression {
		return ContextKeyFalseExpr.INSTANCE;
	}
}

export class ContextKeyDefinedExpr implements IContextKeyExpression {
	public static create(key: string, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		const constantValue = CONSTANT_VALUES.get(key);
		if (typeof constantValue === 'boolean') {
			return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
		}
		return new ContextKeyDefinedExpr(key, negated);
	}

	public readonly type = ContextKeyExprType.Defined;

	protected constructor(
		readonly key: string,
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp1(this.key, other.key);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		const constantValue = CONSTANT_VALUES.get(this.key);
		if (typeof constantValue === 'boolean') {
			return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
		}
		return this;
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

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapDefined(this.key);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyNotExpr.create(this.key, this);
		}
		return this.negated;
	}
}

export class ContextKeyEqualsExpr implements IContextKeyExpression {

	public static create(key: string, value: any, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		if (typeof value === 'boolean') {
			return (value ? ContextKeyDefinedExpr.create(key, negated) : ContextKeyNotExpr.create(key, negated));
		}
		const constantValue = CONSTANT_VALUES.get(key);
		if (typeof constantValue === 'boolean') {
			const trueValue = constantValue ? 'true' : 'false';
			return (value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE);
		}
		return new ContextKeyEqualsExpr(key, value, negated);
	}

	public readonly type = ContextKeyExprType.Equals;

	private constructor(
		private readonly key: string,
		private readonly value: any,
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp2(this.key, this.value, other.key, other.value);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		const constantValue = CONSTANT_VALUES.get(this.key);
		if (typeof constantValue === 'boolean') {
			const trueValue = constantValue ? 'true' : 'false';
			return (this.value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE);
		}
		return this;
	}

	public evaluate(context: IContext): boolean {
		// Intentional ==
		// eslint-disable-next-line eqeqeq
		return (context.getValue(this.key) == this.value);
	}

	public serialize(): string {
		return `${this.key} == '${this.value}'`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapEquals(this.key, this.value);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyNotEqualsExpr.create(this.key, this.value, this);
		}
		return this.negated;
	}
}

export class ContextKeyInExpr implements IContextKeyExpression {

	public static create(key: string, valueKey: string): ContextKeyInExpr {
		return new ContextKeyInExpr(key, valueKey);
	}

	public readonly type = ContextKeyExprType.In;
	private negated: ContextKeyExpression | null = null;

	private constructor(
		private readonly key: string,
		private readonly valueKey: string,
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp2(this.key, this.valueKey, other.key, other.valueKey);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key && this.valueKey === other.valueKey);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		const source = context.getValue(this.valueKey);

		const item = context.getValue(this.key);

		if (Array.isArray(source)) {
			return source.includes(item as any);
		}

		if (typeof item === 'string' && typeof source === 'object' && source !== null) {
			return hasOwnProperty.call(source, item);
		}
		return false;
	}

	public serialize(): string {
		return `${this.key} in '${this.valueKey}'`;
	}

	public keys(): string[] {
		return [this.key, this.valueKey];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyInExpr {
		return mapFnc.mapIn(this.key, this.valueKey);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyNotInExpr.create(this.key, this.valueKey);
		}
		return this.negated;
	}
}

export class ContextKeyNotInExpr implements IContextKeyExpression {

	public static create(key: string, valueKey: string): ContextKeyNotInExpr {
		return new ContextKeyNotInExpr(key, valueKey);
	}

	public readonly type = ContextKeyExprType.NotIn;

	private readonly _negated: ContextKeyInExpr;

	private constructor(
		private readonly key: string,
		private readonly valueKey: string,
	) {
		this._negated = ContextKeyInExpr.create(key, valueKey);
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return this._negated.cmp(other._negated);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return this._negated.equals(other._negated);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		return !this._negated.evaluate(context);
	}

	public serialize(): string {
		return `${this.key} not in '${this.valueKey}'`;
	}

	public keys(): string[] {
		return this._negated.keys();
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapNotIn(this.key, this.valueKey);
	}

	public negate(): ContextKeyExpression {
		return this._negated;
	}
}

export class ContextKeyNotEqualsExpr implements IContextKeyExpression {

	public static create(key: string, value: any, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		if (typeof value === 'boolean') {
			if (value) {
				return ContextKeyNotExpr.create(key, negated);
			}
			return ContextKeyDefinedExpr.create(key, negated);
		}
		const constantValue = CONSTANT_VALUES.get(key);
		if (typeof constantValue === 'boolean') {
			const falseValue = constantValue ? 'true' : 'false';
			return (value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
		}
		return new ContextKeyNotEqualsExpr(key, value, negated);
	}

	public readonly type = ContextKeyExprType.NotEquals;

	private constructor(
		private readonly key: string,
		private readonly value: any,
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp2(this.key, this.value, other.key, other.value);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		const constantValue = CONSTANT_VALUES.get(this.key);
		if (typeof constantValue === 'boolean') {
			const falseValue = constantValue ? 'true' : 'false';
			return (this.value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
		}
		return this;
	}

	public evaluate(context: IContext): boolean {
		// Intentional !=
		// eslint-disable-next-line eqeqeq
		return (context.getValue(this.key) != this.value);
	}

	public serialize(): string {
		return `${this.key} != '${this.value}'`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapNotEquals(this.key, this.value);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyEqualsExpr.create(this.key, this.value, this);
		}
		return this.negated;
	}
}

export class ContextKeyNotExpr implements IContextKeyExpression {

	public static create(key: string, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		const constantValue = CONSTANT_VALUES.get(key);
		if (typeof constantValue === 'boolean') {
			return (constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
		}
		return new ContextKeyNotExpr(key, negated);
	}

	public readonly type = ContextKeyExprType.Not;

	private constructor(
		private readonly key: string,
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp1(this.key, other.key);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		const constantValue = CONSTANT_VALUES.get(this.key);
		if (typeof constantValue === 'boolean') {
			return (constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
		}
		return this;
	}

	public evaluate(context: IContext): boolean {
		return (!context.getValue(this.key));
	}

	public serialize(): string {
		return `!${this.key}`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapNot(this.key);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyDefinedExpr.create(this.key, this);
		}
		return this.negated;
	}
}

function withFloatOrStr<T extends ContextKeyExpression>(value: any, callback: (value: number | string) => T): T | ContextKeyFalseExpr {
	if (typeof value === 'string') {
		const n = parseFloat(value);
		if (!isNaN(n)) {
			value = n;
		}
	}
	if (typeof value === 'string' || typeof value === 'number') {
		return callback(value);
	}
	return ContextKeyFalseExpr.INSTANCE;
}

export class ContextKeyGreaterExpr implements IContextKeyExpression {

	public static create(key: string, _value: any, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		return withFloatOrStr(_value, (value) => new ContextKeyGreaterExpr(key, value, negated));
	}

	public readonly type = ContextKeyExprType.Greater;

	private constructor(
		private readonly key: string,
		private readonly value: number | string,
		private negated: ContextKeyExpression | null
	) { }

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp2(this.key, this.value, other.key, other.value);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		if (typeof this.value === 'string') {
			return false;
		}
		return (parseFloat(<any>context.getValue(this.key)) > this.value);
	}

	public serialize(): string {
		return `${this.key} > ${this.value}`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapGreater(this.key, this.value);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeySmallerEqualsExpr.create(this.key, this.value, this);
		}
		return this.negated;
	}
}

export class ContextKeyGreaterEqualsExpr implements IContextKeyExpression {

	public static create(key: string, _value: any, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		return withFloatOrStr(_value, (value) => new ContextKeyGreaterEqualsExpr(key, value, negated));
	}

	public readonly type = ContextKeyExprType.GreaterEquals;

	private constructor(
		private readonly key: string,
		private readonly value: number | string,
		private negated: ContextKeyExpression | null
	) { }

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp2(this.key, this.value, other.key, other.value);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		if (typeof this.value === 'string') {
			return false;
		}
		return (parseFloat(<any>context.getValue(this.key)) >= this.value);
	}

	public serialize(): string {
		return `${this.key} >= ${this.value}`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapGreaterEquals(this.key, this.value);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeySmallerExpr.create(this.key, this.value, this);
		}
		return this.negated;
	}
}

export class ContextKeySmallerExpr implements IContextKeyExpression {

	public static create(key: string, _value: any, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		return withFloatOrStr(_value, (value) => new ContextKeySmallerExpr(key, value, negated));
	}

	public readonly type = ContextKeyExprType.Smaller;

	private constructor(
		private readonly key: string,
		private readonly value: number | string,
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp2(this.key, this.value, other.key, other.value);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		if (typeof this.value === 'string') {
			return false;
		}
		return (parseFloat(<any>context.getValue(this.key)) < this.value);
	}

	public serialize(): string {
		return `${this.key} < ${this.value}`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapSmaller(this.key, this.value);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyGreaterEqualsExpr.create(this.key, this.value, this);
		}
		return this.negated;
	}
}

export class ContextKeySmallerEqualsExpr implements IContextKeyExpression {

	public static create(key: string, _value: any, negated: ContextKeyExpression | null = null): ContextKeyExpression {
		return withFloatOrStr(_value, (value) => new ContextKeySmallerEqualsExpr(key, value, negated));
	}

	public readonly type = ContextKeyExprType.SmallerEquals;

	private constructor(
		private readonly key: string,
		private readonly value: number | string,
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return cmp2(this.key, this.value, other.key, other.value);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return (this.key === other.key && this.value === other.value);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		if (typeof this.value === 'string') {
			return false;
		}
		return (parseFloat(<any>context.getValue(this.key)) <= this.value);
	}

	public serialize(): string {
		return `${this.key} <= ${this.value}`;
	}

	public keys(): string[] {
		return [this.key];
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return mapFnc.mapSmallerEquals(this.key, this.value);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyGreaterExpr.create(this.key, this.value, this);
		}
		return this.negated;
	}
}

export class ContextKeyRegexExpr implements IContextKeyExpression {

	public static create(key: string, regexp: RegExp | null): ContextKeyRegexExpr {
		return new ContextKeyRegexExpr(key, regexp);
	}

	public readonly type = ContextKeyExprType.Regex;
	private negated: ContextKeyExpression | null = null;

	private constructor(
		private readonly key: string,
		private readonly regexp: RegExp | null
	) {
		//
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
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

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			const thisSource = this.regexp ? this.regexp.source : '';
			const otherSource = other.regexp ? other.regexp.source : '';
			return (this.key === other.key && thisSource === otherSource);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
	}

	public evaluate(context: IContext): boolean {
		const value = context.getValue<any>(this.key);
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

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			this.negated = ContextKeyNotRegexExpr.create(this);
		}
		return this.negated;
	}
}

export class ContextKeyNotRegexExpr implements IContextKeyExpression {

	public static create(actual: ContextKeyRegexExpr): ContextKeyExpression {
		return new ContextKeyNotRegexExpr(actual);
	}

	public readonly type = ContextKeyExprType.NotRegex;

	private constructor(private readonly _actual: ContextKeyRegexExpr) {
		//
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
		return this._actual.cmp(other._actual);
	}

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
			return this._actual.equals(other._actual);
		}
		return false;
	}

	public substituteConstants(): ContextKeyExpression | undefined {
		return this;
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

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return new ContextKeyNotRegexExpr(this._actual.map(mapFnc));
	}

	public negate(): ContextKeyExpression {
		return this._actual;
	}
}

/**
 * @returns the same instance if nothing changed.
 */
function eliminateConstantsInArray(arr: ContextKeyExpression[]): (ContextKeyExpression | undefined)[] {
	// Allocate array only if there is a difference
	let newArr: (ContextKeyExpression | undefined)[] | null = null;
	for (let i = 0, len = arr.length; i < len; i++) {
		const newExpr = arr[i].substituteConstants();

		if (arr[i] !== newExpr) {
			// something has changed!

			// allocate array on first difference
			if (newArr === null) {
				newArr = [];
				for (let j = 0; j < i; j++) {
					newArr[j] = arr[j];
				}
			}
		}

		if (newArr !== null) {
			newArr[i] = newExpr;
		}
	}

	if (newArr === null) {
		return arr;
	}
	return newArr;
}

class ContextKeyAndExpr implements IContextKeyExpression {

	public static create(_expr: ReadonlyArray<ContextKeyExpression | null | undefined>, negated: ContextKeyExpression | null): ContextKeyExpression | undefined {
		return ContextKeyAndExpr._normalizeArr(_expr, negated);
	}

	public readonly type = ContextKeyExprType.And;

	private constructor(
		public readonly expr: ContextKeyExpression[],
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
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

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
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

	public substituteConstants(): ContextKeyExpression | undefined {
		const exprArr = eliminateConstantsInArray(this.expr);
		if (exprArr === this.expr) {
			// no change
			return this;
		}
		return ContextKeyAndExpr.create(exprArr, this.negated);
	}

	public evaluate(context: IContext): boolean {
		for (let i = 0, len = this.expr.length; i < len; i++) {
			if (!this.expr[i].evaluate(context)) {
				return false;
			}
		}
		return true;
	}

	private static _normalizeArr(arr: ReadonlyArray<ContextKeyExpression | null | undefined>, negated: ContextKeyExpression | null): ContextKeyExpression | undefined {
		const expr: ContextKeyExpression[] = [];
		let hasTrue = false;

		for (const e of arr) {
			if (!e) {
				continue;
			}

			if (e.type === ContextKeyExprType.True) {
				// anything && true ==> anything
				hasTrue = true;
				continue;
			}

			if (e.type === ContextKeyExprType.False) {
				// anything && false ==> false
				return ContextKeyFalseExpr.INSTANCE;
			}

			if (e.type === ContextKeyExprType.And) {
				expr.push(...e.expr);
				continue;
			}

			expr.push(e);
		}

		if (expr.length === 0 && hasTrue) {
			return ContextKeyTrueExpr.INSTANCE;
		}

		if (expr.length === 0) {
			return undefined;
		}

		if (expr.length === 1) {
			return expr[0];
		}

		expr.sort(cmp);

		// eliminate duplicate terms
		for (let i = 1; i < expr.length; i++) {
			if (expr[i - 1].equals(expr[i])) {
				expr.splice(i, 1);
				i--;
			}
		}

		if (expr.length === 1) {
			return expr[0];
		}

		// We must distribute any OR expression because we don't support parens
		// OR extensions will be at the end (due to sorting rules)
		while (expr.length > 1) {
			const lastElement = expr[expr.length - 1];
			if (lastElement.type !== ContextKeyExprType.Or) {
				break;
			}
			// pop the last element
			expr.pop();

			// pop the second to last element
			const secondToLastElement = expr.pop()!;

			const isFinished = (expr.length === 0);

			// distribute `lastElement` over `secondToLastElement`
			const resultElement = ContextKeyOrExpr.create(
				lastElement.expr.map(el => ContextKeyAndExpr.create([el, secondToLastElement], null)),
				null,
				isFinished
			);

			if (resultElement) {
				expr.push(resultElement);
				expr.sort(cmp);
			}
		}

		if (expr.length === 1) {
			return expr[0];
		}

		return new ContextKeyAndExpr(expr, negated);
	}

	public serialize(): string {
		return this.expr.map(e => e.serialize()).join(' && ');
	}

	public keys(): string[] {
		const result: string[] = [];
		for (const expr of this.expr) {
			result.push(...expr.keys());
		}
		return result;
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return new ContextKeyAndExpr(this.expr.map(expr => expr.map(mapFnc)), null);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			const result: ContextKeyExpression[] = [];
			for (const expr of this.expr) {
				result.push(expr.negate());
			}
			this.negated = ContextKeyOrExpr.create(result, this, true)!;
		}
		return this.negated;
	}
}

class ContextKeyOrExpr implements IContextKeyExpression {

	public static create(_expr: ReadonlyArray<ContextKeyExpression | null | undefined>, negated: ContextKeyExpression | null, extraRedundantCheck: boolean): ContextKeyExpression | undefined {
		return ContextKeyOrExpr._normalizeArr(_expr, negated, extraRedundantCheck);
	}

	public readonly type = ContextKeyExprType.Or;

	private constructor(
		public readonly expr: ContextKeyExpression[],
		private negated: ContextKeyExpression | null
	) {
	}

	public cmp(other: ContextKeyExpression): number {
		if (other.type !== this.type) {
			return this.type - other.type;
		}
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

	public equals(other: ContextKeyExpression): boolean {
		if (other.type === this.type) {
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

	public substituteConstants(): ContextKeyExpression | undefined {
		const exprArr = eliminateConstantsInArray(this.expr);
		if (exprArr === this.expr) {
			// no change
			return this;
		}
		return ContextKeyOrExpr.create(exprArr, this.negated, false);
	}

	public evaluate(context: IContext): boolean {
		for (let i = 0, len = this.expr.length; i < len; i++) {
			if (this.expr[i].evaluate(context)) {
				return true;
			}
		}
		return false;
	}

	private static _normalizeArr(arr: ReadonlyArray<ContextKeyExpression | null | undefined>, negated: ContextKeyExpression | null, extraRedundantCheck: boolean): ContextKeyExpression | undefined {
		let expr: ContextKeyExpression[] = [];
		let hasFalse = false;

		if (arr) {
			for (let i = 0, len = arr.length; i < len; i++) {
				const e = arr[i];
				if (!e) {
					continue;
				}

				if (e.type === ContextKeyExprType.False) {
					// anything || false ==> anything
					hasFalse = true;
					continue;
				}

				if (e.type === ContextKeyExprType.True) {
					// anything || true ==> true
					return ContextKeyTrueExpr.INSTANCE;
				}

				if (e.type === ContextKeyExprType.Or) {
					expr = expr.concat(e.expr);
					continue;
				}

				expr.push(e);
			}

			if (expr.length === 0 && hasFalse) {
				return ContextKeyFalseExpr.INSTANCE;
			}

			expr.sort(cmp);
		}

		if (expr.length === 0) {
			return undefined;
		}

		if (expr.length === 1) {
			return expr[0];
		}

		// eliminate duplicate terms
		for (let i = 1; i < expr.length; i++) {
			if (expr[i - 1].equals(expr[i])) {
				expr.splice(i, 1);
				i--;
			}
		}

		if (expr.length === 1) {
			return expr[0];
		}

		// eliminate redundant terms
		if (extraRedundantCheck) {
			for (let i = 0; i < expr.length; i++) {
				for (let j = i + 1; j < expr.length; j++) {
					if (implies(expr[i], expr[j])) {
						expr.splice(j, 1);
						j--;
					}
				}
			}

			if (expr.length === 1) {
				return expr[0];
			}
		}

		return new ContextKeyOrExpr(expr, negated);
	}

	public serialize(): string {
		return this.expr.map(e => e.serialize()).join(' || ');
	}

	public keys(): string[] {
		const result: string[] = [];
		for (const expr of this.expr) {
			result.push(...expr.keys());
		}
		return result;
	}

	public map(mapFnc: IContextKeyExprMapper): ContextKeyExpression {
		return new ContextKeyOrExpr(this.expr.map(expr => expr.map(mapFnc)), null);
	}

	public negate(): ContextKeyExpression {
		if (!this.negated) {
			const result: ContextKeyExpression[] = [];
			for (const expr of this.expr) {
				result.push(expr.negate());
			}

			// We don't support parens, so here we distribute the AND over the OR terminals
			// We always take the first 2 AND pairs and distribute them
			while (result.length > 1) {
				const LEFT = result.shift()!;
				const RIGHT = result.shift()!;

				const all: ContextKeyExpression[] = [];
				for (const left of getTerminals(LEFT)) {
					for (const right of getTerminals(RIGHT)) {
						all.push(ContextKeyAndExpr.create([left, right], null)!);
					}
				}

				const isFinished = (result.length === 0);
				result.unshift(ContextKeyOrExpr.create(all, null, isFinished)!);
			}

			this.negated = result[0];
		}
		return this.negated;
	}
}

export interface ContextKeyInfo {
	readonly key: string;
	readonly type?: string;
	readonly description?: string;
}

export class RawContextKey<T extends ContextKeyValue> extends ContextKeyDefinedExpr {

	private static _info: ContextKeyInfo[] = [];

	static all(): IterableIterator<ContextKeyInfo> {
		return RawContextKey._info.values();
	}

	private readonly _defaultValue: T | undefined;

	constructor(key: string, defaultValue: T | undefined, metaOrHide?: string | true | { type: string; description: string }) {
		super(key, null);
		this._defaultValue = defaultValue;

		// collect all context keys into a central place
		if (typeof metaOrHide === 'object') {
			RawContextKey._info.push({ ...metaOrHide, key });
		} else if (metaOrHide !== true) {
			RawContextKey._info.push({ key, description: metaOrHide, type: defaultValue !== null && defaultValue !== undefined ? typeof defaultValue : undefined });
		}
	}

	public bindTo(target: IContextKeyService): IContextKey<T> {
		return target.createKey(this.key, this._defaultValue);
	}

	public getValue(target: IContextKeyService): T | undefined {
		return target.getContextKeyValue<T>(this.key);
	}

	public toNegated(): ContextKeyExpression {
		return this.negate();
	}

	public isEqualTo(value: any): ContextKeyExpression {
		return ContextKeyEqualsExpr.create(this.key, value);
	}

	public notEqualsTo(value: any): ContextKeyExpression {
		return ContextKeyNotEqualsExpr.create(this.key, value);
	}
}

export type ContextKeyValue = null | undefined | boolean | number | string
	| Array<null | undefined | boolean | number | string>
	| Record<string, null | undefined | boolean | number | string>;

export interface IContext {
	getValue<T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined;
}

export interface IContextKey<T extends ContextKeyValue = ContextKeyValue> {
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
	allKeysContainedIn(keys: IReadableSet<string>): boolean;
}

export interface IContextKeyService {
	readonly _serviceBrand: undefined;
	dispose(): void;

	onDidChangeContext: Event<IContextKeyChangeEvent>;

	createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): IContextKey<T>;
	contextMatchesRules(rules: ContextKeyExpression | undefined): boolean;
	getContextKeyValue<T>(key: string): T | undefined;

	createScoped(target: IContextKeyServiceTarget): IContextKeyService;
	createOverlay(overlay: Iterable<[string, any]>): IContextKeyService;
	getContext(target: IContextKeyServiceTarget | null): IContext;

	updateParent(parentContextKeyService: IContextKeyService): void;
}

export const SET_CONTEXT_COMMAND_ID = 'setContext';

function cmp1(key1: string, key2: string): number {
	if (key1 < key2) {
		return -1;
	}
	if (key1 > key2) {
		return 1;
	}
	return 0;
}

function cmp2(key1: string, value1: any, key2: string, value2: any): number {
	if (key1 < key2) {
		return -1;
	}
	if (key1 > key2) {
		return 1;
	}
	if (value1 < value2) {
		return -1;
	}
	if (value1 > value2) {
		return 1;
	}
	return 0;
}

/**
 * Returns true if it is provable `p` implies `q`.
 */
export function implies(p: ContextKeyExpression, q: ContextKeyExpression): boolean {

	if (q.type === ContextKeyExprType.And && (p.type !== ContextKeyExprType.Or && p.type !== ContextKeyExprType.And)) {
		// covers the case: A implies A && B
		for (const qTerm of q.expr) {
			if (p.equals(qTerm)) {
				return true;
			}
		}
	}

	const notP = p.negate();
	const expr = getTerminals(notP).concat(getTerminals(q));
	expr.sort(cmp);

	for (let i = 0; i < expr.length; i++) {
		const a = expr[i];
		const notA = a.negate();
		for (let j = i + 1; j < expr.length; j++) {
			const b = expr[j];
			if (notA.equals(b)) {
				return true;
			}
		}
	}

	return false;
}

function getTerminals(node: ContextKeyExpression) {
	if (node.type === ContextKeyExprType.Or) {
		return node.expr;
	}
	return [node];
}
