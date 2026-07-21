/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IRoboAgentAuthMainService, IRoboAgentAuthSession } from '../../../../platform/roboagentAuth/common/roboagentAuthService.js';

import { RawContextKey, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

export const CONTEXT_ROBOAGENT_SIGNED_IN = new RawContextKey<boolean>('roboagentIsSignedIn', false);

export class RoboAgentAuthStatusBar extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'roboagent.authStatusBar';

	private readonly authService: IRoboAgentAuthMainService;
	private readonly statusbarEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly roboagentSignedInContextKey: IContextKey<boolean>;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.authService = ProxyChannel.toService<IRoboAgentAuthMainService>(mainProcessService.getChannel('roboagentAuth'));
		this.roboagentSignedInContextKey = CONTEXT_ROBOAGENT_SIGNED_IN.bindTo(contextKeyService);

		this._register(this.authService.onDidChangeSession(session => this.update(session)));
		
		this.authService.getSession().then(session => this.update(session));
	}

	private update(session: IRoboAgentAuthSession): void {
		this.roboagentSignedInContextKey.set(session.isSignedIn);
		let text: string;
		let tooltip: string;
		let command: string;

		if (session.isSignedIn) {
			text = `$(account) ${session.displayName || session.email || 'RoboAgent'}`;
			tooltip = localize('roboagent.auth.signedIn', "Signed in as {0}", session.email || session.userId || 'Unknown');
			command = 'roboagent.signOut';
		} else {
			text = '$(account) Sign in';
			tooltip = localize('roboagent.auth.signInTooltip', "Sign in to RoboAgent (Robotics Corner SSO)");
			command = 'roboagent.signIn';
		}

		const entry: IStatusbarEntry = {
			name: localize('roboagent.auth.statusName', "RoboAgent Authentication"),
			text,
			tooltip,
			command,
			ariaLabel: tooltip
		};

		if (!this.statusbarEntry.value) {
			this.statusbarEntry.value = this.statusbarService.addEntry(entry, RoboAgentAuthStatusBar.ID, StatusbarAlignment.RIGHT, 100);
		} else {
			this.statusbarEntry.value.update(entry);
		}
	}
}
