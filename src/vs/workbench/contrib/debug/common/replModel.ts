/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import severity from 'vs/base/common/severity';
import { isObject, isString } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugConfiguration, IDebugSession, IExpression, INestingReplElement, IReplElement, IReplElementSource, IStackFrame } from 'vs/workbench/contrib/debug/common/debug';
import { ExpressionContainer } from 'vs/workbench/contrib/debug/common/debugModel';

const MAX_REPL_LENGTH = 10000;
let topReplElementCounter = 0;
const getUniqueId = () => `topReplElement:${topReplElementCounter++}`;

/**
 * General case of data from DAP the `output` event. {@link ReplVariableElement}
 * is used instead only if there is a `variablesReference` with no `output` text.
 */
export class ReplOutputElement implements INestingReplElement {

	private _count = 1;
	private _onDidChangeCount = new Emitter<void>();

	constructor(
		public session: IDebugSession,
		private id: string,
		public value: string,
		public severity: severity,
		public sourceData?: IReplElementSource,
		public readonly expression?: IExpression,
	) {
	}

	toString(includeSource = false): string {
		let valueRespectCount = this.value;
		for (let i = 1; i < this.count; i++) {
			valueRespectCount += (valueRespectCount.endsWith('\n') ? '' : '\n') + this.value;
		}
		const sourceStr = (this.sourceData && includeSource) ? ` ${this.sourceData.source.name}` : '';
		return valueRespectCount + sourceStr;
	}

	getId(): string {
		return this.id;
	}

	getChildren(): Promise<IReplElement[]> {
		return this.expression?.getChildren() || Promise.resolve([]);
	}

	set count(value: number) {
		this._count = value;
		this._onDidChangeCount.fire();
	}

	get count(): number {
		return this._count;
	}

	get onDidChangeCount(): Event<void> {
		return this._onDidChangeCount.event;
	}

	get hasChildren() {
		return !!this.expression?.hasChildren;
	}
}

/** Top-level variable logged via DAP output when there's no `output` string */
export class ReplVariableElement implements INestingReplElement {
	public readonly hasChildren: boolean;
	private readonly id = generateUuid();

	constructor(
		public readonly expression: IExpression,
		public readonly severity: severity,
		public readonly sourceData?: IReplElementSource,
	) {
		this.hasChildren = expression.hasChildren;
	}

	getChildren(): IReplElement[] | Promise<IReplElement[]> {
		return this.expression.getChildren();
	}

	toString(): string {
		return this.expression.toString();
	}

	getId(): string {
		return this.id;
	}
}

export class RawObjectReplElement implements IExpression, INestingReplElement {

	private static readonly MAX_CHILDREN = 1000; // upper bound of children per value

	constructor(private id: string, public name: string, public valueObj: any, public sourceData?: IReplElementSource, public annotation?: string) { }

	getId(): string {
		return this.id;
	}

	get value(): string {
		if (this.valueObj === null) {
			return 'null';
		} else if (Array.isArray(this.valueObj)) {
			return `Array[${this.valueObj.length}]`;
		} else if (isObject(this.valueObj)) {
			return 'Object';
		} else if (isString(this.valueObj)) {
			return `"${this.valueObj}"`;
		}

		return String(this.valueObj) || '';
	}

	get hasChildren(): boolean {
		return (Array.isArray(this.valueObj) && this.valueObj.length > 0) || (isObject(this.valueObj) && Object.getOwnPropertyNames(this.valueObj).length > 0);
	}

	evaluateLazy(): Promise<void> {
		throw new Error('Method not implemented.');
	}

	getChildren(): Promise<IExpression[]> {
		let result: IExpression[] = [];
		if (Array.isArray(this.valueObj)) {
			result = (<any[]>this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map((v, index) => new RawObjectReplElement(`${this.id}:${index}`, String(index), v));
		} else if (isObject(this.valueObj)) {
			result = Object.getOwnPropertyNames(this.valueObj).slice(0, RawObjectReplElement.MAX_CHILDREN)
				.map((key, index) => new RawObjectReplElement(`${this.id}:${index}`, key, this.valueObj[key]));
		}

		return Promise.resolve(result);
	}

	toString(): string {
		return `${this.name}\n${this.value}`;
	}
}

export class ReplEvaluationInput implements IReplElement {
	private id: string;

	constructor(public value: string) {
		this.id = generateUuid();
	}

	toString(): string {
		return this.value;
	}

	getId(): string {
		return this.id;
	}
}

export class ReplEvaluationResult extends ExpressionContainer implements IReplElement {
	private _available = true;

	get available(): boolean {
		return this._available;
	}

	constructor(public readonly originalExpression: string) {
		super(undefined, undefined, 0, generateUuid());
	}

	override async evaluateExpression(expression: string, session: IDebugSession | undefined, stackFrame: IStackFrame | undefined, context: string): Promise<boolean> {
		const result = await super.evaluateExpression(expression, session, stackFrame, context);
		this._available = result;

		return result;
	}

	override toString(): string {
		return `${this.value}`;
	}
}

export class ReplGroup implements INestingReplElement {

	private children: IReplElement[] = [];
	private id: string;
	private ended = false;
	static COUNTER = 0;

	constructor(
		public name: string,
		public autoExpand: boolean,
		public sourceData?: IReplElementSource
	) {
		this.id = `replGroup:${ReplGroup.COUNTER++}`;
	}

	get hasChildren() {
		return true;
	}

	getId(): string {
		return this.id;
	}

	toString(includeSource = false): string {
		const sourceStr = (includeSource && this.sourceData) ? ` ${this.sourceData.source.name}` : '';
		return this.name + sourceStr;
	}

	addChild(child: IReplElement): void {
		const lastElement = this.children.length ? this.children[this.children.length - 1] : undefined;
		if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
			lastElement.addChild(child);
		} else {
			this.children.push(child);
		}
	}

	getChildren(): IReplElement[] {
		return this.children;
	}

	end(): void {
		const lastElement = this.children.length ? this.children[this.children.length - 1] : undefined;
		if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
			lastElement.end();
		} else {
			this.ended = true;
		}
	}

	get hasEnded(): boolean {
		return this.ended;
	}
}

function areSourcesEqual(first: IReplElementSource | undefined, second: IReplElementSource | undefined): boolean {
	if (!first && !second) {
		return true;
	}
	if (first && second) {
		return first.column === second.column && first.lineNumber === second.lineNumber && first.source.uri.toString() === second.source.uri.toString();
	}

	return false;
}

export interface INewReplElementData {
	output: string;
	expression?: IExpression;
	sev: severity;
	source?: IReplElementSource;
}

export class ReplModel {
	private replElements: IReplElement[] = [];
	private readonly _onDidChangeElements = new Emitter<void>();
	readonly onDidChangeElements = this._onDidChangeElements.event;

	constructor(private readonly configurationService: IConfigurationService) { }

	getReplElements(): IReplElement[] {
		return this.replElements;
	}

	async addReplExpression(session: IDebugSession, stackFrame: IStackFrame | undefined, name: string): Promise<void> {
		this.addReplElement(new ReplEvaluationInput(name));
		const result = new ReplEvaluationResult(name);
		await result.evaluateExpression(name, session, stackFrame, 'repl');
		this.addReplElement(result);
	}

	appendToRepl(session: IDebugSession, { output, expression, sev, source }: INewReplElementData): void {
		const clearAnsiSequence = '\u001b[2J';
		const clearAnsiIndex = output.lastIndexOf(clearAnsiSequence);
		if (clearAnsiIndex !== -1) {
			// [2J is the ansi escape sequence for clearing the display http://ascii-table.com/ansi-escape-sequences.php
			this.removeReplExpressions();
			this.appendToRepl(session, { output: nls.localize('consoleCleared', "Console was cleared"), sev: severity.Ignore });
			output = output.substring(clearAnsiIndex + clearAnsiSequence.length);
		}

		if (expression) {
			// if there is an output string, prefer to show that, since the DA could
			// have formatted it nicely e.g. with ANSI color codes.
			this.addReplElement(output
				? new ReplOutputElement(session, getUniqueId(), output, sev, source, expression)
				: new ReplVariableElement(expression, sev, source));
			return;
		}

		const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
		if (previousElement instanceof ReplOutputElement && previousElement.severity === sev) {
			const config = this.configurationService.getValue<IDebugConfiguration>('debug');
			if (previousElement.value === output && areSourcesEqual(previousElement.sourceData, source) && config.console.collapseIdenticalLines) {
				previousElement.count++;
				// No need to fire an event, just the count updates and badge will adjust automatically
				return;
			}
			if (!previousElement.value.endsWith('\n') && !previousElement.value.endsWith('\r\n') && previousElement.count === 1) {
				this.replElements[this.replElements.length - 1] = new ReplOutputElement(
					session, getUniqueId(), previousElement.value + output, sev, source);
				this._onDidChangeElements.fire();
				return;
			}
		}

		const element = new ReplOutputElement(session, getUniqueId(), output, sev, source);
		this.addReplElement(element);
	}

	startGroup(name: string, autoExpand: boolean, sourceData?: IReplElementSource): void {
		const group = new ReplGroup(name, autoExpand, sourceData);
		this.addReplElement(group);
	}

	endGroup(): void {
		const lastElement = this.replElements[this.replElements.length - 1];
		if (lastElement instanceof ReplGroup) {
			lastElement.end();
		}
	}

	private addReplElement(newElement: IReplElement): void {
		const lastElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;
		if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
			lastElement.addChild(newElement);
		} else {
			this.replElements.push(newElement);
			if (this.replElements.length > MAX_REPL_LENGTH) {
				this.replElements.splice(0, this.replElements.length - MAX_REPL_LENGTH);
			}
		}

		this._onDidChangeElements.fire();
	}

	removeReplExpressions(): void {
		if (this.replElements.length > 0) {
			this.replElements = [];
			this._onDidChangeElements.fire();
		}
	}

	/** Returns a new REPL model that's a copy of this one. */
	clone() {
		const newRepl = new ReplModel(this.configurationService);
		newRepl.replElements = this.replElements.slice();
		return newRepl;
	}
}
