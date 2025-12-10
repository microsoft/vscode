/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface TimerHandle {
	readonly _timerBrand: never;
}

declare function setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): TimerHandle;
declare function clearTimeout(timeoutId: TimerHandle | undefined): void;
declare function setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]): TimerHandle;
declare function clearInterval(intervalId: TimerHandle | undefined): void;

