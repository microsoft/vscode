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

export function debugGetDependencyGraph(obs: IObservable<any> | IObserver, options?: { debugNamePostProcessor?: (name: string) => string }): string {
	const debugNamePostProcessor = options?.debugNamePostProcessor ?? ((str: string) => str);
	const info = Info.from(obs, debugNamePostProcessor);
	if (!info) {
		return '';
	}

	const alreadyListed = new Set<IObservable<any> | IObserver>();
	return formatObservableInfo(info, 0, alreadyListed).trim();
}

function formatObservableInfo(info: Info, indentLevel: number, alreadyListed: Set<IObservable<any> | IObserver>): string {
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
			lines.push(formatObservableInfo(dep, indentLevel + 1, alreadyListed));
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
				Array.from(state.dependencies).map(dep => Info.from(dep, debugNamePostProcessor) || Info.unknown(dep))
			);
		} else if (obs instanceof Derived) {
			const state = obs.debugGetState();
			return new Info(
				obs,
				debugNamePostProcessor(obs.debugName),
				'derived',
				state.value,
				state.stateStr,
				Array.from(state.dependencies).map(dep => Info.from(dep, debugNamePostProcessor) || Info.unknown(dep))
			);
		} else if (obs instanceof ObservableValue) {
			const state = obs.debugGetState();
			return new Info(
				obs,
				debugNamePostProcessor(obs.debugName),
				'observableValue',
				state.value,
				'upToDate',
				[]
			);
		} else if (obs instanceof FromEventObservable) {
			const state = obs.debugGetState();
			return new Info(
				obs,
				debugNamePostProcessor(obs.debugName),
				'fromEvent',
				state.value,
				state.hasValue ? 'upToDate' : 'initial',
				[]
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
			[]
		);
	}

	constructor(
		public readonly sourceObj: IObservable<any> | IObserver,
		public readonly name: string,
		public readonly type: string,
		public readonly value: any,
		public readonly state: string,
		public readonly dependencies: Info[]
	) { }
}
