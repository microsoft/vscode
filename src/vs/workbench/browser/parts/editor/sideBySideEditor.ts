/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebysideeditor';
import { Dimension, $, clearNode } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorControl, IEditorPane, IEditorOpenContext, EditorExtensions } from 'vs/workbench/common/editor';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { scrollbarShadow } from 'vs/platform/theme/common/colorRegistry';
import { IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { SplitView, Sizing, Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { Event, Relay, Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { assertIsDefined } from 'vs/base/common/types';
import { IEditorOptions } from 'vs/platform/editor/common/editor';

export class SideBySideEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.sidebysideEditor';

	private get minimumPrimaryWidth() { return this.primaryEditorPane ? this.primaryEditorPane.minimumWidth : 0; }
	private get maximumPrimaryWidth() { return this.primaryEditorPane ? this.primaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY; }
	private get minimumPrimaryHeight() { return this.primaryEditorPane ? this.primaryEditorPane.minimumHeight : 0; }
	private get maximumPrimaryHeight() { return this.primaryEditorPane ? this.primaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY; }

	private get minimumSecondaryWidth() { return this.secondaryEditorPane ? this.secondaryEditorPane.minimumWidth : 0; }
	private get maximumSecondaryWidth() { return this.secondaryEditorPane ? this.secondaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY; }
	private get minimumSecondaryHeight() { return this.secondaryEditorPane ? this.secondaryEditorPane.minimumHeight : 0; }
	private get maximumSecondaryHeight() { return this.secondaryEditorPane ? this.secondaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY; }

	// these setters need to exist because this extends from EditorPane
	override set minimumWidth(value: number) { /* noop */ }
	override set maximumWidth(value: number) { /* noop */ }
	override set minimumHeight(value: number) { /* noop */ }
	override set maximumHeight(value: number) { /* noop */ }

	override get minimumWidth() { return this.minimumPrimaryWidth + this.minimumSecondaryWidth; }
	override get maximumWidth() { return this.maximumPrimaryWidth + this.maximumSecondaryWidth; }
	override get minimumHeight() { return this.minimumPrimaryHeight + this.minimumSecondaryHeight; }
	override get maximumHeight() { return this.maximumPrimaryHeight + this.maximumSecondaryHeight; }

	protected primaryEditorPane?: EditorPane;
	protected secondaryEditorPane?: EditorPane;

	private primaryEditorContainer: HTMLElement | undefined;
	private secondaryEditorContainer: HTMLElement | undefined;

	private splitview: SplitView | undefined;
	private dimension: Dimension = new Dimension(0, 0);

	private onDidCreateEditors = this._register(new Emitter<{ width: number; height: number; } | undefined>());

	private _onDidChangeSizeConstraints = this._register(new Relay<{ width: number; height: number; } | undefined>());
	override readonly onDidChangeSizeConstraints = Event.any(this.onDidCreateEditors.event, this._onDidChangeSizeConstraints.event);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(SideBySideEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.classList.add('side-by-side-editor');

		const splitview = this.splitview = this._register(new SplitView(parent, { orientation: Orientation.HORIZONTAL }));
		this._register(this.splitview.onDidSashReset(() => splitview.distributeViewSizes()));

		this.secondaryEditorContainer = $('.side-by-side-editor-container.secondary');
		this.splitview.addView({
			element: this.secondaryEditorContainer,
			layout: size => this.secondaryEditorPane?.layout(new Dimension(size, this.dimension.height)),
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, Sizing.Distribute);

		this.primaryEditorContainer = $('.side-by-side-editor-container.primary');
		this.splitview.addView({
			element: this.primaryEditorContainer,
			layout: size => this.primaryEditorPane?.layout(new Dimension(size, this.dimension.height)),
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, Sizing.Distribute);

		this.updateStyles();
	}

	override async setInput(input: SideBySideEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const oldInput = this.input;
		await super.setInput(input, options, context, token);

		return this.updateInput(oldInput, input, options, context, token);
	}

	override setOptions(options: IEditorOptions | undefined): void {
		this.primaryEditorPane?.setOptions(options);
	}

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
		this.primaryEditorPane?.setVisible(visible, group);
		this.secondaryEditorPane?.setVisible(visible, group);

		super.setEditorVisible(visible, group);
	}

	override clearInput(): void {
		this.primaryEditorPane?.clearInput();
		this.secondaryEditorPane?.clearInput();

		this.disposeEditors();

		super.clearInput();
	}

	override focus(): void {
		this.primaryEditorPane?.focus();
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		const splitview = assertIsDefined(this.splitview);
		splitview.layout(dimension.width);
	}

	override getControl(): IEditorControl | undefined {
		return this.primaryEditorPane?.getControl();
	}

	getPrimaryEditorPane(): IEditorPane | undefined {
		return this.primaryEditorPane;
	}

	getSecondaryEditorPane(): IEditorPane | undefined {
		return this.secondaryEditorPane;
	}

	private async updateInput(oldInput: EditorInput | undefined, newInput: SideBySideEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (!oldInput || !newInput.matches(oldInput)) {
			if (oldInput) {
				this.disposeEditors();
			}

			return this.setNewInput(newInput, options, context, token);
		}

		if (!this.secondaryEditorPane || !this.primaryEditorPane) {
			return;
		}

		await Promise.all([
			this.secondaryEditorPane.setInput(newInput.secondary, undefined, context, token),
			this.primaryEditorPane.setInput(newInput.primary, options, context, token)
		]);
	}

	private async setNewInput(newInput: SideBySideEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.secondaryEditorPane = this.doCreateEditor(newInput.secondary, assertIsDefined(this.secondaryEditorContainer));
		this.primaryEditorPane = this.doCreateEditor(newInput.primary, assertIsDefined(this.primaryEditorContainer));

		this.layout(this.dimension);

		this._onDidChangeSizeConstraints.input = Event.any(
			Event.map(this.secondaryEditorPane.onDidChangeSizeConstraints, () => undefined),
			Event.map(this.primaryEditorPane.onDidChangeSizeConstraints, () => undefined)
		);

		this.onDidCreateEditors.fire(undefined);

		await Promise.all([
			this.secondaryEditorPane.setInput(newInput.secondary, undefined, context, token),
			this.primaryEditorPane.setInput(newInput.primary, options, context, token)]
		);
	}

	private doCreateEditor(editorInput: EditorInput, container: HTMLElement): EditorPane {
		const editorPaneDescriptor = Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).getEditorPane(editorInput);
		if (!editorPaneDescriptor) {
			throw new Error('No editor pane descriptor for editor found');
		}

		const editorPane = editorPaneDescriptor.instantiate(this.instantiationService);
		editorPane.create(container);
		editorPane.setVisible(this.isVisible(), this.group);

		return editorPane;
	}

	override updateStyles(): void {
		super.updateStyles();

		if (this.primaryEditorContainer) {
			this.primaryEditorContainer.style.boxShadow = `-6px 0 5px -5px ${this.getColor(scrollbarShadow)}`;
		}
	}

	private disposeEditors(): void {
		this.secondaryEditorPane?.dispose();
		this.secondaryEditorPane = undefined;

		this.primaryEditorPane?.dispose();
		this.primaryEditorPane = undefined;

		if (this.secondaryEditorContainer) {
			clearNode(this.secondaryEditorContainer);
		}

		if (this.primaryEditorContainer) {
			clearNode(this.primaryEditorContainer);
		}
	}

	override dispose(): void {
		this.disposeEditors();

		super.dispose();
	}
}
