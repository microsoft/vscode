/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { EditorExtensions, EditorsOrder } from '../../../../workbench/common/editor.js';
import { AutomationsLayout, CHAT_AUTOMATIONS_LAYOUT_SETTING, toAutomationsLayout } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AutomationsManagementEditor, AutomationsManagementEditorInput } from './views/automationsManagementEditor.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AutomationsManagementEditor,
		AutomationsManagementEditor.ID,
		localize('automationsManagementEditor', "Automations Editor"),
	),
	[
		// The input is a singleton, created through getOrCreate().
		new SyncDescriptor(AutomationsManagementEditorInput as unknown as { new(): AutomationsManagementEditorInput }),
	],
);

/**
 * Keeps the open Automations surface in step with `chat.automations.layout`: the modal while it's `modal`, the page
 * otherwise.
 */
class AutomationsLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.automationsLayout';

	/** Runs one reconciliation at a time, so quick setting changes can't interleave half-finished moves. */
	private readonly reconciliation = new Sequencer();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
	) {
		super();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CHAT_AUTOMATIONS_LAYOUT_SETTING)) {
				this.scheduleReconcile();
			}
		}));
		// Callers that show the Automations page directly still land in the modal while the layout is `modal`.
		this._register(autorun(reader => {
			if (customViewService.activeCustomView.read(reader)?.id === AUTOMATIONS_CUSTOM_VIEW_ID && this.getLayout() === 'modal') {
				this.scheduleReconcile();
			}
		}));
	}

	private getLayout(): AutomationsLayout {
		return toAutomationsLayout(this.configurationService.getValue(CHAT_AUTOMATIONS_LAYOUT_SETTING));
	}

	private scheduleReconcile(): void {
		this.reconciliation.queue(() => this.reconcile()).catch(onUnexpectedError);
	}

	/** Reads the setting and what's open when it runs, so a later change always wins over an earlier one. */
	private async reconcile(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		if (this.getLayout() === 'modal') {
			if (this.customViewService.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
				this.customViewService.hideCustomView();
				await this.editorService.openEditor(AutomationsManagementEditorInput.getOrCreate(), { pinned: true });
			}
			return;
		}
		const modalEditors = this.editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor instanceof AutomationsManagementEditorInput);
		if (modalEditors.length > 0) {
			await this.editorService.closeEditors(modalEditors);
			this.customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
		}
	}
}

registerWorkbenchContribution2(AutomationsLayoutContribution.ID, AutomationsLayoutContribution, WorkbenchPhase.AfterRestored);
