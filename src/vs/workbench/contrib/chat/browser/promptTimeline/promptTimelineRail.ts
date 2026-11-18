/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IPromptScrollLayout, PromptFileDiff, PromptTick } from './promptTimelineModel.js';

export interface IPromptReviewFileEvent {
	readonly tick: PromptTick;
	readonly file: URI;
}

/**
 * A prompt timeline rail: a presentation-only vertical strip pinned beside the
 * chat transcript's native scrollbar that renders one mark per prompt and lets the
 * user preview, jump to, and review each prompt. Rendered as a proportional
 * overview ruler, like the editor overview ruler; scrolling stays with the
 * transcript's own scrollbar.
 */
/**
 * A note at a moment of the session (e.g. a progress digest), drawn on the timeline between the
 * prompts sent before and after it.
 */
export interface IPromptTimelineAnnotation {
	readonly id: string;
	readonly timestamp: number;
	readonly label: string;
	readonly icon?: ThemeIcon;
	/** Renders the note in full into `container` when it is expanded. */
	readonly renderDetail?: (container: HTMLElement) => IDisposable;
}

/**
 * For each annotation, the index of the last prompt sent at or before it, or -1 when it precedes
 * every prompt. `promptTimes` are in order.
 */
export function annotationSlots(promptTimes: readonly number[], annotations: readonly { readonly timestamp: number }[]): number[] {
	return annotations.map(a => {
		let slot = -1;
		for (let i = 0; i < promptTimes.length && promptTimes[i] <= a.timestamp; i++) {
			slot = i;
		}
		return slot;
	});
}

export interface IPromptTimelineRail extends IDisposable {
	readonly domNode: HTMLElement;

	/** Fired when a mark is chosen (click / keyboard), with its request id. */
	readonly onDidSelect: Event<string>;
	/** Fired to review all of a prompt's changes. */
	readonly onDidReview: Event<PromptTick>;
	/** Fired to review a single changed file of a prompt. */
	readonly onDidReviewFile: Event<IPromptReviewFileEvent>;

	setFilesProvider(provider: (tick: PromptTick) => readonly PromptFileDiff[]): void;
	setTicks(ticks: readonly PromptTick[]): void;

	/** Records a hard/fast wheel flick; the fan blooms only if a real transcript scroll follows shortly after. */
	notifyHardWheel(): void;
	setActive(requestId: string | undefined): void;
	focusTick(requestId: string): void;
	setHostWidth(width: number): void;

	/** Supplies proportional scroll positions for the marks. */
	setScrollLayout(layout: IPromptScrollLayout | undefined): void;

	/** Notes between the prompts, oldest first; the newest shows expanded. */
	setAnnotations(annotations: readonly IPromptTimelineAnnotation[]): void;
}
