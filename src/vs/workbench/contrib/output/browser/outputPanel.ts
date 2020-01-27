/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action, IAction } from 'vs/base/common/actions';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { AbstractTextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { OUTPUT_PANEL_ID, IOutputService, CONTEXT_IN_OUTPUT } from 'vs/workbench/contrib/output/common/output';
import { SwitchOutputAction, SwitchOutputActionViewItem, ClearOutputAction, ToggleOrSetOutputScrollLockAction, OpenLogOutputFile } from 'vs/workbench/contrib/output/browser/outputActions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';

export class OutputPanel extends AbstractTextResourceEditor {

	private actions: IAction[] | undefined;

	// Override the instantiation service to use to be the scoped one
	private scopedInstantiationService: IInstantiationService;
	protected get instantiationService(): IInstantiationService { return this.scopedInstantiationService; }
	protected set instantiationService(instantiationService: IInstantiationService) { }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IOutputService private readonly outputService: IOutputService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(OUTPUT_PANEL_ID, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService);

		// Initially, the scoped instantiation service is the global
		// one until the editor is created later on
		this.scopedInstantiationService = instantiationService;
	}

	getId(): string {
		return OUTPUT_PANEL_ID;
	}

	getTitle(): string {
		return nls.localize('output', "Output");
	}

	getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.scopedInstantiationService.createInstance(SwitchOutputAction),
				this.scopedInstantiationService.createInstance(ClearOutputAction, ClearOutputAction.ID, ClearOutputAction.LABEL),
				this.scopedInstantiationService.createInstance(ToggleOrSetOutputScrollLockAction, ToggleOrSetOutputScrollLockAction.ID, ToggleOrSetOutputScrollLockAction.LABEL),
				this.scopedInstantiationService.createInstance(OpenLogOutputFile)
			];

			this.actions.forEach(a => this._register(a));
		}

		return this.actions;
	}

	getActionViewItem(action: Action): IActionViewItem | undefined {
		if (action.id === SwitchOutputAction.ID) {
			return this.scopedInstantiationService.createInstance(SwitchOutputActionViewItem, action);
		}

		return super.getActionViewItem(action);
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
		options.renderValidationDecorations = 'editable';

		const outputConfig = this.configurationService.getValue<any>('[Log]');
		if (outputConfig) {
			if (outputConfig['editor.minimap.enabled']) {
				options.minimap = { enabled: true };
			}
			if ('editor.wordWrap' in outputConfig) {
				options.wordWrap = outputConfig['editor.wordWrap'];
			}
		}

		return options;
	}

	protected getAriaLabel(): string {
		const channel = this.outputService.getActiveChannel();

		return channel ? nls.localize('outputPanelWithInputAriaLabel', "{0}, Output panel", channel.label) : nls.localize('outputPanelAriaLabel', "Output panel");
	}

	async setInput(input: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		const focus = !(options && options.preserveFocus);
		if (input.matches(this.input)) {
			return;
		}

		if (this.input) {
			// Dispose previous input (Output panel is not a workbench editor)
			this.input.dispose();
		}
		await super.setInput(input, options, token);
		if (focus) {
			this.focus();
		}
		this.revealLastLine();
	}

	clearInput(): void {
		if (this.input) {
			// Dispose current input (Output panel is not a workbench editor)
			this.input.dispose();
		}
		super.clearInput();
	}

	protected createEditor(parent: HTMLElement): void {

		// First create the scoped instantiation service and only then construct the editor using the scoped service
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		this.scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));

		super.createEditor(parent);

		CONTEXT_IN_OUTPUT.bindTo(scopedContextKeyService).set(true);

		const codeEditor = <ICodeEditor>this.getControl();
		this._register(codeEditor.onDidChangeCursorPosition((e) => {
			if (e.reason !== CursorChangeReason.Explicit) {
				return;
			}

			const model = codeEditor.getModel();
			if (model && this.actions) {
				const newPositionLine = e.position.lineNumber;
				const lastLine = model.getLineCount();
				const newLockState = lastLine !== newPositionLine;
				const lockAction = this.actions.filter((action) => action.id === ToggleOrSetOutputScrollLockAction.ID)[0];
				lockAction.run(newLockState);
			}
		}));
	}
}
