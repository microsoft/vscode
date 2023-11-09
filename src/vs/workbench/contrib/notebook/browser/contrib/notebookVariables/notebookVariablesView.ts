/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptor, IViewDescriptorService } from 'vs/workbench/common/views';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { variablesViewIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class NotebookVariablesView extends ViewPane {

	static readonly ID = 'notebookVariablesView';
	static readonly TITLE: ILocalizedString = nls.localize2('notebook.notebookVariables', "Notebook Variables");

	constructor(
		options: IViewPaneOptions,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IQuickInputService protected quickInputService: IQuickInputService,
		@ICommandService protected commandService: ICommandService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this._register(this.editorService.onDidActiveEditorChange(this.handleActiveEditorChange));
	}

	private handleActiveEditorChange() {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane && activeEditorPane.getId() === 'workbench.editor.notebook') {
			const notebookModel = getNotebookEditorFromEditorPane(activeEditorPane)?.textModel;
			if (notebookModel) {
				const selectedKernel = this.notebookKernelService.getMatchingKernel(notebookModel).selected;
				console.log(selectedKernel?.id);
			}
		}
	}
}

export class VariablesPanelDescriptor implements IViewDescriptor {
	readonly id = NotebookVariablesView.ID;
	readonly name: ILocalizedString = NotebookVariablesView.TITLE;
	readonly ctorDescriptor: SyncDescriptor<NotebookVariablesView>;
	readonly canToggleVisibility = true;
	readonly hideByDefault = false;
	readonly order = 500;
	readonly remoteAuthority?: string | string[];
	readonly canMoveView = true;
	readonly containerIcon = variablesViewIcon;

	constructor() {
		this.ctorDescriptor = new SyncDescriptor(NotebookVariablesView);
	}
}


