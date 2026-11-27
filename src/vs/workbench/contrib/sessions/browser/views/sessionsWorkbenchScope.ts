/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, WorkbenchMode, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditableWorkspaceContextService } from '../../../../services/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../common/chatConstants.js';
import { SessionsListFilters } from './sessionsListFilters.js';

/**
 * Whether a window shows the Sessions list's workspace and environment bar: the Agents window and empty editor
 * windows. Folder and multi-root editor windows keep their own folders as their scope, so they show no bar.
 */
export function windowShowsSessionsScopeBar(workspaceContextService: Pick<IWorkspaceContextService, 'getWorkbenchMode' | 'getWorkbenchState'>): boolean {
	return workspaceContextService.getWorkbenchMode() === WorkbenchMode.Agents || workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
}

export const ISessionsWorkbenchScopeService = createDecorator<ISessionsWorkbenchScopeService>('sessionsWorkbenchScopeService');

/** Owns the scope selected by the window's Sessions lists, without owning their UI. */
export interface ISessionsWorkbenchScopeService {
	readonly _serviceBrand: undefined;
	/** Whether {@link SESSIONS_LIST_WORKSPACES_FILTER_SETTING} is on. */
	readonly enabled: IObservable<boolean>;
	/** Whether this window shows a bar at all, per {@link windowShowsSessionsScopeBar}; Inbox's bar uses it too. */
	readonly windowShowsBar: IObservable<boolean>;
	/**
	 * Whether the lists show the bar in every grouping: the setting is on, {@link windowShowsBar} holds and AI features
	 * are neither hidden nor disabled. Only then does a bar scope the window.
	 */
	readonly barShown: IObservable<boolean>;
	registerScopeBar(filters: SessionsListFilters): IDisposable;
}

export class SessionsWorkbenchScopeService extends Disposable implements ISessionsWorkbenchScopeService {
	declare readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly windowShowsBar: IObservable<boolean>;
	readonly barShown: IObservable<boolean>;
	private readonly bars: SessionsListFilters[] = [];
	private readonly current = observableValue<{ readonly filters: SessionsListFilters } | undefined>(this, undefined);

	constructor(
		@IEditableWorkspaceContextService workspaceContextService: IEditableWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		this.enabled = observableConfigValue<boolean>(SESSIONS_LIST_WORKSPACES_FILTER_SETTING, false, configurationService);
		const chatEnabled = observableContextKey<boolean>(ChatContextKeys.enabled.key, contextKeyService);
		this.windowShowsBar = observableFromEvent(this, Event.any<unknown>(workspaceContextService.onDidChangeWorkbenchState, workspaceContextService.onDidChangeWorkbenchMode),
			() => windowShowsSessionsScopeBar(workspaceContextService));
		this.barShown = derived(this, reader => this.enabled.read(reader) && this.windowShowsBar.read(reader) && !!chatEnabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);
		let owned = false;
		let lastScope: URI | undefined;
		const reset = () => {
			if (owned) {
				owned = false;
				if (uriIdentityService.extUri.isEqual(workspaceContextService.getWorkbenchScope(), lastScope)) {
					workspaceContextService.resetWorkbenchScope();
				}
			}
		};
		this._register(autorun(reader => {
			const current = this.current.read(reader);
			if (!this.barShown.read(reader) || !current) {
				reset();
				return;
			}
			const workspace = current.filters.inboxScope.workspace;
			lastScope = workspace && workspace !== 'none' ? URI.parse(workspace.resource) : undefined;
			owned = true;
			workspaceContextService.setWorkbenchScope(lastScope);
		}));
		this._register(toDisposable(reset));
	}

	registerScopeBar(filters: SessionsListFilters): IDisposable {
		this.bars.push(filters);
		this.current.set({ filters }, undefined);
		const listener = filters.onDidChange(() => this.current.set({ filters }, undefined));
		return toDisposable(() => {
			listener.dispose();
			this.bars.splice(this.bars.indexOf(filters), 1);
			if (this.current.get()?.filters === filters) {
				const last = this.bars.at(-1);
				this.current.set(last ? { filters: last } : undefined, undefined);
			}
		});
	}
}
