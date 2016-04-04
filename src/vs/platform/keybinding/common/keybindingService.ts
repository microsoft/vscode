/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {Keybinding} from 'vs/base/common/keyCodes';
import {TypeConstraint} from 'vs/base/common/types';
import {TPromise} from 'vs/base/common/winjs.base';
import {ServiceIdentifier, ServicesAccessor, createDecorator} from 'vs/platform/instantiation/common/instantiation';

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

export interface KbExpr {
	equals(other: KbExpr): boolean;
	evaluate(context: any): boolean;
	normalize(): KbExpr;
	serialize(): string;
}

export class KbDefinedExpression implements KbExpr {
	constructor(private key: string) {
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
}

export class KbEqualsExpression implements KbExpr {
	constructor(private key: string, private value: any) {
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
}

export class KbNotEqualsExpression implements KbExpr {
	constructor(private key: string, private value: any) {
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
}

export class KbNotExpression implements KbExpr {
	constructor(private key: string) {
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
}

export class KbAndExpression implements KbExpr {
	private expr: KbExpr[];

	constructor(expr: KbExpr[]) {
		this.expr = expr || [];
	}

	public equals(other: KbExpr): boolean {
		return this === other;
	}

	public evaluate(context: any): boolean {
		for (let i = 0, len = this.expr.length; i < len; i++) {
			if (!this.expr[i].evaluate(context)) {
				return false;
			}
		}
		return true;
	}

	public normalize(): KbExpr {
		let expr: KbExpr[] = [];

		for (let i = 0, len = this.expr.length; i < len; i++) {
			let e = this.expr[i];
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

		if (expr.length === 0) {
			return null;
		}

		if (expr.length === 1) {
			return expr[0];
		}

		return new KbAndExpression(expr);
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
	context: KbExpr;
	weight1: number;
	weight2: number;
}

export interface ICommandHandler {
	(accessor: ServicesAccessor, args: any): void;
	description?: string | ICommandHandlerDescription;
}

export interface ICommandHandlerDescription {
	description: string;
	args: { name: string; description?: string; constraint?: TypeConstraint; }[];
	returns?: string;
}

export interface ICommandsMap {
	[id: string]: ICommandHandler;
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

	createKey<T>(key: string, defaultValue: T): IKeybindingContextKey<T>;

	createScoped(domNode: IKeybindingScopeLocation): IKeybindingService;

	getDefaultKeybindings(): string;
	lookupKeybindings(commandId: string): Keybinding[];
	customKeybindingsCount(): number;

	getLabelFor(keybinding: Keybinding): string;
	getAriaLabelFor(keybinding: Keybinding): string;
	getHTMLLabelFor(keybinding: Keybinding): IHTMLContentElement[];
	getElectronAcceleratorFor(keybinding: Keybinding): string;

	executeCommand<T>(commandId: string, args?: any): TPromise<T>;
	executeCommand(commandId: string, args?: any): TPromise<any>;
}

export const SET_CONTEXT_COMMAND_ID = 'setContext';
