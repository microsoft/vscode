/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Types from 'vs/base/common/types';
import { IStringDictionary } from 'vs/base/common/collections';

export enum ValidationState {
	OK = 0,
	Info = 1,
	Warning = 2,
	Error = 3,
	Fatal = 4
}

export class ValidationStatus {
	private _state: ValidationState;

	constructor() {
		this._state = ValidationState.OK;
	}

	public get state(): ValidationState {
		return this._state;
	}

	public set state(value: ValidationState) {
		if (value > this._state) {
			this._state = value;
		}
	}

	public isOK(): boolean {
		return this._state === ValidationState.OK;
	}

	public isFatal(): boolean {
		return this._state === ValidationState.Fatal;
	}
}

export interface IProblemReporter {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	fatal(message: string): void;
	status: ValidationStatus;
}

export abstract class Parser {

	private _problemReporter: IProblemReporter;

	constructor(problemReporter: IProblemReporter) {
		this._problemReporter = problemReporter;
	}

	public reset(): void {
		this._problemReporter.status.state = ValidationState.OK;
	}

	public get problemReporter(): IProblemReporter {
		return this._problemReporter;
	}

	public info(message: string): void {
		this._problemReporter.info(message);
	}

	public warn(message: string): void {
		this._problemReporter.warn(message);
	}

	public error(message: string): void {
		this._problemReporter.error(message);
	}

	public fatal(message: string): void {
		this._problemReporter.fatal(message);
	}

	protected is(value: any, func: (value: any) => boolean, wrongTypeState?: ValidationState, wrongTypeMessage?: string, undefinedState?: ValidationState, undefinedMessage?: string): boolean {
		if (Types.isUndefined(value)) {
			if (undefinedState) {
				this._problemReporter.status.state = undefinedState;
			}
			if (undefinedMessage) {
				this._problemReporter.info(undefinedMessage);
			}
			return false;
		}
		if (!func(value)) {
			if (wrongTypeState) {
				this._problemReporter.status.state = wrongTypeState;
			}
			if (wrongTypeMessage) {
				this.info(wrongTypeMessage);
			}
			return false;
		}
		return true;
	}

	protected static merge<T>(destination: T, source: T, overwrite: boolean): void {
		Object.keys(source).forEach((key) => {
			let destValue = destination[key];
			let sourceValue = source[key];
			if (Types.isUndefined(sourceValue)) {
				return;
			}
			if (Types.isUndefined(destValue)) {
				destination[key] = sourceValue;
			} else {
				if (overwrite) {
					if (Types.isObject(destValue) && Types.isObject(sourceValue)) {
						this.merge(destValue, sourceValue, overwrite);
					} else {
						destination[key] = sourceValue;
					}
				}
			}
		});
	}
}

export interface ISystemVariables {
	resolve(value: string): string;
	resolve(value: string[]): string[];
	resolve(value: IStringDictionary<string>): IStringDictionary<string>;
	resolve(value: IStringDictionary<string[]>): IStringDictionary<string[]>;
	resolve(value: IStringDictionary<IStringDictionary<string>>): IStringDictionary<IStringDictionary<string>>;
	resolveAny<T>(value: T): T;
	[key: string]: any;
}

export abstract class AbstractSystemVariables implements ISystemVariables {

	public resolve(value: string): string;
	public resolve(value: string[]): string[];
	public resolve(value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(value: IStringDictionary<string[]>): IStringDictionary<string[]>;
	public resolve(value: IStringDictionary<IStringDictionary<string>>): IStringDictionary<IStringDictionary<string>>;
	public resolve(value: any): any {
		if (Types.isString(value)) {
			return this.resolveString(value);
		} else if (Types.isArray(value)) {
			return this.__resolveArray(value);
		} else if (Types.isObject(value)) {
			return this.__resolveLiteral(value);
		}

		return value;
	}

	resolveAny<T>(value: T): T;
	resolveAny<T>(value: any): any {
		if (Types.isString(value)) {
			return this.resolveString(value);
		} else if (Types.isArray(value)) {
			return this.__resolveAnyArray(value);
		} else if (Types.isObject(value)) {
			return this.__resolveAnyLiteral(value);
		}

		return value;
	}

	protected resolveString(value: string): string {
		let regexp = /\$\{(.*?)\}/g;
		return value.replace(regexp, (match: string, name: string) => {
			let newValue = (<any>this)[name];
			if (Types.isString(newValue)) {
				return newValue;
			} else {
				return match && match.indexOf('env.') > 0 ? '' : match;
			}
		});
	}

	private __resolveLiteral(values: IStringDictionary<string | IStringDictionary<string> | string[]>): IStringDictionary<string | IStringDictionary<string> | string[]> {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolve(<any>value);
		});
		return result;
	}

	private __resolveAnyLiteral<T>(values: T): T;
	private __resolveAnyLiteral<T>(values: any): any {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolveAny(<any>value);
		});
		return result;
	}

	private __resolveArray(value: string[]): string[] {
		return value.map(s => this.resolveString(s));
	}

	private __resolveAnyArray<T>(value: T[]): T[];
	private __resolveAnyArray(value: any[]): any[] {
		return value.map(s => this.resolveAny(s));
	}
}