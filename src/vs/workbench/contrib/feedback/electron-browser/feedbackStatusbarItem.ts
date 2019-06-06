/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { FeedbackDropdown, IFeedback, IFeedbackDelegate } from 'vs/workbench/contrib/feedback/electron-browser/feedback';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import product from 'vs/platform/product/node/product';
import { Themable, STATUS_BAR_ITEM_HOVER_BACKGROUND } from 'vs/workbench/common/theme';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { clearNode, EventHelper, addClass, removeClass, addDisposableListener } from 'vs/base/browser/dom';

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

export class FeedbackStatusbarItem extends Themable implements IStatusbarItem {
	private dropdown: FeedbackDropdown | undefined;
	private container: HTMLElement;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateStyles()));
	}

	render(element: HTMLElement): IDisposable {
		this.container = element;

		// Prevent showing dropdown on anything but left click
		this._register(addDisposableListener(this.container, 'mousedown', (e: MouseEvent) => {
			if (e.button !== 0) {
				EventHelper.stop(e, true);
			}
		}, true));

		return this.update();
	}

	private update(): IDisposable {

		// Create
		if (product.sendASmile) {
			if (!this.dropdown) {
				this.dropdown = this._register(this.instantiationService.createInstance(FeedbackDropdown, this.container, {
					contextViewProvider: this.contextViewService,
					feedbackService: this.instantiationService.createInstance(TwitterFeedbackService),
					onFeedbackVisibilityChange: (visible: boolean) => {
						if (visible) {
							addClass(this.container, 'has-beak');
						} else {
							removeClass(this.container, 'has-beak');
						}
					}
				}));

				this.updateStyles();

				return this.dropdown;
			}
		}

		// Dispose
		else {
			dispose(this.dropdown);
			this.dropdown = undefined;
			clearNode(this.container);
		}

		return Disposable.None;
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const statusBarItemHoverBackground = theme.getColor(STATUS_BAR_ITEM_HOVER_BACKGROUND);
	if (statusBarItemHoverBackground) {
		collector.addRule(`.monaco-workbench .part.statusbar > .statusbar-item .monaco-dropdown.send-feedback:hover { background-color: ${statusBarItemHoverBackground}; }`);
	}
});
