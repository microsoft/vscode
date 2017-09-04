/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { FeedbackDropdown, IFeedback, IFeedbackService } from './feedback';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import product from 'vs/platform/node/product';
import { Themable, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_FOREGROUND } from 'vs/workbench/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

class TwitterFeedbackService implements IFeedbackService {

	private static TWITTER_URL: string = 'https://twitter.com/intent/tweet';
	private static VIA_NAME: string = 'code';
	private static HASHTAGS: string[] = ['HappyCoding'];

	private combineHashTagsAsString(): string {
		return TwitterFeedbackService.HASHTAGS.join(',');
	}

	public submitFeedback(feedback: IFeedback): void {
		const queryString = `?${feedback.sentiment === 1 ? `hashtags=${this.combineHashTagsAsString()}&` : null}ref_src=twsrc%5Etfw&related=twitterapi%2Ctwitter&text=${feedback.feedback}&tw_p=tweetbutton&via=${TwitterFeedbackService.VIA_NAME}`;
		const url = TwitterFeedbackService.TWITTER_URL + queryString;

		window.open(url);
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

export class FeedbackStatusbarItem extends Themable implements IStatusbarItem {
	private dropdown: FeedbackDropdown;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceRoots(() => this.updateStyles()));
	}

	protected updateStyles(): void {
		super.updateStyles();

		if (this.dropdown) {
			this.dropdown.label.style('background-color', this.getColor(this.contextService.hasWorkspace() ? STATUS_BAR_FOREGROUND : STATUS_BAR_NO_FOLDER_FOREGROUND));
		}
	}

	public render(element: HTMLElement): IDisposable {
		if (product.sendASmile) {
			this.dropdown = this.instantiationService.createInstance(FeedbackDropdown, element, {
				contextViewProvider: this.contextViewService,
				feedbackService: this.instantiationService.createInstance(TwitterFeedbackService)
			});

			this.updateStyles();

			return this.dropdown;
		}

		return null;
	}
}