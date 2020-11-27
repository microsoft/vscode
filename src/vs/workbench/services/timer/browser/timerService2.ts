/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PerformanceEntry } from 'vs/base/common/performance';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';


export const ITimerService2 = createDecorator<ITimerService2>('timerService2');

export interface ITimerService2 {

	_serviceBrand: undefined;

	addPerformanceEntries(source: TimerSource, entries: PerformanceEntry[]): void;

	getDuration(from: string, to: string, fromSource: TimerSource | undefined, toSource: TimerSource | undefined): number;
}

export const enum TimerSource {
	Main = 0,
	Renderer = 1,
	Server = 2,
}

class TimerService2 implements ITimerService2 {

	declare readonly _serviceBrand: undefined;

	private readonly _entries: PerformanceEntry[][] = [];

	addPerformanceEntries(source: TimerSource, entries: PerformanceEntry[]): void {
		if (Array.isArray(this._entries[source])) {
			throw new Error('timer entries already delivered');
		}
		this._entries[source] = entries.slice(0).reverse();
	}

	getDuration(from: string, to: string, fromSource: TimerSource | undefined, toSource: TimerSource | undefined = fromSource): number {
		const t1 = this._lookup(from, fromSource);
		const t2 = this._lookup(to, toSource);
		if (!t1 || !t2) {
			return -1;
		}
		return t2.startTime - t1.startTime;
	}


	private _lookup(name: string, source: TimerSource | undefined): PerformanceEntry | undefined {
		if (source) {
			return this._lookupByNameAndSource(name, source);
		} else {
			return this._lookupByName(name);
		}
	}

	private _lookupByNameAndSource(name: string, source: TimerSource): PerformanceEntry | undefined {
		const array = this._entries[source];
		return array?.find(candidate => candidate.name === name);
	}

	private _lookupByName(name: string): PerformanceEntry | undefined {
		for (let source = 0; source < this._entries.length; source++) {
			const result = this._lookupByNameAndSource(name, source);
			if (result) {
				return result;
			}
		}
		return undefined;
	}
}

registerSingleton(ITimerService2, TimerService2, true);
