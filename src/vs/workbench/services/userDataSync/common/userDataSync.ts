/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IAuthenticationProvider, SyncStatus, SyncResource, IUserDataSyncResource, IResourcePreview } from '../../../../platform/userDataSync/common/userDataSync.js';
import { Event } from '../../../../base/common/event.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { localize, localize2 } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IView } from '../../../common/views.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IAction2Options } from '../../../../platform/actions/common/actions.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';

export interface IUserDataSyncAccount {
	readonly authenticationProviderId: string;
	readonly accountName: string;
	readonly accountId: string;
}

export const IUserDataSyncWorkbenchService = createDecorator<IUserDataSyncWorkbenchService>('IUserDataSyncWorkbenchService');
export interface IUserDataSyncWorkbenchService {
	_serviceBrand: undefined;

	readonly enabled: boolean;
	readonly authenticationProviders: IAuthenticationProvider[];

	readonly current: IUserDataSyncAccount | undefined;

	readonly accountStatus: AccountStatus;
	readonly onDidChangeAccountStatus: Event<AccountStatus>;

	readonly onDidTurnOnSync: Event<void>;

	turnOn(): Promise<void>;
	turnoff(everyWhere: boolean): Promise<void>;
	signIn(): Promise<void>;

	resetSyncedData(): Promise<void>;
	showSyncActivity(): Promise<void>;
	syncNow(): Promise<void>;

	synchroniseUserDataSyncStoreType(): Promise<void>;

	showConflicts(conflictToOpen?: IResourcePreview): Promise<void>;
	accept(resource: IUserDataSyncResource, conflictResource: URI, content: string | null | undefined, apply: boolean): Promise<void>;

	getAllLogResources(): Promise<URI[]>;
	downloadSyncActivity(): Promise<URI | undefined>;
}

export function getSyncAreaLabel(source: SyncResource): string {
	switch (source) {
		case SyncResource.Settings: return localize('settings', "Settings");
		case SyncResource.Keybindings: return localize('keybindings', "Keyboard Shortcuts");
		case SyncResource.Snippets: return localize('snippets', "Snippets");
		case SyncResource.Prompts: return localize('prompts', "Prompts and Instructions");
		case SyncResource.Tasks: return localize('tasks', "Tasks");
		case SyncResource.Mcp: return localize('mcp', "MCP Servers");
		case SyncResource.Extensions: return localize('extensions', "Extensions");
		case SyncResource.GlobalState: return localize('ui state label', "UI State");
		case SyncResource.Profiles: return localize('profiles', "Profiles");
		case SyncResource.WorkspaceState: return localize('workspace state label', "Workspace State");
	}
}

export const enum AccountStatus {
	Uninitialized = 'uninitialized',
	Unavailable = 'unavailable',
	Available = 'available',
}

export interface IUserDataSyncConflictsView extends IView {
	open(conflict: IResourcePreview): Promise<void>;
}

export const SYNC_TITLE: ILocalizedString = localize2('sync category', "Settings Sync");

export const SYNC_VIEW_ICON = registerIcon('settings-sync-view-icon', Codicon.sync, localize('syncViewIcon', 'View icon of the Settings Sync view.'));

// Contexts
export const CONTEXT_SYNC_STATE = new RawContextKey<string>('syncStatus', SyncStatus.Uninitialized);
export const CONTEXT_SYNC_ENABLEMENT = new RawContextKey<boolean>('syncEnabled', false);
export const CONTEXT_ACCOUNT_STATE = new RawContextKey<string>('userDataSyncAccountStatus', AccountStatus.Uninitialized);
export const CONTEXT_ENABLE_ACTIVITY_VIEWS = new RawContextKey<boolean>(`enableSyncActivityViews`, false);
export const CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW = new RawContextKey<boolean>(`enableSyncConflictsView`, false);
export const CONTEXT_HAS_CONFLICTS = new RawContextKey<boolean>('hasConflicts', false);

// Commands
export const CONFIGURE_SYNC_COMMAND_ID = 'workbench.userDataSync.actions.configure';
export const SHOW_SYNC_LOG_COMMAND_ID = 'workbench.userDataSync.actions.showLog';

// VIEWS
export const SYNC_VIEW_CONTAINER_ID = 'workbench.view.sync';
export const SYNC_CONFLICTS_VIEW_ID = 'workbench.views.sync.conflicts';

export const DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR: Readonly<IAction2Options> = {
	id: 'workbench.userDataSync.actions.downloadSyncActivity',
	title: localize2('download sync activity title', "Download Settings Sync Activity"),
	category: Categories.Developer,
	f1: true,
	precondition: ContextKeyExpr.and(CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
};
