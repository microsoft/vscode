/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/output';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action, IAction } from 'vs/base/common/actions';
import { Builder } from 'vs/base/browser/builder';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { TextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { OutputEditors, OUTPUT_PANEL_ID, IOutputService, CONTEXT_IN_OUTPUT } from 'vs/workbench/parts/output/common/output';
import { SwitchOutputAction, SwitchOutputActionItem, ClearOutputAction, ToggleOutputScrollLockAction } from 'vs/workbench/parts/output/browser/outputActions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class OutputPanel extends TextResourceEditor {
	private actions: IAction[];
	private scopedInstantiationService: IInstantiationService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IOutputService private outputService: IOutputService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IModeService modeService: IModeService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(telemetryService, instantiationService, storageService, configurationService, themeService, editorGroupService, modeService, textFileService);

		this.scopedInstantiationService = instantiationService;
	}

	public getId(): string {
		return OUTPUT_PANEL_ID;
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(SwitchOutputAction),
				this.instantiationService.createInstance(ClearOutputAction, ClearOutputAction.ID, ClearOutputAction.LABEL),
				this.instantiationService.createInstance(ToggleOutputScrollLockAction, ToggleOutputScrollLockAction.ID, ToggleOutputScrollLockAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toUnbind.push(a);
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

	protected getConfigurationOverrides(): IEditorOptions {
		const options = super.getConfigurationOverrides();
		options.wordWrap = 'on';				// all output editors wrap
		options.lineNumbers = 'off';			// all output editors hide line numbers
		options.glyphMargin = false;
		options.lineDecorationsWidth = 20;
		options.rulers = [];
		options.folding = false;
		options.scrollBeyondLastLine = false;
		options.renderLineHighlight = 'none';
		options.minimap = { enabled: false };

		const outputConfig = this.configurationService.getConfiguration(null, '[Log]');
		if (outputConfig && outputConfig['editor.minimap.enabled']) {
			options.minimap = { enabled: true };
		}

		return options;
	}

	protected getAriaLabel(): string {
		const channel = this.outputService.getActiveChannel();

		return channel ? nls.localize('outputPanelWithInputAriaLabel', "{0}, Output panel", channel.label) : nls.localize('outputPanelAriaLabel', "Output panel");
	}

	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => this.revealLastLine());
	}

	protected createEditor(parent: Builder): void {

		// First create the scoped instantation service and only then construct the editor using the scoped service
		const scopedContextKeyService = this.contextKeyService.createScoped(parent.getHTMLElement());
		this.toUnbind.push(scopedContextKeyService);
		this.scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
		super.createEditor(parent);

		CONTEXT_IN_OUTPUT.bindTo(scopedContextKeyService).set(true);
		this.setInput(OutputEditors.getInstance(this.instantiationService, this.outputService.getActiveChannel()), null);
	}

	public get instantiationService(): IInstantiationService {
		return this.scopedInstantiationService;
	}
}
