/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { isTemporaryWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IUnattendedRestartService } from '../../../services/lifecycle/common/unattendedRestart.js';

/**
 * Blocks an unattended restart while the user left in the middle of an interaction
 * or when opened editors would not be restored.
 */
export class WorkbenchUnattendedRestartParticipants extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workbenchUnattendedRestartParticipants';

	private openDialogs = 0;

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IDialogService dialogService: IDialogService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) {
		super();

		this._register(dialogService.onWillShowDialog(() => this.openDialogs++));
		this._register(dialogService.onDidShowDialog(() => this.openDialogs = Math.max(0, this.openDialogs - 1)));

		this._register(unattendedRestartService.registerParticipant({
			check: () => lifecycleService.phase < LifecyclePhase.Eventually ? 'workbench.starting' : undefined // not all participants are registered yet
		}));
		this._register(unattendedRestartService.registerParticipant({
			check: () => this.openDialogs > 0 ? 'workbench.dialogOpen' : undefined
		}));
		this._register(unattendedRestartService.registerParticipant({
			check: () => quickInputService.currentQuickInput ? 'workbench.quickInputOpen' : undefined
		}));
		this._register(unattendedRestartService.registerParticipant({
			check: () => this.getEditorsBlocker()
		}));
	}

	private getEditorsBlocker(): string | undefined {
		if (this.editorGroupsService.activeModalEditorPart) {
			return 'workbench.modalEditorOpen'; // the modal editor part is not persisted
		}

		if (this.editorService.editors.length === 0) {
			return undefined;
		}

		if (this.configurationService.getValue<boolean>('workbench.editor.restoreEditors') === false || isTemporaryWorkspace(this.contextService.getWorkspace())) {
			return 'workbench.editorsNotRestored';
		}

		const editorFactory = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
		if (this.editorService.editors.some(editor => !editorFactory.getEditorSerializer(editor)?.canSerialize(editor))) {
			return 'workbench.editorNotRestorable';
		}

		return undefined;
	}
}
