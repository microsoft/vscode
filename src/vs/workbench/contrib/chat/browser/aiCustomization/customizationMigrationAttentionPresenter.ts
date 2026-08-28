/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationMigrationAssessment, ICustomizationMigrationAssessmentRequest, ICustomizationMigrationService } from '../../common/customizationMigrationService.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../widget/input/chatInputNoticeHost.js';
import { ChatInputStackSlot, setChatInputStackSlot } from '../widget/input/chatInputStack.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../widget/input/chatInputNoticeWidget.js';
import { AICustomizationManagementCommands } from './aiCustomizationManagement.js';

export class CustomizationMigrationAttentionPresenter extends Disposable {
	private readonly requestCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly notice = this._register(new MutableDisposable<DisposableStore>());
	private readonly lease = this._register(new MutableDisposable());
	private noticeWidget: ChatInputNoticeWidget | undefined;
	private assessment: ICustomizationMigrationAssessment | undefined;
	private dismissed = false;
	private leading = false;
	private requestSequence = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly noticeHost: ChatInputNoticeHost,
		@ICustomizationMigrationService private readonly migrationService: ICustomizationMigrationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled)) {
				this.clearAssessment();
			} else if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsMigrationAttentionEnabled)) {
				this.update();
			}
		}));
	}

	async assess(request: ICustomizationMigrationAssessmentRequest): Promise<void> {
		const sequence = ++this.requestSequence;
		this.dismissed = false;
		this.assessment = undefined;
		this.clear();
		const cancellation = new CancellationTokenSource();
		this.requestCancellation.value = cancellation;
		let assessment: ICustomizationMigrationAssessment;
		try {
			assessment = await this.migrationService.assess(request, cancellation.token);
		} catch (error) {
			if (!isCancellationError(error)) {
				onUnexpectedError(error);
			}
			return;
		}
		if (sequence !== this.requestSequence || cancellation.token.isCancellationRequested) {
			return;
		}
		this.assessment = assessment;
		this.update();
	}

	clearAssessment(): void {
		this.requestSequence++;
		this.requestCancellation.value?.cancel();
		this.requestCancellation.clear();
		this.assessment = undefined;
		this.dismissed = false;
		this.clear();
	}

	private update(): void {
		const shouldShow = !this.dismissed
			&& this.assessment?.state === 'complete'
			&& this.assessment.attentionNeeded
			&& this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled) !== false
			&& this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsMigrationAttentionEnabled);
		if (!shouldShow) {
			this.clear();
			return;
		}

		if (!this.lease.value) {
			this.lease.value = this.noticeHost.occupy(ChatInputNoticeLane.Notification, {
				focusTarget: {
					hasFocus: () => this.noticeWidget?.hasFocus() ?? false,
					focus: () => this.noticeWidget?.focus(),
					canFocus: () => !!this.noticeWidget,
				},
				onDidChangeLeading: leading => {
					this.leading = leading;
					if (leading) {
						this.render();
					} else {
						this.clearContent();
					}
				},
			});
		} else if (this.leading) {
			this.render();
		}
	}

	private render(): void {
		const assessment = this.assessment;
		if (!assessment?.attentionNeeded) {
			this.clearContent();
			return;
		}

		this.clearContent();
		const store = new DisposableStore();
		const message = assessment.count === 1
			? localize('customizationMigrationAttentionSingle', "1 customization may not work with Copilot.")
			: localize('customizationMigrationAttentionMultiple', "{0} customizations may not work with Copilot.", assessment.count);
		const notice = store.add(new ChatInputNoticeWidget({
			container: this.container,
			variant: ChatInputNoticeVariant.Notification,
			ariaLabel: message,
			ariaRoleDescription: localize('customizationMigrationAttentionRole', "customization migration notification"),
		}));
		this.noticeWidget = notice;
		DOM.append(notice.domNode, DOM.$('span')).textContent = message;
		notice.addAction({
			ariaLabel: localize('customizationMigrationAttentionReview', "Review Customizations"),
			icon: Codicon.settingsGear,
			onActivate: () => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor),
			store,
		});
		notice.addDismissAction({
			onActivate: () => {
				this.dismissed = true;
				this.clear();
			},
			store,
		});
		this.notice.value = store;
		setChatInputStackSlot(this.container, ChatInputStackSlot.Docked);
		notice.announce();
	}

	private clear(): void {
		this.leading = false;
		this.lease.clear();
		this.clearContent();
	}

	private clearContent(): void {
		this.noticeWidget = undefined;
		this.notice.clear();
		DOM.clearNode(this.container);
		setChatInputStackSlot(this.container, ChatInputStackSlot.Empty);
	}
}
