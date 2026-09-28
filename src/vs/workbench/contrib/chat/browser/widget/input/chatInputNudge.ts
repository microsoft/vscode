/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import './media/chatInputNudge.css';

export interface IChatInputNudgeAction {
	readonly label: string;
	readonly errorMessage: string;
	readonly run: () => Promise<unknown>;
}

export interface IChatInputNudgeOptions {
	readonly title: string;
	readonly description: string;
	readonly icon: ThemeIcon;
	readonly primaryAction: IChatInputNudgeAction;
	readonly secondaryAction?: IChatInputNudgeAction;
	readonly dismissLabel: string;
	readonly onDismiss: () => void;
}

export class ChatInputNudge extends Disposable {
	readonly domNode: HTMLElement;

	private readonly titleElement: HTMLElement;
	private readonly descriptionElement: HTMLElement;
	private readonly primaryButton: Button;
	private readonly secondaryButton: Button;
	private readonly dismissAction: Action;
	private running = false;

	constructor(
		private options: IChatInputNudgeOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		const id = generateUuid();
		this.domNode = dom.$('.chat-input-nudge', { role: 'group', 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-description` });
		this._register(toDisposable(() => this.domNode.remove()));

		const header = dom.append(this.domNode, dom.$('.chat-input-nudge-header'));
		const icon = dom.append(header, renderIcon(options.icon));
		icon.classList.add('chat-input-nudge-icon');
		icon.setAttribute('aria-hidden', 'true');
		this.titleElement = dom.append(header, dom.$('h3.chat-input-nudge-title', { id: `${id}-title` }));
		const actions = dom.append(header, dom.$('.chat-input-nudge-actions'));
		this.dismissAction = this._register(new Action(
			'chat.inputNudge.dismiss',
			options.dismissLabel,
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => this.dismiss(),
		));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, actions, {
			ariaLabel: localize('chat.inputNudge.actions', "Suggestion actions"),
		}));
		toolbar.setActions([this.dismissAction]);

		this.descriptionElement = dom.append(this.domNode, dom.$('p.chat-input-nudge-description', { id: `${id}-description` }));

		const footer = dom.append(this.domNode, dom.$('.chat-input-nudge-footer'));
		this.primaryButton = this._register(new Button(footer, defaultButtonStyles));
		this._register(this.primaryButton.onDidClick(() => void this.run(this.options.primaryAction)));
		this.secondaryButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
		this._register(this.secondaryButton.onDidClick(() => {
			if (this.options.secondaryAction) {
				void this.run(this.options.secondaryAction);
			}
		}));
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				this.dismiss();
			}
		}, true));

		this.setOptions(options);
	}

	setOptions(options: IChatInputNudgeOptions): void {
		this.options = options;
		this.titleElement.textContent = options.title;
		this.descriptionElement.textContent = options.description;
		this.primaryButton.label = options.primaryAction.label;
		this.secondaryButton.element.style.display = options.secondaryAction ? '' : 'none';
		if (options.secondaryAction) {
			this.secondaryButton.label = options.secondaryAction.label;
		}
		this.dismissAction.label = options.dismissLabel;
	}

	private dismiss(): void {
		if (!this.running && !this._store.isDisposed) {
			this.options.onDismiss();
		}
	}

	private async run(action: IChatInputNudgeAction): Promise<void> {
		if (this.running || this._store.isDisposed) {
			return;
		}
		this.setRunning(true);
		try {
			await action.run();
		} catch (error) {
			this.notificationService.error(localize('chat.inputNudge.actionError', "{0}: {1}", action.errorMessage, toErrorMessage(error)));
		} finally {
			if (!this._store.isDisposed) {
				this.setRunning(false);
			}
		}
	}

	private setRunning(running: boolean): void {
		this.running = running;
		this.domNode.setAttribute('aria-busy', String(running));
		this.primaryButton.enabled = !running;
		this.secondaryButton.enabled = !running;
		this.dismissAction.enabled = !running;
	}
}
