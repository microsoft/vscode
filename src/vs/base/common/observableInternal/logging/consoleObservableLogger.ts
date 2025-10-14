/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../base.js';
import { TransactionImpl } from '../transaction.js';
import { IObservableLogger, IChangeInformation, addLogger } from './logging.js';
import { FromEventObservable } from '../observables/observableFromEvent.js';
import { getClassName } from '../debugName.js';
import { Derived } from '../observables/derivedImpl.js';
import { AutorunObserver } from '../reactions/autorunImpl.js';

let consoleObservableLogger: ConsoleObservableLogger | undefined;

export function logObservableToConsole(obs: IObservable<any>): void {
	if (!consoleObservableLogger) {
		consoleObservableLogger = new ConsoleObservableLogger();
		addLogger(consoleObservableLogger);
	}
	consoleObservableLogger.addFilteredObj(obs);
}

export class ConsoleObservableLogger implements IObservableLogger {
	private indentation = 0;

	private _filteredObjects: Set<unknown> | undefined;

	public addFilteredObj(obj: unknown): void {
		if (!this._filteredObjects) {
			this._filteredObjects = new Set();
		}
		this._filteredObjects.add(obj);
	}

	private _isIncluded(obj: unknown): boolean {
		return this._filteredObjects?.has(obj) ?? true;
	}

	private textToConsoleArgs(text: ConsoleText): unknown[] {
		return consoleTextToArgs([
			normalText(repeat('|  ', this.indentation)),
			text,
		]);
	}

	private formatInfo(info: IChangeInformation): ConsoleText[] {
		if (!info.hadValue) {
			return [
				normalText(` `),
				styled(formatValue(info.newValue, 60), {
					color: 'green',
				}),
				normalText(` (initial)`),
			];
		}
		return info.didChange
			? [
				normalText(` `),
				styled(formatValue(info.oldValue, 70), {
					color: 'red',
					strikeThrough: true,
				}),
				normalText(` `),
				styled(formatValue(info.newValue, 60), {
					color: 'green',
				}),
			]
			: [normalText(` (unchanged)`)];
	}

	handleObservableCreated(observable: IObservable<any>): void {
		if (observable instanceof Derived) {
			const derived = observable;
			this.changedObservablesSets.set(derived, new Set());

			const debugTrackUpdating = false;
			if (debugTrackUpdating) {
				const updating: IObservable<any>[] = [];
				// eslint-disable-next-line local/code-no-any-casts
				(derived as any).__debugUpdating = updating;

				const existingBeginUpdate = derived.beginUpdate;
				derived.beginUpdate = (obs) => {
					updating.push(obs);
					return existingBeginUpdate.apply(derived, [obs]);
				};

				const existingEndUpdate = derived.endUpdate;
				derived.endUpdate = (obs) => {
					const idx = updating.indexOf(obs);
					if (idx === -1) {
						console.error('endUpdate called without beginUpdate', derived.debugName, obs.debugName);
					}
					updating.splice(idx, 1);
					return existingEndUpdate.apply(derived, [obs]);
				};
			}
		}
	}

	handleOnListenerCountChanged(observable: IObservable<any>, newCount: number): void {
	}

	handleObservableUpdated(observable: IObservable<unknown>, info: IChangeInformation): void {
		if (!this._isIncluded(observable)) { return; }
		if (observable instanceof Derived) {
			this._handleDerivedRecomputed(observable, info);
			return;
		}

		console.log(...this.textToConsoleArgs([
			formatKind('observable value changed'),
			styled(observable.debugName, { color: 'BlueViolet' }),
			...this.formatInfo(info),
		]));
	}

	private readonly changedObservablesSets = new WeakMap<object, Set<IObservable<any>>>();

	formatChanges(changes: Set<IObservable<any>>): ConsoleText | undefined {
		if (changes.size === 0) {
			return undefined;
		}
		return styled(
			' (changed deps: ' +
			[...changes].map((o) => o.debugName).join(', ') +
			')',
			{ color: 'gray' }
		);
	}

	handleDerivedDependencyChanged(derived: Derived<any>, observable: IObservable<any>, change: unknown): void {
		if (!this._isIncluded(derived)) { return; }

		this.changedObservablesSets.get(derived)?.add(observable);
	}

	_handleDerivedRecomputed(derived: Derived<unknown>, info: IChangeInformation): void {
		if (!this._isIncluded(derived)) { return; }

		const changedObservables = this.changedObservablesSets.get(derived);
		if (!changedObservables) { return; }
		console.log(...this.textToConsoleArgs([
			formatKind('derived recomputed'),
			styled(derived.debugName, { color: 'BlueViolet' }),
			...this.formatInfo(info),
			this.formatChanges(changedObservables),
			{ data: [{ fn: derived._debugNameData.referenceFn ?? derived._computeFn }] }
		]));
		changedObservables.clear();
	}

	handleDerivedCleared(derived: Derived<unknown>): void {
		if (!this._isIncluded(derived)) { return; }

		console.log(...this.textToConsoleArgs([
			formatKind('derived cleared'),
			styled(derived.debugName, { color: 'BlueViolet' }),
		]));
	}

	handleFromEventObservableTriggered(observable: FromEventObservable<any, any>, info: IChangeInformation): void {
		if (!this._isIncluded(observable)) { return; }

		console.log(...this.textToConsoleArgs([
			formatKind('observable from event triggered'),
			styled(observable.debugName, { color: 'BlueViolet' }),
			...this.formatInfo(info),
			{ data: [{ fn: observable._getValue }] }
		]));
	}

	handleAutorunCreated(autorun: AutorunObserver): void {
		if (!this._isIncluded(autorun)) { return; }

		this.changedObservablesSets.set(autorun, new Set());
	}

	handleAutorunDisposed(autorun: AutorunObserver): void {
	}

	handleAutorunDependencyChanged(autorun: AutorunObserver, observable: IObservable<any>, change: unknown): void {
		if (!this._isIncluded(autorun)) { return; }

		this.changedObservablesSets.get(autorun)!.add(observable);
	}

	handleAutorunStarted(autorun: AutorunObserver): void {
		const changedObservables = this.changedObservablesSets.get(autorun);
		if (!changedObservables) { return; }

		if (this._isIncluded(autorun)) {
			console.log(...this.textToConsoleArgs([
				formatKind('autorun'),
				styled(autorun.debugName, { color: 'BlueViolet' }),
				this.formatChanges(changedObservables),
				{ data: [{ fn: autorun._debugNameData.referenceFn ?? autorun._runFn }] }
			]));
		}
		changedObservables.clear();
		this.indentation++;
	}

	handleAutorunFinished(autorun: AutorunObserver): void {
		this.indentation--;
	}

	handleBeginTransaction(transaction: TransactionImpl): void {
		let transactionName = transaction.getDebugName();
		if (transactionName === undefined) {
			transactionName = '';
		}
		if (this._isIncluded(transaction)) {
			console.log(...this.textToConsoleArgs([
				formatKind('transaction'),
				styled(transactionName, { color: 'BlueViolet' }),
				{ data: [{ fn: transaction._fn }] }
			]));
		}
		this.indentation++;
	}

	handleEndTransaction(): void {
		this.indentation--;
	}
}
type ConsoleText = (ConsoleText | undefined)[] |
{ text: string; style: string; data?: unknown[] } |
{ data: unknown[] };
function consoleTextToArgs(text: ConsoleText): unknown[] {
	const styles = new Array<any>();
	const data: unknown[] = [];
	let firstArg = '';

	function process(t: ConsoleText): void {
		if ('length' in t) {
			for (const item of t) {
				if (item) {
					process(item);
				}
			}
		} else if ('text' in t) {
			firstArg += `%c${t.text}`;
			styles.push(t.style);
			if (t.data) {
				data.push(...t.data);
			}
		} else if ('data' in t) {
			data.push(...t.data);
		}
	}

	process(text);

	const result = [firstArg, ...styles];
	result.push(...data);
	return result;
}
function normalText(text: string): ConsoleText {
	return styled(text, { color: 'black' });
}
function formatKind(kind: string): ConsoleText {
	return styled(padStr(`${kind}: `, 10), { color: 'black', bold: true });
}
function styled(
	text: string,
	options: { color: string; strikeThrough?: boolean; bold?: boolean } = {
		color: 'black',
	}
): ConsoleText {
	function objToCss(styleObj: Record<string, string>): string {
		return Object.entries(styleObj).reduce(
			(styleString, [propName, propValue]) => {
				return `${styleString}${propName}:${propValue};`;
			},
			''
		);
	}

	const style: Record<string, string> = {
		color: options.color,
	};
	if (options.strikeThrough) {
		style['text-decoration'] = 'line-through';
	}
	if (options.bold) {
		style['font-weight'] = 'bold';
	}

	return {
		text,
		style: objToCss(style),
	};
}

export function formatValue(value: unknown, availableLen: number): string {
	switch (typeof value) {
		case 'number':
			return '' + value;
		case 'string':
			if (value.length + 2 <= availableLen) {
				return `"${value}"`;
			}
			return `"${value.substr(0, availableLen - 7)}"+...`;

		case 'boolean':
			return value ? 'true' : 'false';
		case 'undefined':
			return 'undefined';
		case 'object':
			if (value === null) {
				return 'null';
			}
			if (Array.isArray(value)) {
				return formatArray(value, availableLen);
			}
			return formatObject(value, availableLen);
		case 'symbol':
			return value.toString();
		case 'function':
			return `[[Function${value.name ? ' ' + value.name : ''}]]`;
		default:
			return '' + value;
	}
}

function formatArray(value: unknown[], availableLen: number): string {
	let result = '[ ';
	let first = true;
	for (const val of value) {
		if (!first) {
			result += ', ';
		}
		if (result.length - 5 > availableLen) {
			result += '...';
			break;
		}
		first = false;
		result += `${formatValue(val, availableLen - result.length)}`;
	}
	result += ' ]';
	return result;
}

function formatObject(value: object, availableLen: number): string {
	if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
		const val = value.toString();
		if (val.length <= availableLen) {
			return val;
		}
		return val.substring(0, availableLen - 3) + '...';
	}

	const className = getClassName(value);

	let result = className ? className + '(' : '{ ';
	let first = true;
	for (const [key, val] of Object.entries(value)) {
		if (!first) {
			result += ', ';
		}
		if (result.length - 5 > availableLen) {
			result += '...';
			break;
		}
		first = false;
		result += `${key}: ${formatValue(val, availableLen - result.length)}`;
	}
	result += className ? ')' : ' }';
	return result;
}

function repeat(str: string, count: number): string {
	let result = '';
	for (let i = 1; i <= count; i++) {
		result += str;
	}
	return result;
}

function padStr(str: string, length: number): string {
	while (str.length < length) {
		str += ' ';
	}
	return str;
}
