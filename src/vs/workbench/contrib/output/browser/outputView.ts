/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IAction } from 'vs/base/common/actions';
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
import { OUTPUT_VIEW_ID, IOutputService, CONTEXT_IN_OUTPUT, IOutputChannel, CONTEXT_ACTIVE_LOG_OUTPUT } from 'vs/workbench/contrib/output/common/output';
import { SwitchOutputAction, SwitchOutputActionViewItem, ClearOutputAction, ToggleOrSetOutputScrollLockAction, OpenLogOutputFile } from 'vs/workbench/contrib/output/browser/outputActions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';

export class OutputViewPane extends ViewPane {

	private readonly editor: OutputEditor;
	private channelId: string | undefined;
	private editorPromise: Promise<OutputEditor> | null = null;
	private actions: IAction[] | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOutputService private readonly outputService: IOutputService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService);
		this.editor = instantiationService.createInstance(OutputEditor);
		this._register(this.editor.onTitleAreaUpdate(() => {
			this.updateTitle(this.editor.getTitle());
			this.updateActions();
		}));
		this._register(this.onDidChangeBodyVisibility(() => this.onDidChangeVisibility(this.isBodyVisible())));
	}

	showChannel(channel: IOutputChannel, preserveFocus: boolean): void {
		if (this.channelId !== channel.id) {
			this.setInput(channel);
		}
		if (!preserveFocus) {
			this.focus();
		}
	}

	focus(): void {
		super.focus();
		if (this.editorPromise) {
			this.editorPromise.then(() => this.editor.focus());
		}
	}

	renderBody(container: HTMLElement): void {
		this.editor.create(container);
		const codeEditor = <ICodeEditor>this.editor.getControl();
		this._register(codeEditor.onDidChangeModelContent(() => {
			const activeChannel = this.outputService.getActiveChannel();
			if (activeChannel && !activeChannel.scrollLock) {
				this.editor.revealLastLine();
			}
		}));
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

	layoutBody(height: number, width: number): void {
		this.editor.layout({ height, width });
	}

	getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this._register(this.instantiationService.createInstance(SwitchOutputAction)),
				this._register(this.instantiationService.createInstance(ClearOutputAction, ClearOutputAction.ID, ClearOutputAction.LABEL)),
				this._register(this.instantiationService.createInstance(ToggleOrSetOutputScrollLockAction, ToggleOrSetOutputScrollLockAction.ID, ToggleOrSetOutputScrollLockAction.LABEL)),
				this._register(this.instantiationService.createInstance(OpenLogOutputFile))
			];
		}
		return [...super.getActions(), ...this.actions];
	}

	getSecondaryActions(): IAction[] {
		return [...super.getSecondaryActions(), ...this.editor.getSecondaryActions()];
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === SwitchOutputAction.ID) {
			return this.instantiationService.createInstance(SwitchOutputActionViewItem, action);
		}
		return super.getActionViewItem(action);
	}


	private onDidChangeVisibility(visible: boolean): void {
		this.editor.setVisible(visible);
		const channel = this.channelId ? this.outputService.getChannel(this.channelId) : undefined;
		if (visible && channel) {
			this.setInput(channel);
		} else {
			this.clearInput();
		}
	}

	private setInput(channel: IOutputChannel): void {
		this.channelId = channel.id;
		const descriptor = this.outputService.getChannelDescriptor(channel.id)!;
		CONTEXT_ACTIVE_LOG_OUTPUT.bindTo(this.contextKeyService).set(!!descriptor.file && descriptor.log);
		this.editorPromise = this.editor.setInput(this.createInput(channel), EditorOptions.create({ preserveFocus: true }), CancellationToken.None)
			.then(() => this.editor);
	}

	private clearInput(): void {
		CONTEXT_ACTIVE_LOG_OUTPUT.bindTo(this.contextKeyService).set(false);
		this.editor.clearInput();
		this.editorPromise = null;
	}

	private createInput(channel: IOutputChannel): ResourceEditorInput {
		return this.instantiationService.createInstance(ResourceEditorInput, nls.localize('output model title', "{0} - Output", channel.label), nls.localize('channel', "Output channel for '{0}'", channel.label), channel.uri, undefined);
	}

}

export class OutputEditor extends AbstractTextResourceEditor {

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
		super(OUTPUT_VIEW_ID, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService);

		// Initially, the scoped instantiation service is the global
		// one until the editor is created later on
		this.scopedInstantiationService = instantiationService;
	}

	getId(): string {
		return OUTPUT_VIEW_ID;
	}

	getTitle(): string {
		return nls.localize('output', "Output");
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

		return channel ? nls.localize('outputViewWithInputAriaLabel', "{0}, Output panel", channel.label) : nls.localize('outputViewAriaLabel', "Output panel");
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
	}
}
