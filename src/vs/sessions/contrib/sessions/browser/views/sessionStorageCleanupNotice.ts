/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ISessionWorktreeCleanupService, ISessionWorktreeCleanupSuggestion } from '../../../sessionInputBanners/browser/sessionWorktreeCleanupService.js';

export class SessionStorageCleanupNotice extends Disposable {

	readonly domNode: HTMLElement;
	private suggestion: ISessionWorktreeCleanupSuggestion | undefined;

	constructor(
		private readonly focusSessionsList: () => void,
		private readonly announceStatus: (message: string) => void,
		@ISessionWorktreeCleanupService private readonly cleanupService: ISessionWorktreeCleanupService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.domNode = DOM.$('.agent-sessions-storage-cleanup-notice', {
			role: 'region',
			'aria-label': localize('sessionStorageCleanupNotice.ariaLabel', "Session Storage Cleanup Suggestion"),
		});
		const content = DOM.append(this.domNode, DOM.$('.agent-sessions-storage-cleanup-notice-content'));
		const icon = DOM.append(content, DOM.$('.agent-sessions-storage-cleanup-notice-icon', { 'aria-hidden': 'true' }));
		icon.appendChild(renderIcon(Codicon.database));
		const description = DOM.append(content, DOM.$('.agent-sessions-storage-cleanup-notice-description'));

		const dismissButton = DOM.append(content, DOM.$('button.agent-sessions-storage-cleanup-notice-dismiss')) as HTMLButtonElement;
		dismissButton.type = 'button';
		dismissButton.appendChild(renderIcon(Codicon.close));
		const dismissLabel = localize('sessionStorageCleanupNotice.dismiss', "Dismiss Session Storage Suggestion");
		dismissButton.setAttribute('aria-label', dismissLabel);
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), dismissButton, dismissLabel));
		this._register(DOM.addDisposableListener(dismissButton, DOM.EventType.CLICK, event => {
			DOM.EventHelper.stop(event, true);
			this.suggestion?.dismiss();
			this.focusSessionsList();
		}));

		const actions = DOM.append(this.domNode, DOM.$('.agent-sessions-storage-cleanup-notice-actions'));
		const manageButton = this._register(new Button(actions, defaultButtonStyles));
		manageButton.label = localize('sessionStorageCleanupNotice.manage', "Manage Agent Session Storage");
		this._register(manageButton.onDidClick(() => {
			void this.suggestion?.manage().catch(error => this.notificationService.error(error));
		}));

		const disableButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		disableButton.label = localize('sessionStorageCleanupNotice.disable', "Don't Show Again");
		this._register(disableButton.onDidClick(() => {
			const disabling = this.suggestion?.disable();
			this.focusSessionsList();
			void disabling?.catch(error => this.notificationService.error(error));
		}));

		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Escape' && this.suggestion) {
				event.preventDefault();
				event.stopPropagation();
				this.suggestion.dismiss();
				this.focusSessionsList();
			}
		}));

		let suggestionWasVisible = false;
		this._register(autorun(reader => {
			this.suggestion = this.cleanupService.suggestion.read(reader);
			const available = this.suggestion !== undefined;
			this.domNode.classList.toggle('visible', available);
			description.textContent = this.suggestion?.description ?? '';
			manageButton.enabled = available;
			disableButton.enabled = available;
			dismissButton.disabled = !available;
			if (available && !suggestionWasVisible) {
				this.announceStatus(localize(
					'sessionStorageCleanupNotice.announcement',
					"{0} Run Manage Agent Session Storage to review it. To stop these suggestions, run Disable Session Storage Cleanup Suggestions.",
					this.suggestion?.description,
				));
			}
			suggestionWasVisible = available;
		}));

		void this.cleanupService.activate().catch(error => this.logService.warn('[SessionStorageCleanupNotice] Failed to measure session storage', error));
	}
}
