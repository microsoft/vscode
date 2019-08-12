/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { FeedbackDropdown, IFeedback, IFeedbackDelegate } from 'vs/workbench/contrib/feedback/browser/feedback';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/product';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntry, IStatusbarEntryAccessor } from 'vs/platform/statusbar/common/statusbar';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

class TwitterFeedbackService implements IFeedbackDelegate {

	private static TWITTER_URL: string = 'https://twitter.com/intent/tweet';
	private static VIA_NAME: string = 'code';
	private static HASHTAGS: string[] = ['HappyCoding'];

	private combineHashTagsAsString(): string {
		return TwitterFeedbackService.HASHTAGS.join(',');
	}

	submitFeedback(feedback: IFeedback): void {
		const queryString = `?${feedback.sentiment === 1 ? `hashtags=${this.combineHashTagsAsString()}&` : null}ref_src=twsrc%5Etfw&related=twitterapi%2Ctwitter&text=${encodeURIComponent(feedback.feedback)}&tw_p=tweetbutton&via=${TwitterFeedbackService.VIA_NAME}`;
		const url = TwitterFeedbackService.TWITTER_URL + queryString;

		window.open(url);
	}

	getCharacterLimit(sentiment: number): number {
		let length: number = 0;
		if (sentiment === 1) {
			TwitterFeedbackService.HASHTAGS.forEach(element => {
				length += element.length + 2;
			});
		}

		if (TwitterFeedbackService.VIA_NAME) {
			length += ` via @${TwitterFeedbackService.VIA_NAME}`.length;
		}

		return 280 - length;
	}
}

export class FeedbackStatusbarConribution extends Disposable implements IWorkbenchContribution {
	private dropdown: FeedbackDropdown | undefined;
	private entry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService statusbarService: IStatusbarService,
		@IProductService productService: IProductService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		super();

		if (productService.sendASmile) {
			this.entry = this._register(statusbarService.addEntry(this.getStatusEntry(), 'status.feedback', localize('status.feedback', "Tweet Feedback"), StatusbarAlignment.RIGHT, -100 /* towards the end of the right hand side */));

			CommandsRegistry.registerCommand('_feedback.open', () => this.toggleFeedback());
		}
	}

	private toggleFeedback(): void {
		if (!this.dropdown) {
			const statusContainr = document.getElementById('status.feedback');
			if (statusContainr) {
				this.dropdown = this._register(this.instantiationService.createInstance(FeedbackDropdown, statusContainr.getElementsByClassName('octicon').item(0), {
					contextViewProvider: this.contextViewService,
					feedbackService: this.instantiationService.createInstance(TwitterFeedbackService),
					onFeedbackVisibilityChange: visible => this.entry!.update(this.getStatusEntry(visible))
				}));
			}
		}

		if (this.dropdown) {
			if (!this.dropdown.isVisible()) {
				this.dropdown.show();
			} else {
				this.dropdown.hide();
			}
		}
	}

	private getStatusEntry(showBeak?: boolean): IStatusbarEntry {
		return {
			text: '$(smiley)',
			command: '_feedback.open',
			showBeak
		};
	}

}
