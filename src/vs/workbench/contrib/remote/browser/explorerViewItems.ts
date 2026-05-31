/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IRemoteExplorerService, REMOTE_EXPLORER_TYPE_KEY } from '../../../services/remote/common/remoteExplorerService.js';
import { ISelectOptionItem } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { IViewDescriptor } from '../../../common/views.js';
import { isStringArray } from '../../../../base/common/types.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { VIEWLET_ID } from './remoteExplorer.js';
import { getVirtualWorkspaceLocation } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';

interface IRemoteSelectItem extends ISelectOptionItem {
	authority: string[];
	virtualWorkspace?: string;
	dispose(): void;
}

export const SELECTED_REMOTE_IN_EXPLORER = new RawContextKey<string>('selectedRemoteInExplorer', '');

export class SwitchRemoteViewItem extends Disposable {
	private switchRemoteMenu: MenuId;
	private completedRemotes: DisposableMap<string, IRemoteSelectItem> = this._register(new DisposableMap());
	private readonly selectedRemoteContext: IContextKey<string>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IRemoteExplorerService private remoteExplorerService: IRemoteExplorerService,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super();
		this.selectedRemoteContext = SELECTED_REMOTE_IN_EXPLORER.bindTo(contextKeyService);

		this.switchRemoteMenu = MenuId.for('workbench.remote.menu.switchRemoteMenu');
		this._register(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
			submenu: this.switchRemoteMenu,
			title: nls.localize('switchRemote.label', "Switch Remote"),
			group: 'navigation',
			when: ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
			order: 1,
			isSelection: true
		}));
		this._register(remoteExplorerService.onDidChangeTargetType(e => {
			this.select(e);
		}));
	}

	public setSelectionForConnection(): boolean {
		let isSetForConnection = false;
		if (this.completedRemotes.size > 0) {
			let authority: string[] | undefined;
			const remoteAuthority = this.environmentService.remoteAuthority;
			let virtualWorkspace: string | undefined;
			if (!remoteAuthority) {
				virtualWorkspace = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace())?.scheme;
			}
			isSetForConnection = true;
			const explorerType: string[] | undefined = remoteAuthority ? [remoteAuthority.split('+')[0]]
				: (virtualWorkspace ? [virtualWorkspace]
					: (this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, StorageScope.WORKSPACE)?.split(',') ?? this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, StorageScope.PROFILE)?.split(',')));
			if (explorerType !== undefined) {
				authority = this.getAuthorityForExplorerType(explorerType);
			}
			if (authority) {
				this.select(authority);
			}
		}
		return isSetForConnection;
	}

	private select(authority: string[]) {
		this.selectedRemoteContext.set(authority[0]);
		this.remoteExplorerService.targetType = authority;
	}

	private getAuthorityForExplorerType(explorerType: string[]): string[] | undefined {
		let authority: string[] | undefined;
		for (const option of this.completedRemotes) {
			for (const authorityOption of option[1].authority) {
				for (const explorerOption of explorerType) {
					if (authorityOption === explorerOption) {
						authority = option[1].authority;
						break;
					} else if (option[1].virtualWorkspace === explorerOption) {
						authority = option[1].authority;
						break;
					}
				}
			}
		}
		return authority;
	}

	public removeOptionItems(views: IViewDescriptor[]) {
		for (const view of views) {
			if (view.group && view.group.startsWith('targets') && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
				const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
				this.completedRemotes.deleteAndDispose(authority[0]);
			}
		}
	}

	public createOptionItems(views: IViewDescriptor[]) {
		const startingCount = this.completedRemotes.size;
		for (const view of views) {
			if (view.group && view.group.startsWith('targets') && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
				const text = view.name;
				const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
				if (this.completedRemotes.has(authority[0])) {
					continue;
				}
				const thisCapture = this;
				const action = registerAction2(class extends Action2 {
					constructor() {
						super({
							id: `workbench.action.remoteExplorer.show.${authority[0]}`,
							title: text,
							toggled: SELECTED_REMOTE_IN_EXPLORER.isEqualTo(authority[0]),
							menu: {
								id: thisCapture.switchRemoteMenu
							}
						});
					}
					async run(): Promise<void> {
						thisCapture.select(authority);
					}
				});
				this.completedRemotes.set(authority[0], { text: text.value, authority, virtualWorkspace: view.virtualWorkspace, dispose: () => action.dispose() });
			}
		}
		if (this.completedRemotes.size > startingCount) {
			this.setSelectionForConnection();
		}
	}
}
