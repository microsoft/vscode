/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ISessionHost } from '../../../services/sessions/browser/sessionHost.js';
import { Menus } from '../../sessions/browser/menus.js';
import { getActiveSessionChanges, IChangesEditorScope, IChangesViewService } from '../../sessions/common/changesViewService.js';
import { ChangesPickerActionItem, ChangesPickerSummary, createChangesPickerLabelObservable, createChangesSessionScope, IChangesPickerLabel, VERSIONS_PICKER_ACTION_ID } from './changesView.js';

/** The summary and label of the active session's changes, which the pickers of the main window share. */
class ActiveChangesPickerState extends Disposable {
	readonly summary: ChangesPickerSummary;
	readonly label: IObservable<IChangesPickerLabel | undefined>;

	constructor(
		@IChangesViewService changesViewService: IChangesViewService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const activeChanges = getActiveSessionChanges(changesViewService);
		this.label = createChangesPickerLabelObservable(this, activeChanges);
		this.summary = this._register(instantiationService.createInstance(ChangesPickerSummary, activeChanges.changesSummaryObs));
	}
}

/**
 * Creates the changeset picker of the header it renders in: of the Changes editor that the header is of, else of the session
 * of its window, with the shared summary of the active session in the main window.
 */
class ChangesPickerActionItemFactory {

	constructor(
		private readonly _getActiveState: () => ActiveChangesPickerState,
		@IChangesEditorScope private readonly _editorScope: IChangesEditorScope,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@ISessionHost private readonly _sessionHost: ISessionHost,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	create(action: MenuItemAction): ChangesPickerActionItem {
		// The shared summary and label follow the active session; other sessions get their own.
		const scope = this._editorScope.scope ?? createChangesSessionScope(this._changesViewService, this._sessionHost);
		if (scope.isMainWindow) {
			const state = this._getActiveState();
			return this._instantiationService.createInstance(ChangesPickerActionItem, action, state.summary, state.label, undefined);
		}
		const summary = this._instantiationService.createInstance(ChangesPickerSummary, scope.changes.changesSummaryObs);
		const item = this._instantiationService.createInstance(ChangesPickerActionItem, action, summary, createChangesPickerLabelObservable(summary, scope.changes), scope);
		item.own(summary);
		return item;
	}
}

/**
 * Renders the Changes editor's changeset picker in the editor header menu, which the editor part around the Changes editor
 * draws, as in the Agents window, or the Changes editor itself, as in an editor window.
 */
export class ChangesPickerActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesEditorHeaderPicker';

	// Created as the first picker of the main window shows, not as the window starts
	private readonly _activeState = this._register(new MutableDisposable<ActiveChangesPickerState>());

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// Headers that show before it registers render the picker again
		const onDidRegister = this._register(new Emitter<void>());
		const getActiveState = () => this._activeState.value ??= instantiationService.createInstance(ActiveChangesPickerState);
		this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, VERSIONS_PICKER_ACTION_ID, (action, _options, itemInstantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			// Created where the item is, so that it injects the services of its header, such as of its Changes editor
			return itemInstantiationService.createInstance(ChangesPickerActionItemFactory, getActiveState).create(action);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}
