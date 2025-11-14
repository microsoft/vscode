/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IObserver } from '../base.js';
import { Derived } from '../observables/derivedImpl.js';
import { FromEventObservable } from '../observables/observableFromEvent.js';
import { ObservableValue } from '../observables/observableValue.js';
import { AutorunObserver } from '../reactions/autorunImpl.js';
import { formatValue } from './consoleObservableLogger.js';

interface IOptions {
	type: 'dependencies' | 'observers';
	debugNamePostProcessor?: (name: string) => string;
}

export function debugGetObservableGraph(obs: IObservable<any> | IObserver, options: IOptions): string {
	const debugNamePostProcessor = options?.debugNamePostProcessor ?? ((str: string) => str);
	const info = Info.from(obs, debugNamePostProcessor);
	if (!info) {
		return '';
	}

	const alreadyListed = new Set<IObservable<any> | IObserver>();

	if (options.type === 'observers') {
		return formatObservableInfoWithObservers(info, 0, alreadyListed, options).trim();
	} else {
		return formatObservableInfoWithDependencies(info, 0, alreadyListed, options).trim();
	}
}

function formatObservableInfoWithDependencies(info: Info, indentLevel: number, alreadyListed: Set<IObservable<any> | IObserver>, options: IOptions): string {
	const indent = '\t\t'.repeat(indentLevel);
	const lines: string[] = [];

	const isAlreadyListed = alreadyListed.has(info.sourceObj);
	if (isAlreadyListed) {
		lines.push(`${indent}* ${info.type} ${info.name} (already listed)`);
		return lines.join('\n');
	}

	alreadyListed.add(info.sourceObj);

	lines.push(`${indent}* ${info.type} ${info.name}:`);
	lines.push(`${indent}  value: ${formatValue(info.value, 50)}`);
	lines.push(`${indent}  state: ${info.state}`);

	if (info.dependencies.length > 0) {
		lines.push(`${indent}  dependencies:`);
		for (const dep of info.dependencies) {
			const info = Info.from(dep, options.debugNamePostProcessor ?? (name => name)) ?? Info.unknown(dep);
			lines.push(formatObservableInfoWithDependencies(info, indentLevel + 1, alreadyListed, options));
		}
	}

	return lines.join('\n');
}

function formatObservableInfoWithObservers(info: Info, indentLevel: number, alreadyListed: Set<IObservable<any> | IObserver>, options: IOptions): string {
	const indent = '\t\t'.repeat(indentLevel);
	const lines: string[] = [];

	const isAlreadyListed = alreadyListed.has(info.sourceObj);
	if (isAlreadyListed) {
		lines.push(`${indent}* ${info.type} ${info.name} (already listed)`);
		return lines.join('\n');
	}

	alreadyListed.add(info.sourceObj);

	lines.push(`${indent}* ${info.type} ${info.name}:`);
	lines.push(`${indent}  value: ${formatValue(info.value, 50)}`);
	lines.push(`${indent}  state: ${info.state}`);

	if (info.observers.length > 0) {
		lines.push(`${indent}  observers:`);
		for (const observer of info.observers) {
			const info = Info.from(observer, options.debugNamePostProcessor ?? (name => name)) ?? Info.unknown(observer);
			lines.push(formatObservableInfoWithObservers(info, indentLevel + 1, alreadyListed, options));
		}
	}

	return lines.join('\n');
}

class Info {
	public static from(obs: IObservable<any> | IObserver, debugNamePostProcessor: (name: string) => string): Info | undefined {
		if (obs instanceof AutorunObserver) {
			const state = obs.debugGetState();
			return new Info(
				obs,
				debugNamePostProcessor(obs.debugName),
				'autorun',
				undefined,
				state.stateStr,
				Array.from(state.dependencies),
				[]
			);
		} else if (obs instanceof Derived) {
			const state = obs.debugGetState();
			return new Info(
				obs,
				debugNamePostProcessor(obs.debugName),
				'derived',
				state.value,
				state.stateStr,
				Array.from(state.dependencies),
				Array.from(obs.debugGetObservers())
			);
		} else if (obs instanceof ObservableValue) {
			const state = obs.debugGetState();
			return new Info(
				obs,
				debugNamePostProcessor(obs.debugName),
				'observableValue',
				state.value,
				'upToDate',
				[],
				Array.from(obs.debugGetObservers())
			);
		} else if (obs instanceof FromEventObservable) {
			const state = obs.debugGetState();
			return new Info(
				obs,
				debugNamePostProcessor(obs.debugName),
				'fromEvent',
				state.value,
				state.hasValue ? 'upToDate' : 'initial',
				[],
				Array.from(obs.debugGetObservers())
			);
		}
		return undefined;
	}

	public static unknown(obs: IObservable<any> | IObserver): Info {
		return new Info(
			obs,
			'(unknown)',
			'unknown',
			undefined,
			'unknown',
			[],
			[]
		);
	}

	constructor(
		public readonly sourceObj: IObservable<any> | IObserver,
		public readonly name: string,
		public readonly type: string,
		public readonly value: any,
		public readonly state: string,
		public readonly dependencies: (IObservable<any> | IObserver)[],
		public readonly observers: (IObservable<any> | IObserver)[],
	) { }
}
