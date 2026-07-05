/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesSummaryWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedObservableWithCache, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { ISessionChangesSummary } from '../../../services/sessions/common/session.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Throttler } from '../../../../base/common/async.js';

export class ChangesSummaryWidget extends Disposable {
	private readonly _summaryObs: IObservable<ISessionChangesSummary | undefined>;
	get summary() { return this._summaryObs; }

	constructor(
		@IChangesViewService changesViewService: IChangesViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const summaryRawObs = derivedObservableWithCache<ISessionChangesSummary | undefined>(this, (reader, lastValue) => {
			const isLoading = changesViewService.activeSessionLoadingObs.read(reader);
			if (isLoading) {
				return lastValue;
			}

			const entries = changesViewService.activeSessionChangesObs.read(reader);
			if (entries.length === 0) {
				return undefined;
			}

			let additions = 0, deletions = 0;
			for (const entry of entries) {
				additions += entry.insertions;
				deletions += entry.deletions;
			}

			return {
				additions,
				deletions,
				files: entries.length,
			} satisfies ISessionChangesSummary;
		});

		this._summaryObs = derivedOpts<ISessionChangesSummary | undefined>({
			equalsFn: structuralEquals
		}, reader => summaryRawObs.read(reader));
	}

	render(container: HTMLElement) {
		const element = dom.$('div.changes-summary-widget');
		container.appendChild(element);

		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
			prefix: '+',
			direction: 'topToBottom',
			cssClassName: 'changes-summary-lines-added',
			count: derived(this, (reader) => {
				return this._summaryObs.read(reader)?.additions;
			})
		}));

		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
			prefix: '-',
			direction: 'bottomToTop',
			cssClassName: 'changes-summary-lines-removed',
			count: derived(this, (reader) => {
				return this._summaryObs.read(reader)?.deletions;
			})
		}));
	}
}

interface IAnimatedCounterWidgetOptions {
	readonly prefix?: string;
	readonly cssClassName?: string;
	/**
	 * The direction of the animation when the count
	 * increases. The direction will be the opposite
	 * when the count decreases.
	 * */
	readonly direction?: 'topToBottom' | 'bottomToTop';
	readonly duration?: number;
	readonly count: IObservable<number | undefined>;
}

class AnimatedCounterWidget extends Disposable {
	private _element: HTMLElement;
	private _count: number | undefined;
	private readonly _animationOptions: KeyframeAnimationOptions;
	private readonly _updateThrottler = this._register(new Throttler());

	constructor(
		container: HTMLElement,
		private readonly _options: IAnimatedCounterWidgetOptions,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();

		const { cssClassName, duration } = _options;

		this._element = cssClassName
			? dom.$(`div.${cssClassName}`)
			: dom.$('div');

		this._element.appendChild(dom.$(`div`));
		container.appendChild(this._element);

		this._animationOptions = {
			duration: duration ?? 240,
			easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
			fill: 'both',
		} satisfies KeyframeAnimationOptions;

		this._register(autorun(reader => {
			const count = this._options.count.read(reader);
			this._updateThrottler.queue(() => this._update(count));
		}));
	}

	private async _update(count: number | undefined): Promise<void> {
		if (!this._element || this._element.children.length === 0) {
			return;
		}

		const outgoingElement = this._element.children[0];

		if (count === undefined) {
			outgoingElement.textContent = '';
			this._count = undefined;
			return;
		}

		// Create incoming element
		const incomingElementText = `${this._options.prefix ?? ''}${count}`;

		// Skip the animation when it is disabled (duration of 0) or when
		// the user prefers reduced motion, just update the text content.
		if (this._options.duration === 0 || this._accessibilityService.isMotionReduced()) {
			outgoingElement.textContent = incomingElementText;
			this._count = count;
			return;
		}

		// Measure the current width before adding the incoming element so
		// that a change in the number of digits can be animated smoothly.
		const previousWidth = this._element.getBoundingClientRect().width;

		const incomingElement = dom.$(`div`, undefined, incomingElementText);
		this._element?.appendChild(incomingElement);

		// The incoming element is content-sized, so its width is the width the
		// container will have once the outgoing element is removed. Animate the
		// container between the two widths for both growing and shrinking digit
		// counts.
		const nextWidth = incomingElement.getBoundingClientRect().width;

		if (Math.abs(previousWidth - nextWidth) > 0.5) {
			this._element.animate([
				{ width: `${previousWidth}px` },
				{ width: `${nextWidth}px` },
			], this._animationOptions);
		}

		const directionOption = this._options.direction ?? 'topToBottom';
		const directionTopBottom = directionOption === 'topToBottom'
			? count > (this._count ?? 0)
			: count < (this._count ?? 0);

		const enterFrom = directionTopBottom ? '-100%' : '100%';
		const exitTo = directionTopBottom ? '100%' : '-100%';

		incomingElement.animate([
			{ transform: `translateY(${enterFrom})`, opacity: 0 },
			{ transform: 'translateY(0)', opacity: 1 },
		], this._animationOptions);

		const exit = outgoingElement.animate([
			{ transform: 'translateY(0)', opacity: 1 },
			{ transform: `translateY(${exitTo})`, opacity: 0 },
		], this._animationOptions);

		await new Promise<void>(resolve => {
			let didCleanup = false;

			const cleanup = () => {
				if (didCleanup) {
					return;
				}

				didCleanup = true;
				this._count = count;
				this._element?.removeChild(outgoingElement);
				resolve();
			};

			exit.addEventListener('cancel', cleanup);
			exit.addEventListener('finish', cleanup);
		});
	}
}
