/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hide, show } from '../../dom.js';
import { getProgressAccessibilitySignalScheduler } from './progressAccessibilitySignal.js';
import { RunOnceScheduler } from '../../../common/async.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../common/lifecycle.js';
import { isNumber } from '../../../common/types.js';
import './progressbar.css';

const CSS_DONE = 'done';
const CSS_ACTIVE = 'active';
const CSS_INFINITE = 'infinite';
const CSS_INFINITE_LONG_RUNNING = 'infinite-long-running';
const CSS_DISCRETE = 'discrete';

export interface IProgressBarOptions extends IProgressBarStyles {
}

export interface IProgressBarStyles {
	progressBarBackground: string | undefined;
}

export const unthemedProgressBarOptions: IProgressBarOptions = {
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
	private static readonly LONG_RUNNING_INFINITE_THRESHOLD = 10000;

	private static readonly PROGRESS_SIGNAL_DEFAULT_DELAY = 3000;

	private workedVal: number;
	private element!: HTMLElement;
	private bit!: HTMLElement;
	private totalWork: number | undefined;
	private showDelayedScheduler: RunOnceScheduler;
	private longRunningScheduler: RunOnceScheduler;
	private readonly progressSignal = this._register(new MutableDisposable<IDisposable>());

	constructor(container: HTMLElement, options?: IProgressBarOptions) {
		super();

		this.workedVal = 0;

		this.showDelayedScheduler = this._register(new RunOnceScheduler(() => show(this.element), 0));
		this.longRunningScheduler = this._register(new RunOnceScheduler(() => this.infiniteLongRunning(), ProgressBar.LONG_RUNNING_INFINITE_THRESHOLD));

		this.create(container, options);
	}

	private create(container: HTMLElement, options?: IProgressBarOptions): void {
		this.element = document.createElement('div');
		this.element.classList.add('monaco-progress-container');
		this.element.setAttribute('role', 'progressbar');
		this.element.setAttribute('aria-valuemin', '0');
		container.appendChild(this.element);

		this.bit = document.createElement('div');
		this.bit.classList.add('progress-bit');
		this.bit.style.backgroundColor = options?.progressBarBackground || '#0E70C0';
		this.element.appendChild(this.bit);
	}

	private off(): void {
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
	done(): ProgressBar {
		return this.doDone(true);
	}

	/**
	 * Stops the progressbar from showing any progress instantly without fading out.
	 */
	stop(): ProgressBar {
		return this.doDone(false);
	}

	private doDone(delayed: boolean): ProgressBar {
		this.element.classList.add(CSS_DONE);

		// discrete: let it grow to 100% width and hide afterwards
		if (!this.element.classList.contains(CSS_INFINITE)) {
			this.bit.style.width = 'inherit';

			if (delayed) {
				setTimeout(() => this.off(), 200);
			} else {
				this.off();
			}
		}

		// infinite: let it fade out and hide afterwards
		else {
			this.bit.style.opacity = '0';
			if (delayed) {
				setTimeout(() => this.off(), 200);
			} else {
				this.off();
			}
		}

		return this;
	}

	/**
	 * Use this mode to indicate progress that has no total number of work units.
	 */
	infinite(): ProgressBar {
		this.bit.style.width = '2%';
		this.bit.style.opacity = '1';

		this.element.classList.remove(CSS_DISCRETE, CSS_DONE, CSS_INFINITE_LONG_RUNNING);
		this.element.classList.add(CSS_ACTIVE, CSS_INFINITE);

		this.longRunningScheduler.schedule();

		return this;
	}

	private infiniteLongRunning(): void {
		this.element.classList.add(CSS_INFINITE_LONG_RUNNING);
	}

	/**
	 * Tells the progress bar the total number of work. Use in combination with workedVal() to let
	 * the progress bar show the actual progress based on the work that is done.
	 */
	total(value: number): ProgressBar {
		this.workedVal = 0;
		this.totalWork = value;
		this.element.setAttribute('aria-valuemax', value.toString());

		return this;
	}

	/**
	 * Finds out if this progress bar is configured with total work
	 */
	hasTotal(): boolean {
		return isNumber(this.totalWork);
	}

	/**
	 * Tells the progress bar that an increment of work has been completed.
	 */
	worked(value: number): ProgressBar {
		value = Math.max(1, Number(value));

		return this.doSetWorked(this.workedVal + value);
	}

	/**
	 * Tells the progress bar the total amount of work (0 to 100) that has been completed.
	 */
	setWorked(value: number): ProgressBar {
		value = Math.max(1, Number(value));

		return this.doSetWorked(value);
	}

	private doSetWorked(value: number): ProgressBar {
		const totalWork = this.totalWork || 100;

		this.workedVal = value;
		this.workedVal = Math.min(totalWork, this.workedVal);

		this.element.classList.remove(CSS_INFINITE, CSS_INFINITE_LONG_RUNNING, CSS_DONE);
		this.element.classList.add(CSS_ACTIVE, CSS_DISCRETE);
		this.element.setAttribute('aria-valuenow', value.toString());

		this.bit.style.width = 100 * (this.workedVal / (totalWork)) + '%';

		return this;
	}

	getContainer(): HTMLElement {
		return this.element;
	}

	show(delay?: number): void {
		this.showDelayedScheduler.cancel();
		this.progressSignal.value = getProgressAccessibilitySignalScheduler(ProgressBar.PROGRESS_SIGNAL_DEFAULT_DELAY);

		if (typeof delay === 'number') {
			this.showDelayedScheduler.schedule(delay);
		} else {
			show(this.element);
		}
	}

	hide(): void {
		hide(this.element);

		this.showDelayedScheduler.cancel();
		this.progressSignal.clear();
	}
}
