/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare interface TickStart {
	name: string;
	started: number;
}

export declare class Tick {

	readonly duration: number;
	readonly name: string;
	readonly started: number;
	readonly stopped: number;

	static compareByStart(a: Tick, b: Tick): number;
}

declare interface TickController {
	while<T extends Thenable<any>>(t: T): T;
	stop(stopped?: number): void;
}

export function startTimer(name: string, started?: number): TickController;

export function stopTimer(name: string, stopped?: number);

export function ticks(): ReadonlyArray<Tick>;

export function disable(): void;
