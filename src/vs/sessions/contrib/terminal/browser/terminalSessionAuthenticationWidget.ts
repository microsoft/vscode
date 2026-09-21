/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/terminalChatView.css';
import { $ } from '../../../../base/browser/dom.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionTerminalService } from '../../../services/terminal/browser/sessionTerminalService.js';

export class TerminalSessionAuthenticationWidget extends Disposable {
	private static descriptionIdPool = 0;

	readonly element = $('.terminal-session-authentication');
	readonly ready = constObservable(true);

	constructor(
		session: IObservable<ISession | undefined>,
		@ISessionTerminalService terminals: ISessionTerminalService,
		@INotificationService private readonly _notification: INotificationService,
	) {
		super();
		const terminal = derived(this, reader => {
			const current = session.read(reader);
			return current ? terminals.getSessionTerminal(current.sessionId) : undefined;
		});
		this._register(autorun(reader => {
			// Materializing the account configuration writes provider state, so it must
			// happen here rather than inside a `derived` compute.
			const configuration = terminal.read(reader)?.ensureAuthentication?.();
			this.element.replaceChildren();
			this.element.style.display = configuration ? '' : 'none';
			if (!configuration) {
				return;
			}
			const label = $('span', undefined, localize('terminalSessionAccount', "Account"));
			this.element.appendChild(label);
			const description = $('p');
			description.id = `terminal-session-account-description-${++TerminalSessionAuthenticationWidget.descriptionIdPool}`;
			const source = reader.store.add(new Radio({
				ariaLabel: localize('terminalSessionAccountSource', "CLI account source"),
				className: 'segmented',
				arrowKeyBehavior: 'focus',
				items: [
					{ text: localize('terminalSessionCopilot', "GitHub Copilot") },
					{ text: configuration.nativeLabel },
				],
			}));
			// Conveys the billing consequence of the current choice to screen readers.
			source.domNode.setAttribute('aria-describedby', description.id);
			this.element.appendChild(source.domNode);
			this.element.appendChild(description);
			reader.store.add(source.onDidSelect(index => {
				try {
					configuration.setSource(index === 0 ? 'copilot' : 'native');
				} catch (error) {
					// `Radio` marks the item active before notifying, so revert the rejected pick.
					source.setActiveItem(configuration.source.get() === 'copilot' ? 0 : 1);
					this._notification.error(error);
				}
			}));
			reader.store.add(autorun(reader => {
				const copilot = configuration.source.read(reader) === 'copilot';
				source.setEnabled(!session.read(reader)?.isNewSessionRequestInProgress?.read(reader));
				source.setActiveItem(copilot ? 0 : 1);
				description.textContent = copilot
					? localize('terminalSessionCopilotBilling', "Uses your GitHub Copilot account and its usage limits through a local gateway. No Claude or ChatGPT subscription is needed. Choose models with /model in the CLI; approval prompts remain there too.")
					: localize('terminalSessionNativeBilling', "Uses the CLI's own saved sign-in, API key, or configured gateway. Copilot authentication is not injected.");
			}));
		}));
	}
}
