/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Profile } from './profiler';

declare interface TickStart {
	name: string;
	started: number;
}

export declare class Tick {

	readonly duration: number;
	readonly name: string;
	readonly started: number;
	readonly stopped: number;
	readonly profile: Profile;

	static compareByStart(a: Tick, b: Tick): number;
}

declare interface TickController {
	while<T extends Thenable<any>>(t: T): T;
	stop(stopped?: number): void;
}

export function startTimer(name: string): TickController;

export function stopTimer(name: string);

export function ticks(): Tick[];

export function tick(name: string): Tick;

export function setProfileList(names: string[]): void;

export function disable(): void;
