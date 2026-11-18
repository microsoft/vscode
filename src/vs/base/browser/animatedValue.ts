/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from './dom.js';
import { IReader, observableSignal } from '../common/observable.js';

export interface IAnimatedValue {
	/**
	 * Once true, it can never become false again.
	*/
	isFinished(nowMs: number): boolean;
	getValue(nowMs: number): number;
}

export class AnimatedValue implements IAnimatedValue {
	public static const(value: number): AnimatedValue {
		return new AnimatedValue(value, value, 0, Date.now());
	}

	public static startNow(startValue: number, endValue: number, durationMs: number, interpolationFunction: InterpolationFunction = easeOutExpo): AnimatedValue {
		return new AnimatedValue(startValue, endValue, durationMs, Date.now(), interpolationFunction);
	}

	constructor(
		public readonly startValue: number,
		public readonly endValue: number,
		public readonly durationMs: number,
		public readonly startTimeMs: number,
		private readonly _interpolationFunction: InterpolationFunction = easeOutExpo,
	) {
		if (startValue === endValue) {
			this.durationMs = 0;
		}
	}

	isFinished(nowMs: number): boolean {
		return nowMs >= this.startTimeMs + this.durationMs;
	}

	getValue(nowMs: number): number {
		const timePassed = nowMs - this.startTimeMs;
		if (timePassed >= this.durationMs) {
			return this.endValue;
		}
		const value = this._interpolationFunction(timePassed, this.startValue, this.endValue - this.startValue, this.durationMs);
		return value;
	}
}

export type InterpolationFunction = (passedTime: number, start: number, length: number, totalDuration: number) => number;

export function easeOutExpo(passedTime: number, start: number, length: number, totalDuration: number): number {
	return passedTime === totalDuration
		? start + length
		: length * (-Math.pow(2, -10 * passedTime / totalDuration) + 1) + start;
}

export function easeOutCubic(passedTime: number, start: number, length: number, totalDuration: number): number {
	return length * ((passedTime = passedTime / totalDuration - 1) * passedTime * passedTime + 1) + start;
}

export function linear(passedTime: number, start: number, length: number, totalDuration: number): number {
	return length * passedTime / totalDuration + start;
}

export class LoopingAnimatedValue implements IAnimatedValue {
	public static startNow(startValue: number, endValue: number, durationMs: number, interpolationFunction: InterpolationFunction): LoopingAnimatedValue {
		return new LoopingAnimatedValue(startValue, endValue, durationMs, Date.now(), interpolationFunction);
	}

	constructor(
		private readonly _startValue: number,
		private readonly _endValue: number,
		private readonly _durationMs: number,
		private readonly _startTimeMs: number,
		private readonly _interpolationFunction: InterpolationFunction,
	) { }

	isFinished(nowMs: number): boolean {
		return false;
	}

	getValue(nowMs: number): number {
		const timePassed = (nowMs - this._startTimeMs) % this._durationMs;
		return this._interpolationFunction(timePassed, this._startValue, this._endValue - this._startValue, this._durationMs);
	}
}

export class ObservableAnimatedValue<T extends IAnimatedValue = IAnimatedValue> {
	public static const(value: number): ObservableAnimatedValue {
		return new ObservableAnimatedValue(AnimatedValue.const(value));
	}

	constructor(
		private readonly _value: T,
	) { }

	getValue(reader: IReader | undefined): number {
		const nowMs = Date.now();
		if (!this._value.isFinished(nowMs)) {
			AnimationFrameScheduler.instance.invalidateOnNextAnimationFrame(reader);
		}
		return this._value.getValue(nowMs);
	}

	isFinished(reader: IReader | undefined): boolean {
		const nowMs = Date.now();
		const isFinished = this._value.isFinished(nowMs);
		if (!isFinished) {
			AnimationFrameScheduler.instance.invalidateOnNextAnimationFrame(reader);
		}
		return isFinished;
	}
}

export class AnimationFrameScheduler {
	public static instance = new AnimationFrameScheduler();

	private readonly _counter = observableSignal(this);

	private _isScheduled = false;

	public invalidateOnNextAnimationFrame(reader: IReader | undefined): void {
		this._counter.read(reader);
		if (!this._isScheduled) {
			this._isScheduled = true;
			getActiveWindow().requestAnimationFrame(() => {
				this._isScheduled = false;
				this._update();
			});
		}
	}

	private _update(): void {
		this._counter.trigger(undefined);
	}
}
