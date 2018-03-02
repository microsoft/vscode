/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { FeedbackDropdown, IFeedback, IFeedbackService, FEEDBACK_VISIBLE_CONFIG } from 'vs/workbench/parts/feedback/electron-browser/feedback';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import product from 'vs/platform/node/product';
import { Themable, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_ITEM_HOVER_BACKGROUND } from 'vs/workbench/common/theme';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { clearNode, EventHelper } from 'vs/base/browser/dom';
import { $ } from 'vs/base/browser/builder';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';

class TwitterFeedbackService implements IFeedbackService {

	private static TWITTER_URL: string = 'https://twitter.com/intent/tweet';
	private static VIA_NAME: string = 'code';
	private static HASHTAGS: string[] = ['HappyCoding'];

	private combineHashTagsAsString(): string {
		return TwitterFeedbackService.HASHTAGS.join(',');
	}

	public submitFeedback(feedback: IFeedback): void {
		const queryString = `?${feedback.sentiment === 1 ? `hashtags=${this.combineHashTagsAsString()}&` : null}ref_src=twsrc%5Etfw&related=twitterapi%2Ctwitter&text=${encodeURIComponent(feedback.feedback)}&tw_p=tweetbutton&via=${TwitterFeedbackService.VIA_NAME}`;
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

		return 280 - length;
	}
}

export class FeedbackStatusbarItem extends Themable implements IStatusbarItem {
	private dropdown: FeedbackDropdown;
	private enabled: boolean;
	private container: HTMLElement;
	private hideAction: HideAction;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.enabled = this.configurationService.getValue(FEEDBACK_VISIBLE_CONFIG);

		this.hideAction = this.instantiationService.createInstance(HideAction);
		this.toUnbind.push(this.hideAction);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.contextService.onDidChangeWorkbenchState(() => this.updateStyles()));
		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration(FEEDBACK_VISIBLE_CONFIG)) {
			this.enabled = this.configurationService.getValue(FEEDBACK_VISIBLE_CONFIG);
			this.update();
		}
	}

	protected updateStyles(): void {
		super.updateStyles();

		if (this.dropdown) {
			this.dropdown.label.style('background-color', this.getColor(this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_FOREGROUND : STATUS_BAR_NO_FOLDER_FOREGROUND));
		}
	}

	public render(element: HTMLElement): IDisposable {
		this.container = element;

		// Prevent showing dropdown on anything but left click
		$(this.container).on('mousedown', (e: MouseEvent) => {
			if (e.button !== 0) {
				EventHelper.stop(e, true);
			}
		}, this.toUnbind, true);

		// Offer context menu to hide status bar entry
		$(this.container).on('contextmenu', e => {
			EventHelper.stop(e, true);

			this.contextMenuService.showContextMenu({
				getAnchor: () => this.container,
				getActions: () => TPromise.as([this.hideAction])
			});
		}, this.toUnbind);

		return this.update();
	}

	private update(): IDisposable {
		const enabled = product.sendASmile && this.enabled;

		// Create
		if (enabled) {
			if (!this.dropdown) {
				this.dropdown = this.instantiationService.createInstance(FeedbackDropdown, this.container, {
					contextViewProvider: this.contextViewService,
					feedbackService: this.instantiationService.createInstance(TwitterFeedbackService)
				});
				this.toUnbind.push(this.dropdown);

				this.updateStyles();

				return this.dropdown;
			}
		}

		// Dispose
		else {
			dispose(this.dropdown);
			this.dropdown = void 0;
			clearNode(this.container);
		}

		return null;
	}
}

class HideAction extends Action {

	constructor(
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService
	) {
		super('feedback.hide', localize('hide', "Hide"));
	}

	public run(extensionId: string): TPromise<any> {
		return this.configurationService.updateValue(FEEDBACK_VISIBLE_CONFIG, false);
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const statusBarItemHoverBackground = theme.getColor(STATUS_BAR_ITEM_HOVER_BACKGROUND);
	if (statusBarItemHoverBackground) {
		collector.addRule(`.monaco-workbench > .part.statusbar > .statusbar-item .monaco-dropdown.send-feedback:hover { background-color: ${statusBarItemHoverBackground}; }`);
	}
});
