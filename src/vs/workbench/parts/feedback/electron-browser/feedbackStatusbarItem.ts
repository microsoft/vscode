/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import {IStatusbarItem} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {FeedbackDropdown, IFeedback, IFeedbackService} from 'vs/workbench/parts/feedback/browser/feedback';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {shell} from 'electron';

class TwitterFeedbackService implements IFeedbackService {

	private static TWITTER_URL: string = 'https://twitter.com/intent/tweet';
	private static VIA_NAME: string = 'code';
	private static HASHTAGS: string[] = ['HappyCoding'];

	private combineHashTagsAsString(): string {
		return TwitterFeedbackService.HASHTAGS.join(',');
	}

	public submitFeedback(feedback: IFeedback): void {
		var queryString = `?${feedback.sentiment === 1 ? `hashtags=${this.combineHashTagsAsString()}&` : null}ref_src=twsrc%5Etfw&related=twitterapi%2Ctwitter&text=${feedback.feedback}&tw_p=tweetbutton&via=${TwitterFeedbackService.VIA_NAME}`;
		var url = TwitterFeedbackService.TWITTER_URL + queryString;
		shell.openExternal(url);
	}

	public getCharacterLimit(sentiment: number): number {
		let length: number = 0;
		if (sentiment === 1) {
			TwitterFeedbackService.HASHTAGS.forEach(element => {
				length += element.length + 2;
			});
		}

		if (TwitterFeedbackService.VIA_NAME) {
			length += ` via @${TwitterFeedbackService.VIA_NAME}`.length;
		}
		return 140 - length;
	}
}

export class FeedbackStatusbarItem implements IStatusbarItem {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
	}

	public render(element: HTMLElement): IDisposable {
		if (this.contextService.getConfiguration().env.sendASmile) {
			return this.instantiationService.createInstance(FeedbackDropdown, element, {
				contextViewProvider: this.contextViewService,
				feedbackService: this.instantiationService.createInstance(TwitterFeedbackService)
			});
		}
	}
}