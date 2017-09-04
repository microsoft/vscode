/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debugViewlet';
import { Builder } from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { PersistentViewsViewlet } from 'vs/workbench/parts/views/browser/views';
import { IDebugService, VIEWLET_ID, State } from 'vs/workbench/parts/debug/common/debug';
import { StartAction, ToggleReplAction, ConfigureAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { StartDebugActionItem } from 'vs/workbench/parts/debug/browser/debugActionItems';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewLocation } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

export class DebugViewlet extends PersistentViewsViewlet {

	private actions: IAction[];
	private startDebugActionItem: StartDebugActionItem;
	private progressRunner: IProgressRunner;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(VIEWLET_ID, ViewLocation.Debug, `${VIEWLET_ID}.state`, false, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);

		this.progressRunner = null;

		this._register(this.debugService.onDidChangeState(state => this.onDebugServiceStateChange(state)));
	}

	public create(parent: Builder): TPromise<void> {
		return super.create(parent).then(() => DOM.addClass(this.viewletContainer, 'debug-viewlet'));
	}

	public focus(): void {
		super.focus();

		if (!this.contextService.hasWorkspace()) {
			this.views[0].focusBody();
		}

		if (this.startDebugActionItem) {
			this.startDebugActionItem.focus();
		}
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [];
			this.actions.push(this.instantiationService.createInstance(StartAction, StartAction.ID, StartAction.LABEL));
			if (this.contextService.hasWorkspace()) {
				this.actions.push(this.instantiationService.createInstance(ConfigureAction, ConfigureAction.ID, ConfigureAction.LABEL));
			}
			this.actions.push(this._register(this.instantiationService.createInstance(ToggleReplAction, ToggleReplAction.ID, ToggleReplAction.LABEL)));
		}

		return this.actions;
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		if (action.id === StartAction.ID && this.contextService.hasWorkspace()) {
			this.startDebugActionItem = this.instantiationService.createInstance(StartDebugActionItem, null, action);
			return this.startDebugActionItem;
		}

		return null;
	}

	private onDebugServiceStateChange(state: State): void {
		if (this.progressRunner) {
			this.progressRunner.done();
		}

		if (state === State.Initializing) {
			this.progressRunner = this.progressService.show(true);
		} else {
			this.progressRunner = null;
		}
	}
}
