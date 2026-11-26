/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue, observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkbenchMode, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditableWorkspaceContextService } from '../../../../services/configuration/common/configuration.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../common/chatConstants.js';
import { IInboxWorkspaceFilter, LOCAL_SESSIONS_ENVIRONMENT, SessionsListFilters } from './sessionsListFilters.js';

export const ISessionsWorkbenchScopeService = createDecorator<ISessionsWorkbenchScopeService>('sessionsWorkbenchScopeService');

/** Owns the scope selected by the window's Sessions lists, without owning their UI. */
export interface ISessionsWorkbenchScopeService {
	readonly _serviceBrand: undefined;
	/** Whether {@link SESSIONS_LIST_WORKSPACES_FILTER_SETTING} is on. */
	readonly enabled: IObservable<boolean>;
	/** Whether the lists show the bar in every grouping: the setting is on and AI features are neither hidden nor disabled. Only then does a bar scope the window. */
	readonly barShown: IObservable<boolean>;
	readonly windowWorkspaces: IObservable<readonly IInboxWorkspaceFilter[]>;
	registerScopeBar(filters: SessionsListFilters): IDisposable;
}

export class SessionsWorkbenchScopeService extends Disposable implements ISessionsWorkbenchScopeService {
	declare readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly barShown: IObservable<boolean>;
	readonly windowWorkspaces: IObservable<readonly IInboxWorkspaceFilter[]>;
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
		this.barShown = derived(this, reader => this.enabled.read(reader) && !!chatEnabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);
		const folders = observableFromEvent(this, Event.any<unknown>(workspaceContextService.onDidChangeWorkspaceFolders, workspaceContextService.onDidChangeWorkbenchState, workspaceContextService.onDidChangeWorkbenchMode), () => {
			if (workspaceContextService.getWorkbenchMode() !== WorkbenchMode.Editor) {
				return [];
			}
			const workspace = workspaceContextService.getWorkspace();
			return workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER && workspace.uri ? [workspace.uri] : workspace.folders.map(folder => folder.uri);
		});
		this.windowWorkspaces = derived(this, reader => this.enabled.read(reader) ? folders.read(reader).map(folder => ({
			environment: LOCAL_SESSIONS_ENVIRONMENT, resource: getComparisonKey(folder), label: basename(folder), description: folder.path,
		})) : []);
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

registerSingleton(ISessionsWorkbenchScopeService, SessionsWorkbenchScopeService, InstantiationType.Delayed);
