/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
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
}
