/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./progressbar';
import { TPromise, ValueCallback } from 'vs/base/common/winjs.base';
import assert = require('vs/base/common/assert');
import { Builder, $ } from 'vs/base/browser/builder';
import DOM = require('vs/base/browser/dom');
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

const css_done = 'done';
const css_active = 'active';
const css_infinite = 'infinite';
const css_discrete = 'discrete';
const css_progress_container = 'progress-container';
const css_progress_bit = 'progress-bit';

/**
 * A progress bar with support for infinite or discrete progress.
 */
export class ProgressBar {

	private toUnbind: IDisposable[];
	private workedVal: number;
	private element: Builder;
	private animationRunning: boolean;
	private bit: HTMLElement;
	private totalWork: number;
	private animationStopToken: ValueCallback;

	constructor(builder: Builder) {
		this.toUnbind = [];
		this.workedVal = 0;

		this.create(builder);
	}

	private create(parent: Builder): void {
		parent.div({ 'class': css_progress_container }, (builder) => {
			this.element = builder.clone();

			builder.div({ 'class': css_progress_bit }).on([DOM.EventType.ANIMATION_START, DOM.EventType.ANIMATION_END, DOM.EventType.ANIMATION_ITERATION], (e: Event) => {
				switch (e.type) {
					case DOM.EventType.ANIMATION_START:
					case DOM.EventType.ANIMATION_END:
						this.animationRunning = e.type === DOM.EventType.ANIMATION_START;
						break;

					case DOM.EventType.ANIMATION_ITERATION:
						if (this.animationStopToken) {
							this.animationStopToken(null);
						}
						break;
				}

			}, this.toUnbind);

			this.bit = builder.getHTMLElement();
		});
	}

	private off(): void {
		this.bit.style.width = 'inherit';
		this.bit.style.opacity = '1';
		this.element.removeClass(css_active);
		this.element.removeClass(css_infinite);
		this.element.removeClass(css_discrete);

		this.workedVal = 0;
		this.totalWork = undefined;
	}

	/**
	 * Indicates to the progress bar that all work is done.
	 */
	public done(): ProgressBar {
		return this.doDone(true);
	}

	/**
	 * Stops the progressbar from showing any progress instantly without fading out.
	 */
	public stop(): ProgressBar {
		return this.doDone(false);
	}

	private doDone(delayed: boolean): ProgressBar {
		this.element.addClass(css_done);

		// let it grow to 100% width and hide afterwards
		if (!this.element.hasClass(css_infinite)) {
			this.bit.style.width = 'inherit';

			if (delayed) {
				TPromise.timeout(200).then(() => this.off());
			} else {
				this.off();
			}
		}

		// let it fade out and hide afterwards
		else {
			this.bit.style.opacity = '0';
			if (delayed) {
				TPromise.timeout(200).then(() => this.off());
			} else {
				this.off();
			}
		}

		return this;
	}

	/**
	 * Use this mode to indicate progress that has no total number of work units.
	 */
	public infinite(): ProgressBar {
		this.bit.style.width = '2%';
		this.bit.style.opacity = '1';

		this.element.removeClass(css_discrete);
		this.element.removeClass(css_done);
		this.element.addClass(css_active);
		this.element.addClass(css_infinite);

		return this;
	}

	/**
	 * Tells the progress bar the total number of work. Use in combination with workedVal() to let
	 * the progress bar show the actual progress based on the work that is done.
	 */
	public total(value: number): ProgressBar {
		this.workedVal = 0;
		this.totalWork = value;

		return this;
	}

	/**
	 * Finds out if this progress bar is configured with total work
	 */
	public hasTotal(): boolean {
		return !isNaN(this.totalWork);
	}

	/**
	 * Tells the progress bar that an amount of work has been completed.
	 */
	public worked(value: number): ProgressBar {
		assert.ok(!isNaN(this.totalWork), 'Total work not set');

		value = Number(value);
		assert.ok(!isNaN(value), 'Value is not a number');
		value = Math.max(1, value);

		this.workedVal += value;
		this.workedVal = Math.min(this.totalWork, this.workedVal);

		if (this.element.hasClass(css_infinite)) {
			this.element.removeClass(css_infinite);
		}

		if (this.element.hasClass(css_done)) {
			this.element.removeClass(css_done);
		}

		if (!this.element.hasClass(css_active)) {
			this.element.addClass(css_active);
		}

		if (!this.element.hasClass(css_discrete)) {
			this.element.addClass(css_discrete);
		}

		this.bit.style.width = 100 * (this.workedVal / this.totalWork) + '%';

		return this;
	}

	/**
	 * Returns the builder this progress bar is building in.
	 */
	public getContainer(): Builder {
		return $(this.element);
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}