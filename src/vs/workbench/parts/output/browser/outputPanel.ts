/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action, IAction } from 'vs/base/common/actions';
import { Builder } from 'vs/base/browser/builder';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IEditorOptions } from 'vs/editor/common/editorCommon';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { StringEditor } from 'vs/workbench/browser/parts/editor/stringEditor';
import { OUTPUT_PANEL_ID, IOutputService, CONTEXT_IN_OUTPUT } from 'vs/workbench/parts/output/common/output';
import { OutputEditorInput } from 'vs/workbench/parts/output/browser/outputEditorInput';
import { SwitchOutputAction, SwitchOutputActionItem, ClearOutputAction } from 'vs/workbench/parts/output/browser/outputActions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';

export class OutputPanel extends StringEditor {

	private toDispose: lifecycle.IDisposable[];
	private actions: IAction[];
	private scopedInstantiationService: IInstantiationService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@IOutputService private outputService: IOutputService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(telemetryService, instantiationService, contextService, storageService,
			messageService, configurationService, eventService, editorService, themeService, untitledEditorService);
		this.scopedInstantiationService = instantiationService;
		this.toDispose = [];
	}

	public getId(): string {
		return OUTPUT_PANEL_ID;
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(SwitchOutputAction),
				this.instantiationService.createInstance(ClearOutputAction, ClearOutputAction.ID, ClearOutputAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}

		return this.actions;
	}

	public getActionItem(action: Action): IActionItem {
		if (action.id === SwitchOutputAction.ID) {
			return this.instantiationService.createInstance(SwitchOutputActionItem, action);
		}

		return super.getActionItem(action);
	}

	protected getCodeEditorOptions(): IEditorOptions {
		const options = super.getCodeEditorOptions();
		options.wrappingColumn = 0;				// all output editors wrap
		options.lineNumbers = 'off';			// all output editors hide line numbers
		options.glyphMargin = false;
		options.lineDecorationsWidth = 20;
		options.rulers = [];
		options.folding = false;
		options.scrollBeyondLastLine = false;
		options.renderLineHighlight = 'none';

		const channel = this.outputService.getActiveChannel();
		options.ariaLabel = channel ? nls.localize('outputPanelWithInputAriaLabel', "{0}, Output panel", channel.label) : nls.localize('outputPanelAriaLabel', "Output panel");

		return options;
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => this.revealLastLine());
	}

	public createEditor(parent: Builder): void {
		// First create the scoped instantation service and only then construct the editor using the scoped service
		const scopedContextKeyService = this.contextKeyService.createScoped(parent.getHTMLElement());
		this.toDispose.push(scopedContextKeyService);
		this.scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
		super.createEditor(parent);

		CONTEXT_IN_OUTPUT.bindTo(scopedContextKeyService).set(true);
		this.setInput(OutputEditorInput.getInstance(this.instantiationService, this.outputService.getActiveChannel()), null);
	}

	public get instantiationService(): IInstantiationService {
		return this.scopedInstantiationService;
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}
}
