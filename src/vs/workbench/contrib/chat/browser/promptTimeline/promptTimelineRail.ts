/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { PromptTick } from './promptTimelineModel.js';

export interface IPromptReviewFileEvent {
	readonly tick: PromptTick;
	readonly file: URI;
}

/** Navigation shared by the prompt gutter and overview ruler. */
export interface IPromptTimelineRail extends IDisposable {
	readonly domNode: HTMLElement;

	/** Fired when a mark is chosen (click / keyboard), with its request id. */
	readonly onDidSelect: Event<string>;
	setTicks(ticks: readonly PromptTick[]): void;

	setActive(requestId: string | undefined): void;
	focusTick(requestId: string): void;
	setHostWidth(width: number): void;
}
