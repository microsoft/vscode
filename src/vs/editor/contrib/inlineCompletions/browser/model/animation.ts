/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { ISettableObservable, observableValue, ITransaction, IReader, observableSignal } from '../../../../../base/common/observable.js';

export class AnimatedValue {
	public static const(value: number): AnimatedValue {
		return new AnimatedValue(value, value, 0);
	}

	public readonly startTimeMs = Date.now();

	constructor(
		public readonly startValue: number,
		public readonly endValue: number,
		public readonly durationMs: number,
		private readonly _interpolationFunction: InterpolationFunction = easeOutExpo,
	) {
		if (startValue === endValue) {
			this.durationMs = 0;
		}
	}

	isFinished(): boolean {
		return Date.now() >= this.startTimeMs + this.durationMs;
	}

	getValue(): number {
		const timePassed = Date.now() - this.startTimeMs;
		if (timePassed >= this.durationMs) {
			return this.endValue;
		}
		const value = this._interpolationFunction(timePassed, this.startValue, this.endValue - this.startValue, this.durationMs);
		return value;
	}
}

type InterpolationFunction = (passedTime: number, start: number, length: number, totalDuration: number) => number;

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

export class ObservableAnimatedValue {
	public static const(value: number): ObservableAnimatedValue {
		return new ObservableAnimatedValue(AnimatedValue.const(value));
	}

	private readonly _value: ISettableObservable<AnimatedValue>;

	constructor(
		initialValue: AnimatedValue,
	) {
		this._value = observableValue(this, initialValue);
	}

	setAnimation(value: AnimatedValue, tx: ITransaction | undefined): void {
		this._value.set(value, tx);
	}

	changeAnimation(fn: (prev: AnimatedValue) => AnimatedValue, tx: ITransaction | undefined): void {
		const value = fn(this._value.get());
		this._value.set(value, tx);
	}

	getValue(reader: IReader | undefined): number {
		const value = this._value.read(reader);
		if (!value.isFinished()) {
			AnimationFrameScheduler.instance.invalidateOnNextAnimationFrame(reader);
		}
		return value.getValue();
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
