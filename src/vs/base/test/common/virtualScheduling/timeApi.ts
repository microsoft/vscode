/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface TimeoutId { readonly _timeoutIdBrand: void }
export interface IntervalId { readonly _intervalIdBrand: void }
export interface ImmediateId { readonly _immediateIdBrand: void }
export type AnimationFrameId = number & { readonly _animationFrameIdBrand: void };

/**
 * The subset of host time APIs the processor and embeddings need.
 *
 * Used both for the real host API (captured via {@link captureGlobalTimeApi})
 * and for the virtual replacement that runs through a {@link VirtualClock}.
 *
 * Keeping this as a plain interface means the processor never reaches into
 * `globalThis` directly: the boundary between "real time" and "virtual time"
 * is exactly which `TimeApi` instance is in use.
 */
export interface TimeApi {
	setTimeout(handler: () => void, timeout?: number): TimeoutId;
	clearTimeout(id: TimeoutId): void;
	setInterval(handler: () => void, interval: number): IntervalId;
	clearInterval(id: IntervalId): void;
	setImmediate?: ((handler: () => void) => ImmediateId);
	clearImmediate?: ((id: ImmediateId) => void);
	requestAnimationFrame?: ((cb: (time: number) => void) => AnimationFrameId);
	cancelAnimationFrame?: ((id: AnimationFrameId) => void);
	Date: DateConstructor;
}

export function captureGlobalTimeApi(): TimeApi {
	return {
		setTimeout: globalThis.setTimeout.bind(globalThis) as unknown as TimeApi['setTimeout'],
		clearTimeout: globalThis.clearTimeout.bind(globalThis) as unknown as TimeApi['clearTimeout'],
		setInterval: globalThis.setInterval.bind(globalThis) as unknown as TimeApi['setInterval'],
		clearInterval: globalThis.clearInterval.bind(globalThis) as unknown as TimeApi['clearInterval'],
		setImmediate: globalThis.setImmediate?.bind(globalThis) as unknown as TimeApi['setImmediate'],
		clearImmediate: globalThis.clearImmediate?.bind(globalThis) as unknown as TimeApi['clearImmediate'],
		requestAnimationFrame: globalThis.requestAnimationFrame?.bind(globalThis) as unknown as TimeApi['requestAnimationFrame'],
		cancelAnimationFrame: globalThis.cancelAnimationFrame?.bind(globalThis) as unknown as TimeApi['cancelAnimationFrame'],
		Date: globalThis.Date,
	};
}

/** A snapshot of the real host time API at module-load time. */
export const realTimeApi: TimeApi = captureGlobalTimeApi();
