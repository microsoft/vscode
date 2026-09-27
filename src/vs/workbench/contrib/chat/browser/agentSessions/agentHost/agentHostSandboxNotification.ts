/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../../../base/common/arrays.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { readAgentSandboxDiagnostics } from '../../../../../../platform/agentHost/common/meta/agentSandboxDiagnostics.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';

export class AgentHostSandboxNotification extends Disposable {
	private readonly _id: string;
	private _reasons: readonly string[] | undefined;

	constructor(
		private readonly _sessionResource: URI,
		subscription: IAgentSubscription<SessionState>,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
	) {
		super();
		this._id = `agentHost.sandboxUnsupported.${_sessionResource.toString()}`;
		this._register(subscription.onDidChange(state => this._update(state)));
		if (subscription.onDidError) {
			this._register(subscription.onDidError(error => this._update(error)));
		}
		this._update(subscription.value);
	}

	private _update(state: SessionState | Error | undefined): void {
		const reasons = state && !(state instanceof Error) ? readAgentSandboxDiagnostics(state) : undefined;
		if (equals(this._reasons ?? [], reasons ?? [])) {
			return;
		}
		this._reasons = reasons;
		if (!reasons) {
			this._notificationService.deleteNotification(this._id);
			return;
		}
		this._notificationService.setNotification({
			id: this._id,
			severity: ChatInputNotificationSeverity.Warning,
			message: localize('agentHost.sandboxUnsupported', "Sandboxing is unavailable in this environment"),
			description: reasons.join('\n'),
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionResources: [this._sessionResource],
		});
	}

	override dispose(): void {
		this._notificationService.deleteNotification(this._id);
		super.dispose();
	}
}
