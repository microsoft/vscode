/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorInput, EditorOptions, SideBySideEditorInput, IEditorControl, IEditorPane } from 'vs/workbench/common/editor';
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
import { assertIsDefined } from 'vs/base/common/types';

export class SideBySideEditor extends BaseEditor {

	static readonly ID: string = 'workbench.editor.sidebysideEditor';
	static MASTER: SideBySideEditor | undefined;

	get minimumMasterWidth() { return this.masterEditorPane ? this.masterEditorPane.minimumWidth : 0; }
	get maximumMasterWidth() { return this.masterEditorPane ? this.masterEditorPane.maximumWidth : Number.POSITIVE_INFINITY; }
	get minimumMasterHeight() { return this.masterEditorPane ? this.masterEditorPane.minimumHeight : 0; }
	get maximumMasterHeight() { return this.masterEditorPane ? this.masterEditorPane.maximumHeight : Number.POSITIVE_INFINITY; }

	get minimumDetailsWidth() { return this.detailsEditorPane ? this.detailsEditorPane.minimumWidth : 0; }
	get maximumDetailsWidth() { return this.detailsEditorPane ? this.detailsEditorPane.maximumWidth : Number.POSITIVE_INFINITY; }
	get minimumDetailsHeight() { return this.detailsEditorPane ? this.detailsEditorPane.minimumHeight : 0; }
	get maximumDetailsHeight() { return this.detailsEditorPane ? this.detailsEditorPane.maximumHeight : Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from BaseEditor
	set minimumWidth(value: number) { /* noop */ }
	set maximumWidth(value: number) { /* noop */ }
	set minimumHeight(value: number) { /* noop */ }
	set maximumHeight(value: number) { /* noop */ }

	get minimumWidth() { return this.minimumMasterWidth + this.minimumDetailsWidth; }
	get maximumWidth() { return this.maximumMasterWidth + this.maximumDetailsWidth; }
	get minimumHeight() { return this.minimumMasterHeight + this.minimumDetailsHeight; }
	get maximumHeight() { return this.maximumMasterHeight + this.maximumDetailsHeight; }

	protected masterEditorPane?: BaseEditor;
	protected detailsEditorPane?: BaseEditor;

	private masterEditorContainer: HTMLElement | undefined;
	private detailsEditorContainer: HTMLElement | undefined;

	private splitview: SplitView | undefined;
	private dimension: DOM.Dimension = new DOM.Dimension(0, 0);

	private onDidCreateEditors = this._register(new Emitter<{ width: number; height: number; } | undefined>());

	private _onDidSizeConstraintsChange = this._register(new Relay<{ width: number; height: number; } | undefined>());
	readonly onDidSizeConstraintsChange = Event.any(this.onDidCreateEditors.event, this._onDidSizeConstraintsChange.event);

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

		const splitview = this.splitview = this._register(new SplitView(parent, { orientation: Orientation.HORIZONTAL }));
		this._register(this.splitview.onDidSashReset(() => splitview.distributeViewSizes()));

		this.detailsEditorContainer = DOM.$('.details-editor-container');
		this.splitview.addView({
			element: this.detailsEditorContainer,
			layout: size => this.detailsEditorPane && this.detailsEditorPane.layout(new DOM.Dimension(size, this.dimension.height)),
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, Sizing.Distribute);

		this.masterEditorContainer = DOM.$('.master-editor-container');
		this.splitview.addView({
			element: this.masterEditorContainer,
			layout: size => this.masterEditorPane && this.masterEditorPane.layout(new DOM.Dimension(size, this.dimension.height)),
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, Sizing.Distribute);

		this.updateStyles();
	}

	async setInput(newInput: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		const oldInput = this.input as SideBySideEditorInput;
		await super.setInput(newInput, options, token);

		return this.updateInput(oldInput, (newInput as SideBySideEditorInput), options, token);
	}

	setOptions(options: EditorOptions | undefined): void {
		if (this.masterEditorPane) {
			this.masterEditorPane.setOptions(options);
		}
	}

	protected setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		if (this.masterEditorPane) {
			this.masterEditorPane.setVisible(visible, group);
		}

		if (this.detailsEditorPane) {
			this.detailsEditorPane.setVisible(visible, group);
		}

		super.setEditorVisible(visible, group);
	}

	clearInput(): void {
		if (this.masterEditorPane) {
			this.masterEditorPane.clearInput();
		}

		if (this.detailsEditorPane) {
			this.detailsEditorPane.clearInput();
		}

		this.disposeEditors();

		super.clearInput();
	}

	focus(): void {
		if (this.masterEditorPane) {
			this.masterEditorPane.focus();
		}
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		const splitview = assertIsDefined(this.splitview);
		splitview.layout(dimension.width);
	}

	getControl(): IEditorControl | undefined {
		if (this.masterEditorPane) {
			return this.masterEditorPane.getControl();
		}

		return undefined;
	}

	getMasterEditorPane(): IEditorPane | undefined {
		return this.masterEditorPane;
	}

	getDetailsEditorPane(): IEditorPane | undefined {
		return this.detailsEditorPane;
	}

	private async updateInput(oldInput: SideBySideEditorInput, newInput: SideBySideEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		if (!newInput.matches(oldInput)) {
			if (oldInput) {
				this.disposeEditors();
			}

			return this.setNewInput(newInput, options, token);
		}

		if (!this.detailsEditorPane || !this.masterEditorPane) {
			return;
		}

		await Promise.all([
			this.detailsEditorPane.setInput(newInput.details, undefined, token),
			this.masterEditorPane.setInput(newInput.master, options, token)
		]);
	}

	private setNewInput(newInput: SideBySideEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		const detailsEditor = this.doCreateEditor(newInput.details, assertIsDefined(this.detailsEditorContainer));
		const masterEditor = this.doCreateEditor(newInput.master, assertIsDefined(this.masterEditorContainer));

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

	private async onEditorsCreated(details: BaseEditor, master: BaseEditor, detailsInput: EditorInput, masterInput: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		this.detailsEditorPane = details;
		this.masterEditorPane = master;

		this._onDidSizeConstraintsChange.input = Event.any(
			Event.map(details.onDidSizeConstraintsChange, () => undefined),
			Event.map(master.onDidSizeConstraintsChange, () => undefined)
		);

		this.onDidCreateEditors.fire(undefined);

		await Promise.all([
			this.detailsEditorPane.setInput(detailsInput, undefined, token),
			this.masterEditorPane.setInput(masterInput, options, token)]
		);
	}

	updateStyles(): void {
		super.updateStyles();

		if (this.masterEditorContainer) {
			this.masterEditorContainer.style.boxShadow = `-6px 0 5px -5px ${this.getColor(scrollbarShadow)}`;
		}
	}

	private disposeEditors(): void {
		if (this.detailsEditorPane) {
			this.detailsEditorPane.dispose();
			this.detailsEditorPane = undefined;
		}

		if (this.masterEditorPane) {
			this.masterEditorPane.dispose();
			this.masterEditorPane = undefined;
		}

		if (this.detailsEditorContainer) {
			DOM.clearNode(this.detailsEditorContainer);
		}

		if (this.masterEditorContainer) {
			DOM.clearNode(this.masterEditorContainer);
		}
	}

	dispose(): void {
		this.disposeEditors();

		super.dispose();
	}
}
