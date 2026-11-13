/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IsPhoneLayoutContext } from '../../common/contextkeys.js';
import { SESSIONS_LIST_INLINE_ACTIONS_SETTING } from '../../common/sessionConfig.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SessionInputBannerModel } from '../sessionInputBanners/sessionInputBannerModel.js';
import { ISessionInputBannerAction } from '../sessionInputBanners/sessionInputBannerWidget.js';

// Share pending state across recycled and duplicate main-chat rows.
const submissions = new WeakMap<IChat, ISettableObservable<boolean>>();

export class SessionInlineActions extends Disposable {
	constructor(
		session: ISession,
		chat: IChat | undefined,
		before: HTMLElement,
		visible: IObservable<boolean>,
		onDidChangeHeight: (height: number) => void,
		restoreFocus: () => void,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService managementService: ISessionsManagementService,
		@INotificationService notificationService: INotificationService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
	) {
		super();
		const enabled = observableConfigValue(SESSIONS_LIST_INLINE_ACTIONS_SETTING, false, configurationService);
		const aiDisabled = observableConfigValue('chat.disableAIFeatures', false, configurationService);
		const aiHidden = observableFromEvent(entitlementService.onDidChangeSentiment, () => entitlementService.sentiment.hidden === true);
		const phone = observableFromEvent(contextKeyService.onDidChangeContext, () => IsPhoneLayoutContext.getValue(contextKeyService) === true);
		const heightUpdate = this._register(new MutableDisposable());
		const updateHeight = (height: number) => {
			heightUpdate.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(before), () => onDidChangeHeight(height));
		};
		this._register(autorun(reader => {
			updateHeight(0);
			if (!enabled.read(reader) || aiDisabled.read(reader) || aiHidden.read(reader) || !visible.read(reader)) {
				return;
			}
			const targetChat = chat ?? session.mainChat.read(reader);
			let submission = submissions.get(targetChat);
			if (!submission) {
				submission = observableValue('sessionInlineActionSubmission', false);
				submissions.set(targetChat, submission);
			}
			const ready = derived(reader => !session.isArchived.read(reader) && !targetChat.isArchived.read(reader)
				&& targetChat.interactivity.read(reader) === ChatInteractivity.Full
				&& targetChat.status.read(reader) === SessionStatus.Completed
				&& (!session.remoteConnectionStatus || session.remoteConnectionStatus.read(reader).kind === 'connected'));
			const validate = () => {
				if (managementService.getSession(session.resource) !== session || !session.chats.read(undefined).includes(targetChat)
					|| !enabled.read(undefined) || aiDisabled.read(undefined) || aiHidden.read(undefined) || !ready.read(undefined)) {
					throw new Error(localize('sessionInlineActions.unavailable', "This action is no longer available for this chat."));
				}
			};
			const model = reader.store.add(instantiationService.createInstance(SessionInputBannerModel, {
				session,
				chat: targetChat,
				validate,
				submitRequest: query => managementService.sendRequestInBackground(session, targetChat, { query }),
			}));
			reader.store.add(autorun(reader => model.setActive(ready.read(reader))));
			const primary = derived(reader => {
				if (!ready.read(reader)) {
					return undefined;
				}
				const actions = model.banners.read(reader).map(banner => banner.actions.find(action => action.primary));
				return actions.find(action => action?.id === 'fixCIAndAddressComments') ?? actions.find(action => action !== undefined);
			});
			const container = dom.$('.session-inline-actions');
			container.hidden = true;
			before.before(container);
			let disposed = false;
			reader.store.add(toDisposable(() => {
				disposed = true;
				if (dom.isAncestorOfActiveElement(container)) {
					restoreFocus();
				}
				container.remove();
			}));
			for (const event of ['pointerdown', 'pointerup', 'click', 'dblclick', 'keydown', 'keyup'] as const) {
				reader.store.add(dom.addDisposableListener(container, event, e => e.stopPropagation()));
			}
			reader.store.add(Gesture.ignoreTarget(container));
			const button = reader.store.add(new Button(container, { ...defaultButtonStyles, title: true, supportIcons: true }));
			reader.store.add(button.onDidEscape(restoreFocus));
			const run = async (action: ISessionInputBannerAction) => {
				if (disposed || submission.read(undefined)) {
					return;
				}
				validate();
				submission.set(true, undefined);
				try {
					if (action.waitUntilReady && !await action.waitUntilReady()) {
						throw new Error(localize('sessionInlineActions.notReady', "The request could not be sent."));
					}
					await action.run();
				} finally {
					submission.set(false, undefined);
				}
			};
			reader.store.add(button.onDidClick(() => {
				const action = primary.read(undefined);
				if (action) {
					run(action).catch(error => notificationService.error(error));
				}
			}));
			reader.store.add(autorun(reader => {
				const action = primary.read(reader);
				const pending = submission.read(reader);
				const show = !!action || pending;
				if (!show && dom.isAncestorOfActiveElement(container)) {
					restoreFocus();
				}
				container.hidden = !show;
				button.enabled = !!action && !pending;
				const label = pending ? localize('sessionInlineActions.sending', "Sending...") : action?.label ?? '';
				button.label = `${pending ? '$(loading~spin) ' : ''}${label}`;
				button.element.setAttribute('aria-label', localize('sessionInlineActions.label', "{0}: {1}", targetChat.title.read(reader), label));
				const height = phone.read(reader) ? 48 : 32;
				container.style.height = `${height}px`;
				updateHeight(show ? height : 0);
			}));
		}));
	}
}
