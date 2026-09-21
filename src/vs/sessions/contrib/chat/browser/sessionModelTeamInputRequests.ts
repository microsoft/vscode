/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/objects.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { IChatSessionInputSource } from '../../../../workbench/contrib/chat/common/chatSessionInputRequests.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionModelTeamState } from '../../../services/sessions/common/sessionsProvider.js';
import { ISessionModelTeamContext } from './sessionModelTeamPicker.js';

export function getModelTeamInputSources(state: ISessionModelTeamState | undefined): readonly IChatSessionInputSource[] {
	if (!state?.selection) {
		return [];
	}
	return (state.members ?? []).filter(member => member.enabled && !member.historyUnavailable && member.assignment?.state !== 'removed').map(member => {
		const role = member.role === 'worker' ? localize('modelTeam.worker', "Worker") : localize('modelTeam.scout', "Scout");
		return {
			resource: member.chatResource,
			label: member.title && member.title !== role ? localize('modelTeam.inputSource', "{0}: {1}", role, member.title) : role,
		};
	});
}

export class SessionModelTeamInputRequests extends Disposable {
	constructor(
		context: IObservable<ISessionModelTeamContext | undefined>,
		widget: ChatWidget,
		visible: IObservable<boolean>,
		@ISessionsProvidersService providers: ISessionsProvidersService,
		@IChatSessionsService chatSessions: IChatSessionsService,
		@IChatEntitlementService entitlement: IChatEntitlementService,
		@ILogService logService: ILogService,
	) {
		super();
		const target = derivedOpts({ owner: this, equalsFn: equals }, reader => {
			const value = context.read(reader);
			return value ? { sessionId: value.sessionId, providerId: value.providerId, resource: value.chatResource } : undefined;
		});
		const providerChanged = observableFromEvent(this, providers.onDidChangeProviders, () => providers.getProviders());
		const visibleResource = observableFromEvent(this, widget.onDidChangeViewModel, () => widget.viewModel?.sessionResource);
		const aiEnabled = observableFromEvent(this, entitlement.onDidChangeSentiment, () => !entitlement.sentiment.hidden);
		this._register(autorun(reader => {
			providerChanged.read(reader);
			const value = target.read(reader);
			if (!value || !visible.read(reader) || !aiEnabled.read(reader) || !isEqual(value.resource, visibleResource.read(reader))) {
				return;
			}
			const provider = providers.getProvider(value.providerId);
			if (!provider?.getModelTeam) {
				return;
			}
			const team = observableFromEvent(this, provider.onDidChangeModelTeam ?? Event.None, () => provider.getModelTeam?.(value.sessionId, value.resource));
			const sources = derivedOpts({ owner: this, equalsFn: equals }, reader => getModelTeamInputSources(team.read(reader)));
			const store = reader.store;
			const cancellation = new CancellationTokenSource();
			store.add(toDisposable(() => cancellation.dispose(true)));
			void chatSessions.getOrCreateChatSession(value.resource, cancellation.token).then(session => {
				if (store.isDisposed || !session.observeInputRequests) {
					return;
				}
				const requests = store.add(session.observeInputRequests(sources));
				store.add(widget.input.renderSessionInputRequests(requests.requests));
			}).catch(error => {
				if (!isCancellationError(error)) {
					logService.error('[ModelTeam] Failed to present input requests', error);
				}
			});
		}));
	}
}
