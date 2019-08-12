/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/output';
import * as nls from 'vs/nls';
import { Action, IAction } from 'vs/base/common/actions';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { AbstractTextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { OUTPUT_PANEL_ID, IOutputService, CONTEXT_IN_OUTPUT } from 'vs/workbench/contrib/output/common/output';
import { SwitchOutputAction, SwitchOutputActionViewItem, ClearOutputAction, ToggleOrSetOutputScrollLockAction, OpenLogOutputFile } from 'vs/workbench/contrib/output/browser/outputActions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';

export class OutputPanel extends AbstractTextResourceEditor {
	private actions: IAction[] | undefined;
	private scopedInstantiationService: IInstantiationService;
	private _focus = false;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly baseConfigurationService: IConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IOutputService private readonly outputService: IOutputService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IWindowService windowService: IWindowService
	) {
		super(OUTPUT_PANEL_ID, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, textFileService, editorService, windowService);

		this.scopedInstantiationService = instantiationService;
	}

	public getId(): string {
		return OUTPUT_PANEL_ID;
	}

	public getTitle(): string {
		return nls.localize('output', "Output");
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(SwitchOutputAction),
				this.instantiationService.createInstance(ClearOutputAction, ClearOutputAction.ID, ClearOutputAction.LABEL),
				this.instantiationService.createInstance(ToggleOrSetOutputScrollLockAction, ToggleOrSetOutputScrollLockAction.ID, ToggleOrSetOutputScrollLockAction.LABEL),
				this.instantiationService.createInstance(OpenLogOutputFile)
			];

			this.actions.forEach(a => this._register(a));
		}

		return this.actions;
	}

	public getActionViewItem(action: Action): IActionViewItem | undefined {
		if (action.id === SwitchOutputAction.ID) {
			return this.instantiationService.createInstance(SwitchOutputActionViewItem, action);
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

		const outputConfig = this.baseConfigurationService.getValue<any>('[Log]');
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

	public setInput(input: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		this._focus = !options.preserveFocus;
		if (input.matches(this.input)) {
			return Promise.resolve(undefined);
		}

		if (this.input) {
			// Dispose previous input (Output panel is not a workbench editor)
			this.input.dispose();
		}
		return super.setInput(input, options, token).then(() => {
			if (this._focus) {
				this.focus();
			}
			this.revealLastLine();
		});
	}

	public clearInput(): void {
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
		codeEditor.onDidChangeCursorPosition((e) => {
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
		});
	}

	public get instantiationService(): IInstantiationService {
		return this.scopedInstantiationService;
	}
}
