/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { GroupDirection, ICreateEditorPartOptions, IContentPart } from '../../../services/editor/common/editorGroupsService.js';
import { GroupIdentifier } from '../../../common/editor.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { GroupTransferKind, IEditorGroupView, IEditorGroupViewOptions, IEditorPartsView } from './editor.js';
import { EditorPart, IEditorPartUIState } from './editorPart.js';

/**
 * An editor part that renders into a container of its owner. It behaves
 * like the main editor area; what it shows comes from its content only.
 * Its owner places it, lays it out, keeps its state and closes it.
 */
export class ContentPart extends EditorPart implements IContentPart {

	private static COUNTER = 1;

	private readonly _onWillClose = this._register(new Emitter<void>());
	readonly onWillClose = this._onWillClose.event;

	private readonly _onWillMoveGroupOut = this._register(new Emitter<IEditorGroupView>());
	readonly onWillMoveGroupOut = this._onWillMoveGroupOut.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	/**
	 * Fired once all listeners of {@link onWillClose} were notified.
	 */
	readonly onDidClose = this._onDidClose.event;

	private readonly _onDidRelease = this._register(new Emitter<void>());
	/**
	 * Fired once all listeners of {@link onDidClose} were notified, for the
	 * editor parts service to release the part.
	 */
	readonly onDidRelease = this._onDidRelease.event;

	constructor(
		windowId: number,
		editorPartsView: IEditorPartsView,
		private readonly createOptions: ICreateEditorPartOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IHostService hostService: IHostService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editorPartsView, `workbench.parts.contentPart.${ContentPart.COUNTER++}`, createOptions.label ?? localize('contentPart', "Editor"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);

		if (createOptions.partOptions) {
			this._register(this.enforcePartOptions(createOptions.partOptions));
		}
	}

	override get isTransient(): boolean {
		return true;
	}

	override create(parent: HTMLElement, options?: object): void {
		parent.classList.add('part', 'editor');

		super.create(parent, options);

		parent.setAttribute('role', 'region');
		parent.setAttribute('aria-label', this.createOptions.label ?? localize('contentPart', "Editor"));
	}

	override removeGroup(group: number | IEditorGroupView, preserveFocus?: boolean): void {
		if (this.count === 1) {
			return; // the last group stays: the owner closes the part
		}

		super.removeGroup(group, preserveFocus);
	}

	override moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		const sourceView = this.assertGroupView(group);
		const targetView = typeof location === 'number' ? this.editorPartsView.getGroup(location) : location;
		if (targetView && targetView.groupsView !== sourceView.groupsView) {
			// Before the move is announced: a group that cannot go stays, and nothing hears of it
			if (this.vetoGroupTransfer([sourceView], this.getTransferTarget(GroupTransferKind.MoveGroup, sourceView, targetView), false)) {
				return sourceView;
			}
			this._onWillMoveGroupOut.fire(sourceView);
		}

		return super.moveGroup(group, location, direction);
	}

	protected override getGroupViewOptions(): IEditorGroupViewOptions | undefined {
		return this.createOptions.groupViewOptions as IEditorGroupViewOptions | undefined;
	}

	protected override loadState(): IEditorPartUIState | undefined {
		return this.createOptions.state as IEditorPartUIState | undefined;
	}

	protected override saveState(): void {
		return; // the owner keeps the state of the part
	}

	close(): boolean {

		// First close all editors that are non-confirming
		for (const group of this.groups) {
			group.closeAllEditors({ excludeConfirming: true, force: true });
		}

		// Then merge remaining into the main part of its window, unless
		// this is that part: then into the main part
		const windowMainPart = this.editorPartsView.getWindowMainPart(this.windowId);
		if (!this.mergeGroupsToMainPart(windowMainPart === this ? this.editorPartsView.mainPart : windowMainPart)) {
			return false; // do not close when editors could not be merged back
		}

		this.doClose();

		return true;
	}

	forceClose(): void {
		if (!this.close()) {
			this.doClose(); // the editors that could not be merged back close with the part
		}
	}

	private closed = false;

	private doClose(): void {
		if (this.closed) {
			return;
		}

		this.closed = true;

		this._onWillClose.fire();
		this._onDidClose.fire();
		this._onDidRelease.fire();
	}
}
