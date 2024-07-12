/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./output';
import * as nls from 'vs/nls';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions as ICodeEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { AbstractTextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { OUTPUT_VIEW_ID, CONTEXT_IN_OUTPUT, IOutputChannel, CONTEXT_OUTPUT_SCROLL_LOCK } from 'vs/workbench/services/output/common/output';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPane';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { TextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Dimension } from 'vs/base/browser/dom';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import { ResourceContextKey } from 'vs/workbench/common/contextkeys';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { computeEditorAriaLabel } from 'vs/workbench/browser/editor';
import { IHoverService } from 'vs/platform/hover/browser/hover';

export class OutputViewPane extends ViewPane {

	private readonly editor: OutputEditor;
	private channelId: string | undefined;
	private editorPromise: CancelablePromise<OutputEditor> | null = null;

	private readonly scrollLockContextKey: IContextKey<boolean>;
	get scrollLock(): boolean { return !!this.scrollLockContextKey.get(); }
	set scrollLock(scrollLock: boolean) { this.scrollLockContextKey.set(scrollLock); }

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
		this.scrollLockContextKey = CONTEXT_OUTPUT_SCROLL_LOCK.bindTo(this.contextKeyService);

		const editorInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		this.editor = this._register(editorInstantiationService.createInstance(OutputEditor));
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

	override focus(): void {
		super.focus();
		this.editorPromise?.then(() => this.editor.focus());
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.editor.create(container);
		container.classList.add('output-view');
		const codeEditor = <ICodeEditor>this.editor.getControl();
		codeEditor.setAriaOptions({ role: 'document', activeDescendant: undefined });
		this._register(codeEditor.onDidChangeModelContent(() => {
			if (!this.scrollLock) {
				this.editor.revealLastLine();
			}
		}));
		this._register(codeEditor.onDidChangeCursorPosition((e) => {
			if (e.reason !== CursorChangeReason.Explicit) {
				return;
			}

			if (!this.configurationService.getValue('output.smartScroll.enabled')) {
				return;
			}

			const model = codeEditor.getModel();
			if (model) {
				const newPositionLine = e.position.lineNumber;
				const lastLine = model.getLineCount();
				this.scrollLock = lastLine !== newPositionLine;
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.editor.layout(new Dimension(width, height));
	}

	private onDidChangeVisibility(visible: boolean): void {
		this.editor.setVisible(visible);
		if (!visible) {
			this.clearInput();
		}
	}

	private setInput(channel: IOutputChannel): void {
		this.channelId = channel.id;

		const input = this.createInput(channel);
		if (!this.editor.input || !input.matches(this.editor.input)) {
			this.editorPromise?.cancel();
			this.editorPromise = createCancelablePromise(token => this.editor.setInput(this.createInput(channel), { preserveFocus: true }, Object.create(null), token)
				.then(() => this.editor));
		}

	}

	private clearInput(): void {
		this.channelId = undefined;
		this.editor.clearInput();
		this.editorPromise = null;
	}

	private createInput(channel: IOutputChannel): TextResourceEditorInput {
		return this.instantiationService.createInstance(TextResourceEditorInput, channel.uri, nls.localize('output model title', "{0} - Output", channel.label), nls.localize('channel', "Output channel for '{0}'", channel.label), undefined, undefined);
	}

}

class OutputEditor extends AbstractTextResourceEditor {
	private readonly resourceContext: ResourceContextKey;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService
	) {
		super(OUTPUT_VIEW_ID, editorGroupService.activeGroup /* TODO@bpasero this is wrong */, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService);

		this.resourceContext = this._register(instantiationService.createInstance(ResourceContextKey));
	}

	override getId(): string {
		return OUTPUT_VIEW_ID;
	}

	override getTitle(): string {
		return nls.localize('output', "Output");
	}

	protected override getConfigurationOverrides(configuration: IEditorConfiguration): ICodeEditorOptions {
		const options = super.getConfigurationOverrides(configuration);
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
		options.padding = undefined;
		options.readOnly = true;
		options.domReadOnly = true;
		options.unicodeHighlight = {
			nonBasicASCII: false,
			invisibleCharacters: false,
			ambiguousCharacters: false,
		};

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
		return this.input ? this.input.getAriaLabel() : nls.localize('outputViewAriaLabel', "Output panel");
	}

	protected override computeAriaLabel(): string {
		return this.input ? computeEditorAriaLabel(this.input, undefined, undefined, this.editorGroupService.count) : this.getAriaLabel();
	}

	override async setInput(input: TextResourceEditorInput, options: ITextEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const focus = !(options && options.preserveFocus);
		if (this.input && input.matches(this.input)) {
			return;
		}

		if (this.input) {
			// Dispose previous input (Output panel is not a workbench editor)
			this.input.dispose();
		}
		await super.setInput(input, options, context, token);

		this.resourceContext.set(input.resource);

		if (focus) {
			this.focus();
		}
		this.revealLastLine();
	}

	override clearInput(): void {
		if (this.input) {
			// Dispose current input (Output panel is not a workbench editor)
			this.input.dispose();
		}
		super.clearInput();

		this.resourceContext.reset();
	}

	protected override createEditor(parent: HTMLElement): void {

		parent.setAttribute('role', 'document');

		super.createEditor(parent);

		const scopedContextKeyService = this.scopedContextKeyService;
		if (scopedContextKeyService) {
			CONTEXT_IN_OUTPUT.bindTo(scopedContextKeyService).set(true);
		}
	}
}
