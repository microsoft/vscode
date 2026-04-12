/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { observableValue, observableSignal } from '../../../../../base/common/observable.js';
export class AnimatedValue {
    static const(value) {
        return new AnimatedValue(value, value, 0);
    }
    constructor(startValue, endValue, durationMs, _interpolationFunction = easeOutExpo) {
        this.startValue = startValue;
        this.endValue = endValue;
        this.durationMs = durationMs;
        this._interpolationFunction = _interpolationFunction;
        this.startTimeMs = Date.now();
        if (startValue === endValue) {
            this.durationMs = 0;
        }
    }
    isFinished() {
        return Date.now() >= this.startTimeMs + this.durationMs;
    }
    getValue() {
        const timePassed = Date.now() - this.startTimeMs;
        if (timePassed >= this.durationMs) {
            return this.endValue;
        }
        const value = this._interpolationFunction(timePassed, this.startValue, this.endValue - this.startValue, this.durationMs);
        return value;
    }
}
export function easeOutExpo(passedTime, start, length, totalDuration) {
    return passedTime === totalDuration
        ? start + length
        : length * (-Math.pow(2, -10 * passedTime / totalDuration) + 1) + start;
}
export function easeOutCubic(passedTime, start, length, totalDuration) {
    return length * ((passedTime = passedTime / totalDuration - 1) * passedTime * passedTime + 1) + start;
}
export function linear(passedTime, start, length, totalDuration) {
    return length * passedTime / totalDuration + start;
}
export class ObservableAnimatedValue {
    static const(value) {
        return new ObservableAnimatedValue(AnimatedValue.const(value));
    }
    constructor(initialValue) {
        this._value = observableValue(this, initialValue);
    }
    setAnimation(value, tx) {
        this._value.set(value, tx);
    }
    changeAnimation(fn, tx) {
        const value = fn(this._value.get());
        this._value.set(value, tx);
    }
    getValue(reader) {
        const value = this._value.read(reader);
        if (!value.isFinished()) {
            AnimationFrameScheduler.instance.invalidateOnNextAnimationFrame(reader);
        }
        return value.getValue();
    }
}
export class AnimationFrameScheduler {
    constructor() {
        this._counter = observableSignal(this);
        this._isScheduled = false;
    }
    static { this.instance = new AnimationFrameScheduler(); }
    invalidateOnNextAnimationFrame(reader) {
        this._counter.read(reader);
        if (!this._isScheduled) {
            this._isScheduled = true;
            getActiveWindow().requestAnimationFrame(() => {
                this._isScheduled = false;
                this._update();
            });
        }
    }
    _update() {
        this._counter.trigger(undefined);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9hbmltYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBdUIsZUFBZSxFQUF5QixnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRXpJLE1BQU0sT0FBTyxhQUFhO0lBQ2xCLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBYTtRQUNoQyxPQUFPLElBQUksYUFBYSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUlELFlBQ2lCLFVBQWtCLEVBQ2xCLFFBQWdCLEVBQ2hCLFVBQWtCLEVBQ2pCLHlCQUFnRCxXQUFXO1FBSDVELGVBQVUsR0FBVixVQUFVLENBQVE7UUFDbEIsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNoQixlQUFVLEdBQVYsVUFBVSxDQUFRO1FBQ2pCLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBcUM7UUFON0QsZ0JBQVcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFReEMsSUFBSSxVQUFVLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFDckIsQ0FBQztJQUNGLENBQUM7SUFFRCxVQUFVO1FBQ1QsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3pELENBQUM7SUFFRCxRQUFRO1FBQ1AsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxXQUFXLENB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