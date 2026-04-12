/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { hide, show } from '../../dom.js';
import { getProgressAccessibilitySignalScheduler } from './progressAccessibilitySignal.js';
import { RunOnceScheduler } from '../../../common/async.js';
import { Disposable, MutableDisposable } from '../../../common/lifecycle.js';
import { isNumber } from '../../../common/types.js';
import { localize } from '../../../../nls.js';
import './progressbar.css';
const CSS_DONE = 'done';
const CSS_ACTIVE = 'active';
const CSS_INFINITE = 'infinite';
const CSS_INFINITE_LONG_RUNNING = 'infinite-long-running';
const CSS_DISCRETE = 'discrete';
const NLS_PROGRESS_LABEL = localize('progress', "Progress");
export const unthemedProgressBarOptions = {
    progressBarBackground: undefined
};
/**
 * A progress bar with support for infinite or discrete progress.
 */
export class ProgressBar extends Disposable {
    /**
     * After a certain time of showing the progress bar, switch
     * to long-running mode and throttle animations to reduce
     * the pressure on the GPU process.
     *
     * https://github.com/microsoft/vscode/issues/97900
     * https://github.com/microsoft/vscode/issues/138396
     */
    static { this.LONG_RUNNING_INFINITE_THRESHOLD = 10000; }
    static { this.PROGRESS_SIGNAL_DEFAULT_DELAY = 3000; }
    constructor(container, options) {
        super();
        this.progressSignal = this._register(new MutableDisposable());
        this.workedVal = 0;
        this.showDelayedScheduler = this._register(new RunOnceScheduler(() => show(this.element), 0));
        this.longRunningScheduler = this._register(new RunOnceScheduler(() => this.infiniteLongRunning(), ProgressBar.LONG_RUNNING_INFINITE_THRESHOLD));
        this.create(container, options);
    }
    create(container, options) {
        this.element = document.createElement('div');
        this.element.classList.add('monaco-progress-container');
        this.element.setAttribute('role', 'progressbar');
        this.element.setAttribute('aria-valuemin', '0');
        this.element.setAttribute('aria-label', options?.ariaLabel && options.ariaLabel.trim() ? options.ariaLabel : NLS_PROGRESS_LABEL);
        container.appendChild(this.element);
        this.bit = document.createElement('div');
        this.bit.classList.add('progress-bit');
        this.bit.style.backgroundColor = options?.progressBarBackground || '#0E70C0';
        this.element.appendChild(this.bit);
    }
    off() {
        this.bit.style.width = 'inherit';
        this.bit.style.opacity = '1';
        this.element.classList.remove(CSS_ACTIVE, CSS_INFINITE, CSS_INFINITE_LONG_RUNNING, CSS_DISCRETE);
        this.workedVal = 0;
        this.totalWork = undefined;
        this.longRunningScheduler.cancel();
        this.progressSignal.clear();
    }
    /**
     * Indicates to the progress bar that all work is done.
     */
    done() {
        return this.doDone(true);
    }
    /**
     * Stops the progressbar from showing any progress instantly without fading out.
     */
    stop() {
        return this.doDone(false);
    }
    doDone(delayed) {
        this.element.classList.add(CSS_DONE);
        // discrete: let it grow to 100% width and hide afterwards
        if (!this.element.classList.contains(CSS_INFINITE)) {
            this.bit.style.width = 'inherit';
            if (delayed) {
                setTimeout(() => this.off(), 200);
            }
            else {
                this.off();
            }
        }
        // infinite: let it fade out and hide afterwards
        else {
            this.bit.style.opacity = '0';
            if (delayed) {
                setTimeout(() => this.off(), 200);
            }
            else {
                this.off();
            }
        }
        return this;
    }
    /**
     * Use this mode to indicate progress that has no total number of work units.
     */
    infinite() {
        this.bit.style.width = '2%';
        this.bit.style.opacity = '1';
        this.element.classList.remove(CSS_DISCRETE, CSS_DONE, CSS_INFINITE_LONG_RUNNING);
        this.element.classList.add(CSS_ACTIVE, CSS_INFINITE);
        this.longRunningScheduler.schedule();
        return this;
    }
    infiniteLongRunning() {
        this.element.classList.add(CSS_INFINITE_LONG_RUNNING);
    }
    /**
     * Tells the progress bar the total number of work. Use in combination with workedVal() to let
     * the progress bar show the actual progress based on the work that is done.
     */
    total(value) {
        this.workedVal = 0;
        this.totalWork = value;
        this.element.setAttribute('aria-valuemax', value.toString());
        return this;
    }
    /**
     * Finds out if this progress bar is configured with total work
     */
    hasTotal() {
        return isNumber(this.totalWork);
    }
    /**
     * Tells the progress bar that an increment of work has been completed.
     */
    worked(value) {
        value = Math.max(1, Number(value));
        return this.doSetWorked(this.workedVal + value);
    }
    /**
     * Tells the progress bar the total amount of work (0 to 100) that has been completed.
     */
    setWorked(value) {
        value = Math.max(1, Number(value));
        return this.doSetWorked(value);
    }
    doSetWorked(value) {
        const totalWork = this.totalWork || 100;
        this.workedVal = value;
        this.workedVal = Math.min(totalWork, this.workedVal);
        this.element.classList.remove(CSS_INFINITE, CSS_INFINITE_LONG_RUNNING, CSS_DONE);
        this.element.classList.add(CSS_ACTIVE, CSS_DISCRETE);
        this.element.setAttribute('aria-valuenow', value.toString());
        this.bit.style.width = 100 * (this.workedVal / (totalWork)) + '%';
        return this;
    }
    getContainer() {
        return this.element;
    }
    show(delay) {
        this.showDelayedScheduler.cancel();
        this.progressSignal.value = getProgressAccessibilitySignalScheduler(ProgressBar.PROGRESS_SIGNAL_DEFAULT_DELAY);
        if (typeof delay === 'number') {
            this.showDelayedScheduler.schedule(delay);
        }
        else {
            show(this.element);
        }
    }
    hide() {
        hide(this.element);
        this.showDelayedScheduler.cancel();
        this.progressSignal.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZ3Jlc3NiYXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDMUMsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxtQkFBbUIsQ0FBQztBQUUzQixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUM7QUFDeEIsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDO0FBQzVCLE1BQU0sWUFBWSxHQUFHLFVBQVUsQ0FBQztBQUNoQyxNQUFNLHlCQUF5QixHQUFHLHVCQUF1QixDQUFDO0FBQzFELE1BQU0sWUFBWSxHQUFHLFVBQVUsQ0FBQztBQUNoQyxNQUFNLGtCQUFrQixHQUFHLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFVNUQsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQXdCO0lBQzlELHFCQUFxQixFQUFFLFNBQVM7Q0FDaEMsQ0FBQztBQUVGOztHQUVHO0FBQ0gsTUFBTSxPQUFPLFdBQVksU0FBUSxVQUFVO0lBRTFDOzs7Ozs7O09BT0c7YUFDcUIsb0NBQStCLEdBQUcsS0FBSyxBQUFSLENBQVM7YUFFeEMsa0NBQTZCLEdBQUcsSUFBSSxBQUFQLENB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