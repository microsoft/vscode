/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import severity from '../../../../base/common/severity.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDebugConfiguration, IDebugSession, IExpression, INestingReplElement, IReplElement, IReplElementSource, IStackFrame } from './debug.js';
import { ExpressionContainer } from './debugModel.js';

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
		private readonly session: IDebugSession,
		public readonly expression: IExpression,
		public readonly severity: severity,
		public readonly sourceData?: IReplElementSource,
	) {
		this.hasChildren = expression.hasChildren;
	}

	getSession() {
		return this.session;
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

	getSession(): IDebugSession | undefined {
		return undefined;
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
		public readonly session: IDebugSession,
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
	private readonly _onDidChangeElements = new Emitter<IReplElement | undefined>();
	readonly onDidChangeElements = this._onDidChangeElements.event;

	constructor(private readonly configurationService: IConfigurationService) { }

	getReplElements(): IReplElement[] {
		return this.replElements;
	}

	async addReplExpression(session: IDebugSession, stackFrame: IStackFrame | undefined, expression: string): Promise<void> {
		this.addReplElement(new ReplEvaluationInput(expression));
		const result = new ReplEvaluationResult(expression);
		await result.evaluateExpression(expression, session, stackFrame, 'repl');
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
				: new ReplVariableElement(session, expression, sev, source));
			return;
		}

		this.appendOutputToRepl(session, output, sev, source);
	}

	private appendOutputToRepl(session: IDebugSession, output: string, sev: severity, source?: IReplElementSource): void {
		const config = this.configurationService.getValue<IDebugConfiguration>('debug');
		const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;

		// Handle concatenation of incomplete lines first
		if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
			if (!previousElement.value.endsWith('\n') && !previousElement.value.endsWith('\r\n') && previousElement.count === 1) {
				// Concatenate with previous incomplete line
				const combinedOutput = previousElement.value + output;
				this.replElements[this.replElements.length - 1] = new ReplOutputElement(
					session, getUniqueId(), combinedOutput, sev, source);
				this._onDidChangeElements.fire(undefined);

				// If the combined output now forms a complete line and collapsing is enabled,
				// check if it can be collapsed with previous elements
				if (config.console.collapseIdenticalLines && combinedOutput.endsWith('\n')) {
					this.tryCollapseCompleteLine(sev, source);
				}

				// If the combined output contains multiple lines, apply line-level collapsing
				if (config.console.collapseIdenticalLines && combinedOutput.includes('\n')) {
					const lines = this.splitIntoLines(combinedOutput);
					if (lines.length > 1) {
						this.applyLineLevelCollapsing(session, sev, source);
					}
				}
				return;
			}
		}

		// If collapsing is enabled and the output contains line breaks, parse and collapse at line level
		if (config.console.collapseIdenticalLines && output.includes('\n')) {
			this.processMultiLineOutput(session, output, sev, source);
		} else {
			// For simple output without line breaks, use the original logic
			if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
				if (previousElement.value === output && config.console.collapseIdenticalLines) {
					previousElement.count++;
					// No need to fire an event, just the count updates and badge will adjust automatically
					return;
				}
			}

			const element = new ReplOutputElement(session, getUniqueId(), output, sev, source);
			this.addReplElement(element);
		}
	}

	private tryCollapseCompleteLine(sev: severity, source?: IReplElementSource): void {
		// Try to collapse the last element with the second-to-last if they are identical complete lines
		if (this.replElements.length < 2) {
			return;
		}

		const lastElement = this.replElements[this.replElements.length - 1];
		const secondToLastElement = this.replElements[this.replElements.length - 2];

		if (lastElement instanceof ReplOutputElement &&
			secondToLastElement instanceof ReplOutputElement &&
			lastElement.severity === sev &&
			secondToLastElement.severity === sev &&
			areSourcesEqual(lastElement.sourceData, source) &&
			areSourcesEqual(secondToLastElement.sourceData, source) &&
			lastElement.value === secondToLastElement.value &&
			lastElement.count === 1 &&
			lastElement.value.endsWith('\n')) {

			// Collapse the last element into the second-to-last
			secondToLastElement.count += lastElement.count;
			this.replElements.pop();
			this._onDidChangeElements.fire(undefined);
		}
	}

	private processMultiLineOutput(session: IDebugSession, output: string, sev: severity, source?: IReplElementSource): void {
		// Split output into lines, preserving line endings
		const lines = this.splitIntoLines(output);

		for (const line of lines) {
			if (line.length === 0) { continue; }

			const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;

			// Check if this line can be collapsed with the previous one
			if (previousElement instanceof ReplOutputElement &&
				previousElement.severity === sev &&
				areSourcesEqual(previousElement.sourceData, source) &&
				previousElement.value === line) {
				previousElement.count++;
				// No need to fire an event, just the count updates and badge will adjust automatically
			} else {
				const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
				this.addReplElement(element);
			}
		}
	}

	private splitIntoLines(text: string): string[] {
		// Split text into lines while preserving line endings, using indexOf for efficiency
		const lines: string[] = [];
		let start = 0;

		while (start < text.length) {
			const nextLF = text.indexOf('\n', start);
			if (nextLF === -1) {
				lines.push(text.substring(start));
				break;
			}
			lines.push(text.substring(start, nextLF + 1));
			start = nextLF + 1;
		}

		return lines;
	}

	private applyLineLevelCollapsing(session: IDebugSession, sev: severity, source?: IReplElementSource): void {
		// Apply line-level collapsing to the last element if it contains multiple lines
		const lastElement = this.replElements[this.replElements.length - 1];
		if (!(lastElement instanceof ReplOutputElement) || lastElement.severity !== sev || !areSourcesEqual(lastElement.sourceData, source)) {
			return;
		}

		const lines = this.splitIntoLines(lastElement.value);
		if (lines.length <= 1) {
			return; // No multiple lines to collapse
		}

		// Remove the last element and reprocess it as multiple lines
		this.replElements.pop();

		// Process each line and try to collapse with existing elements
		for (const line of lines) {
			if (line.length === 0) { continue; }

			const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : undefined;

			// Check if this line can be collapsed with the previous one
			if (previousElement instanceof ReplOutputElement &&
				previousElement.severity === sev &&
				areSourcesEqual(previousElement.sourceData, source) &&
				previousElement.value === line) {
				previousElement.count++;
			} else {
				const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
				this.addReplElement(element);
			}
		}

		this._onDidChangeElements.fire(undefined);
	}

	startGroup(session: IDebugSession, name: string, autoExpand: boolean, sourceData?: IReplElementSource): void {
		const group = new ReplGroup(session, name, autoExpand, sourceData);
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
			const config = this.configurationService.getValue<IDebugConfiguration>('debug');
			if (this.replElements.length > config.console.maximumLines) {
				this.replElements.splice(0, this.replElements.length - config.console.maximumLines);
			}
		}
		this._onDidChangeElements.fire(newElement);
	}

	removeReplExpressions(): void {
		if (this.replElements.length > 0) {
			this.replElements = [];
			this._onDidChangeElements.fire(undefined);
		}
	}

	/** Returns a new REPL model that's a copy of this one. */
	clone() {
		const newRepl = new ReplModel(this.configurationService);
		newRepl.replElements = this.replElements.slice();
		return newRepl;
	}
}
