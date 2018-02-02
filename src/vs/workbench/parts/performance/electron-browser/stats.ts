/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';


interface IRequire {
	(...a: any[]): any;
	getStats(): ILoaderEvent[];
}

declare var require: IRequire;

/* Copied from loader.ts */
enum LoaderEventType {
	LoaderAvailable = 1,

	BeginLoadingScript = 10,
	EndLoadingScriptOK = 11,
	EndLoadingScriptError = 12,

	BeginInvokeFactory = 21,
	EndInvokeFactory = 22,

	NodeBeginEvaluatingScript = 31,
	NodeEndEvaluatingScript = 32,

	NodeBeginNativeRequire = 33,
	NodeEndNativeRequire = 34
}

interface ILoaderEvent {
	type: LoaderEventType;
	timestamp: number;
	detail: string;
}

class Tick {

	public readonly duration: number;
	public readonly detail: string;

	constructor(public readonly start: ILoaderEvent, public readonly end: ILoaderEvent) {
		console.assert(start.detail === end.detail);

		this.duration = this.end.timestamp - this.start.timestamp;
		this.detail = start.detail;
	}

	static compareUsingStartTimestamp(a: Tick, b: Tick): number {
		if (a.start.timestamp < b.start.timestamp) {
			return -1;
		} else if (a.start.timestamp > b.start.timestamp) {
			return 1;
		} else {
			return 0;
		}
	}
}

function getStats(): Map<LoaderEventType, Tick[]> {

	const stats = require.getStats().slice(0).sort((a: ILoaderEvent, b: ILoaderEvent) => {
		if (a.detail < b.detail) {
			return -1;
		} else if (a.detail > b.detail) {
			return 1;
		} else if (a.type < b.type) {
			return -1;
		} else if (a.type > b.type) {
			return 1;
		} else {
			return 0;
		}
	});

	const ticks = new Map<LoaderEventType, Tick[]>();
	ticks.set(LoaderEventType.BeginLoadingScript, []);
	ticks.set(LoaderEventType.BeginInvokeFactory, []);
	ticks.set(LoaderEventType.NodeBeginEvaluatingScript, []);
	ticks.set(LoaderEventType.NodeBeginNativeRequire, []);

	for (let i = 1; i < stats.length - 1; i++) {
		const stat = stats[i];
		const nextStat = stats[i + 1];

		if (nextStat.type - stat.type > 2) {
			//bad?!
			break;
		}

		i += 1;
		ticks.get(stat.type).push(new Tick(stat, nextStat));
	}

	ticks.get(LoaderEventType.BeginLoadingScript).sort(Tick.compareUsingStartTimestamp);
	ticks.get(LoaderEventType.BeginInvokeFactory).sort(Tick.compareUsingStartTimestamp);
	ticks.get(LoaderEventType.NodeBeginEvaluatingScript).sort(Tick.compareUsingStartTimestamp);
	ticks.get(LoaderEventType.NodeBeginNativeRequire).sort(Tick.compareUsingStartTimestamp);

	return ticks;
}

CommandsRegistry.registerCommand('dev.stats.loader', accessor => {

	const clipboard = accessor.get(IClipboardService);

	let value = `Name\tDuration\n`;
	for (let tick of getStats().get(LoaderEventType.BeginInvokeFactory)) {
		value += `${tick.detail}\t${tick.duration.toPrecision(2)}\n`;
	}
	console.log(value);
	clipboard.writeText(value);
});
