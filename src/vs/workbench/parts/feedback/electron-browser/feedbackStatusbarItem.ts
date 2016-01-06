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
import {IRequestService} from 'vs/platform/request/common/request';

import shell = require('shell');

class TwitterFeedbackService implements IFeedbackService {

	private serviceUrl: string;

	private static TWITTER_URL: string = 'https://twitter.com/intent/tweet';

	public submitFeedback(feedback: IFeedback): void {
		var queryString = `?${feedback.sentiment === 1 ? 'hashtags=LoveVSCode&' : null}ref_src=twsrc%5Etfw&related=twitterapi%2Ctwitter&text=${feedback.feedback}&tw_p=tweetbutton&via=code`;
		var url = TwitterFeedbackService.TWITTER_URL + queryString;
		shell.openExternal(url);
	}
}

export class FeedbackStatusbarItem implements IStatusbarItem {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService
	) {
	}

	public render(element: HTMLElement): IDisposable {
		return this.instantiationService.createInstance(FeedbackDropdown, element, {
			contextViewProvider: this.contextViewService,
			feedbackService: this.instantiationService.createInstance(TwitterFeedbackService)
		});
	}
}