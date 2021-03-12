/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { FeedbackWidget, IFeedback, IFeedbackDelegate } from 'vs/workbench/contrib/feedback/browser/feedback';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntry, IStatusbarEntryAccessor } from 'vs/workbench/services/statusbar/common/statusbar';
import { localize } from 'vs/nls';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { assertIsDefined } from 'vs/base/common/types';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { HIDE_NOTIFICATIONS_CENTER, HIDE_NOTIFICATION_TOAST } from 'vs/workbench/browser/parts/notifications/notificationsCommands';

class TwitterFeedbackService implements IFeedbackDelegate {

	private static TWITTER_URL: string = 'https://twitter.com/intent/tweet';
	private static VIA_NAME: string = 'code';
	private static HASHTAGS: string[] = ['HappyCoding'];

	private combineHashTagsAsString(): string {
		return TwitterFeedbackService.HASHTAGS.join(',');
	}

	submitFeedback(feedback: IFeedback, openerService: IOpenerService): void {
		const queryString = `?${feedback.sentiment === 1 ? `hashtags=${this.combineHashTagsAsString()}&` : ''}ref_src=twsrc%5Etfw&related=twitterapi%2Ctwitter&text=${encodeURIComponent(feedback.feedback)}&tw_p=tweetbutton&via=${TwitterFeedbackService.VIA_NAME}`;
		const url = TwitterFeedbackService.TWITTER_URL + queryString;

		openerService.open(URI.parse(url));
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

	private static readonly TOGGLE_FEEDBACK_COMMAND = 'help.tweetFeedback';

	private widget: FeedbackWidget | undefined;
	private entry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IProductService productService: IProductService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		if (productService.sendASmile) {
			this.createFeedbackStatusEntry();
			this.registerListeners();
		}
	}

	private createFeedbackStatusEntry(): void {

		// Status entry
		this.entry = this._register(this.statusbarService.addEntry(this.getStatusEntry(), 'status.feedback', localize('status.feedback', "Tweet Feedback"), StatusbarAlignment.RIGHT, -100 /* towards the end of the right hand side */));

		// Command to toggle
		CommandsRegistry.registerCommand(FeedbackStatusbarConribution.TOGGLE_FEEDBACK_COMMAND, () => this.toggleFeedback());
		MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: FeedbackStatusbarConribution.TOGGLE_FEEDBACK_COMMAND,
				category: CATEGORIES.Help,
				title: localize('status.feedback', "Tweet Feedback")
			}
		});
	}

	private registerListeners(): void {

		// Hide feedback widget whenever notifications appear
		this._register(this.layoutService.onDidChangeNotificationsVisibility(visible => {
			if (visible) {
				this.widget?.hide();
			}
		}));
	}

	private createFeedbackWidget(): void {
		const statusContainer = document.getElementById('status.feedback');
		if (statusContainer) {
			const icon = assertIsDefined(statusContainer.getElementsByClassName('codicon').item(0) as HTMLElement | null);

			this.widget = this._register(this.instantiationService.createInstance(FeedbackWidget, icon, {
				contextViewProvider: this.contextViewService,
				feedbackService: this.instantiationService.createInstance(TwitterFeedbackService),
				onFeedbackVisibilityChange: visible => this.entry?.update(this.getStatusEntry(visible))
			}));
		}
	}

	private toggleFeedback(): void {
		if (!this.widget) {
			this.createFeedbackWidget();
		}

		// Hide when visible
		if (this.widget?.isVisible()) {
			this.widget.hide();
		}

		// Show when hidden
		else {
			this.commandService.executeCommand(HIDE_NOTIFICATION_TOAST);
			this.commandService.executeCommand(HIDE_NOTIFICATIONS_CENTER);
			this.widget?.show();
		}
	}

	private getStatusEntry(showBeak?: boolean): IStatusbarEntry {
		return {
			text: '$(feedback)',
			ariaLabel: localize('status.feedback', "Tweet Feedback"),
			tooltip: localize('status.feedback', "Tweet Feedback"),
			command: FeedbackStatusbarConribution.TOGGLE_FEEDBACK_COMMAND,
			showBeak
		};
	}
}
