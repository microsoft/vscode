/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorInput, EditorOptions, SideBySideEditorInput, IEditorControl, IEditor } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { scrollbarShadow } from 'vs/platform/theme/common/colorRegistry';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { SplitView, Sizing, Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { Event, Relay, Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';

export class SideBySideEditor extends BaseEditor {

	static readonly ID: string = 'workbench.editor.sidebysideEditor';
	static MASTER: SideBySideEditor | undefined;

	get minimumMasterWidth() { return this.masterEditor ? this.masterEditor.minimumWidth : 0; }
	get maximumMasterWidth() { return this.masterEditor ? this.masterEditor.maximumWidth : Number.POSITIVE_INFINITY; }
	get minimumMasterHeight() { return this.masterEditor ? this.masterEditor.minimumHeight : 0; }
	get maximumMasterHeight() { return this.masterEditor ? this.masterEditor.maximumHeight : Number.POSITIVE_INFINITY; }

	get minimumDetailsWidth() { return this.detailsEditor ? this.detailsEditor.minimumWidth : 0; }
	get maximumDetailsWidth() { return this.detailsEditor ? this.detailsEditor.maximumWidth : Number.POSITIVE_INFINITY; }
	get minimumDetailsHeight() { return this.detailsEditor ? this.detailsEditor.minimumHeight : 0; }
	get maximumDetailsHeight() { return this.detailsEditor ? this.detailsEditor.maximumHeight : Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /* noop */ }
	set maximumWidth(value: number) { /* noop */ }
	set minimumHeight(value: number) { /* noop */ }
	set maximumHeight(value: number) { /* noop */ }

	get minimumWidth() { return this.minimumMasterWidth + this.minimumDetailsWidth; }
	get maximumWidth() { return this.maximumMasterWidth + this.maximumDetailsWidth; }
	get minimumHeight() { return this.minimumMasterHeight + this.minimumDetailsHeight; }
	get maximumHeight() { return this.maximumMasterHeight + this.maximumDetailsHeight; }

	protected masterEditor?: BaseEditor;
	protected detailsEditor?: BaseEditor;

	private masterEditorContainer: HTMLElement;
	private detailsEditorContainer: HTMLElement;

	private splitview: SplitView;
	private dimension: DOM.Dimension = new DOM.Dimension(0, 0);

	private onDidCreateEditors = this._register(new Emitter<{ width: number; height: number; } | undefined>());
	private _onDidSizeConstraintsChange = this._register(new Relay<{ width: number; height: number; } | undefined>());
	readonly onDidSizeConstraintsChange: Event<{ width: number; height: number; } | undefined> = Event.any(this.onDidCreateEditors.event, this._onDidSizeConstraintsChange.event);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(SideBySideEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		DOM.addClass(parent, 'side-by-side-editor');

		this.splitview = this._register(new SplitView(parent, { orientation: Orientation.HORIZONTAL }));
		this._register(this.splitview.onDidSashReset(() => this.splitview.distributeViewSizes()));

		this.detailsEditorContainer = DOM.$('.details-editor-container');
		this.splitview.addView({
			element: this.detailsEditorContainer,
			layout: size => this.detailsEditor && this.detailsEditor.layout(new DOM.Dimension(size, this.dimension.height)),
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, Sizing.Distribute);

		this.masterEditorContainer = DOM.$('.master-editor-container');
		this.splitview.addView({
			element: this.masterEditorContainer,
			layout: size => this.masterEditor && this.masterEditor.layout(new DOM.Dimension(size, this.dimension.height)),
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, Sizing.Distribute);

		this.updateStyles();
	}

	async setInput(newInput: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		const oldInput = this.input as SideBySideEditorInput;
		await super.setInput(newInput, options, token);

		return this.updateInput(oldInput, (newInput as SideBySideEditorInput), options, token);
	}

	setOptions(options: EditorOptions): void {
		if (this.masterEditor) {
			this.masterEditor.setOptions(options);
		}
	}

	protected setEditorVisible(visible: boolean, group: IEditorGroup): void {
		if (this.masterEditor) {
			this.masterEditor.setVisible(visible, group);
		}

		if (this.detailsEditor) {
			this.detailsEditor.setVisible(visible, group);
		}

		super.setEditorVisible(visible, group);
	}

	clearInput(): void {
		if (this.masterEditor) {
			this.masterEditor.clearInput();
		}

		if (this.detailsEditor) {
			this.detailsEditor.clearInput();
		}

		this.disposeEditors();

		super.clearInput();
	}

	focus(): void {
		if (this.masterEditor) {
			this.masterEditor.focus();
		}
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.splitview.layout(dimension.width);
	}

	getControl(): IEditorControl | undefined {
		if (this.masterEditor) {
			return this.masterEditor.getControl();
		}

		return undefined;
	}

	getMasterEditor(): IEditor | undefined {
		return this.masterEditor;
	}

	getDetailsEditor(): IEditor | undefined {
		return this.detailsEditor;
	}

	private async updateInput(oldInput: SideBySideEditorInput, newInput: SideBySideEditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		if (!newInput.matches(oldInput)) {
			if (oldInput) {
				this.disposeEditors();
			}

			return this.setNewInput(newInput, options, token);
		}

		if (!this.detailsEditor || !this.masterEditor) {
			return;
		}

		await Promise.all([
			this.detailsEditor.setInput(newInput.details, null, token),
			this.masterEditor.setInput(newInput.master, options, token)
		]);
	}

	private setNewInput(newInput: SideBySideEditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		const detailsEditor = this.doCreateEditor(newInput.details, this.detailsEditorContainer);
		const masterEditor = this.doCreateEditor(newInput.master, this.masterEditorContainer);

		return this.onEditorsCreated(detailsEditor, masterEditor, newInput.details, newInput.master, options, token);
	}

	private doCreateEditor(editorInput: EditorInput, container: HTMLElement): BaseEditor {
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(editorInput);
		if (!descriptor) {
			throw new Error('No descriptor for editor found');
		}

		const editor = descriptor.instantiate(this.instantiationService);
		editor.create(container);
		editor.setVisible(this.isVisible(), this.group);

		return editor;
	}

	private async onEditorsCreated(details: BaseEditor, master: BaseEditor, detailsInput: EditorInput, masterInput: EditorInput, options: EditorOptions, token: CancellationToken): Promise<void> {
		this.detailsEditor = details;
		this.masterEditor = master;

		this._onDidSizeConstraintsChange.input = Event.any(
			Event.map(details.onDidSizeConstraintsChange, () => undefined),
			Event.map(master.onDidSizeConstraintsChange, () => undefined)
		);

		this.onDidCreateEditors.fire(undefined);

		await Promise.all([
			this.detailsEditor.setInput(detailsInput, null, token),
			this.masterEditor.setInput(masterInput, options, token)]
		);
	}

	updateStyles(): void {
		super.updateStyles();

		if (this.masterEditorContainer) {
			this.masterEditorContainer.style.boxShadow = `-6px 0 5px -5px ${this.getColor(scrollbarShadow)}`;
		}
	}

	private disposeEditors(): void {
		if (this.detailsEditor) {
			this.detailsEditor.dispose();
			this.detailsEditor = undefined;
		}

		if (this.masterEditor) {
			this.masterEditor.dispose();
			this.masterEditor = undefined;
		}

		this.detailsEditorContainer.innerHTML = '';
		this.masterEditorContainer.innerHTML = '';
	}

	dispose(): void {
		this.disposeEditors();

		super.dispose();
	}
}
