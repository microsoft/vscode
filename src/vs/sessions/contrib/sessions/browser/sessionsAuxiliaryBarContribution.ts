/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../base/common/observable.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { CHANGES_VIEW_ID, ChangesViewPane } from '../../changesView/browser/changesView.js';

export class SessionsAuxiliaryBarContribution extends Disposable {

	static readonly ID = 'workbench.contrib.sessionsAuxiliaryBarContribution';

	private readonly activeChangesListener = this._register(new MutableDisposable<IDisposable>());
	private activeChangesView: ChangesViewPane | null = null;

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this.tryBindToChangesView();

		this._register(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.id !== CHANGES_VIEW_ID) {
				return;
			}

			this.tryBindToChangesView();
		}));
	}

	private tryBindToChangesView(): void {
		const changesView = this.viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
		if (!changesView) {
			this.activeChangesView = null;
			this.activeChangesListener.clear();
			return;
		}

		if (this.activeChangesView === changesView) {
			return;
		}

		this.activeChangesView = changesView;
		this.activeChangesListener.value = autorun(reader => {
			const hasChanges = changesView.activeSessionHasChanges.read(reader);
			this.syncAuxiliaryBarVisibility(hasChanges);
		});
	}

	private syncAuxiliaryBarVisibility(hasChanges: boolean): void {
		const shouldHideAuxiliaryBar = !hasChanges;
		const isAuxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (shouldHideAuxiliaryBar === !isAuxiliaryBarVisible) {
			return;
		}

		this.layoutService.setPartHidden(shouldHideAuxiliaryBar, Parts.AUXILIARYBAR_PART);
	}
} 
