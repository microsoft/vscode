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
import { IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { SplitView, Sizing, Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { Event, Relay, Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { assertIsDefined } from 'vs/base/common/types';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { EDITOR_GROUP_BORDER } from 'vs/workbench/common/theme';

export class SideBySideEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.sidebysideEditor';

	static SIDE_BY_SIDE_LAYOUT_SETTING = 'workbench.editor.splitInGroupLayout';

	//#region Layout Constraints

	private get minimumPrimaryWidth() { return this.primaryEditorPane ? this.primaryEditorPane.minimumWidth : 0; }
	private get maximumPrimaryWidth() { return this.primaryEditorPane ? this.primaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY; }
	private get minimumPrimaryHeight() { return this.primaryEditorPane ? this.primaryEditorPane.minimumHeight : 0; }
	private get maximumPrimaryHeight() { return this.primaryEditorPane ? this.primaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY; }

	private get minimumSecondaryWidth() { return this.secondaryEditorPane ? this.secondaryEditorPane.minimumWidth : 0; }
	private get maximumSecondaryWidth() { return this.secondaryEditorPane ? this.secondaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY; }
	private get minimumSecondaryHeight() { return this.secondaryEditorPane ? this.secondaryEditorPane.minimumHeight : 0; }
	private get maximumSecondaryHeight() { return this.secondaryEditorPane ? this.secondaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY; }

	override set minimumWidth(value: number) { /* noop */ }
	override set maximumWidth(value: number) { /* noop */ }
	override set minimumHeight(value: number) { /* noop */ }
	override set maximumHeight(value: number) { /* noop */ }

	override get minimumWidth() { return this.minimumPrimaryWidth + this.minimumSecondaryWidth; }
	override get maximumWidth() { return this.maximumPrimaryWidth + this.maximumSecondaryWidth; }
	override get minimumHeight() { return this.minimumPrimaryHeight + this.minimumSecondaryHeight; }
	override get maximumHeight() { return this.maximumPrimaryHeight + this.maximumSecondaryHeight; }

	//#endregion

	//#region Events

	private onDidCreateEditors = this._register(new Emitter<{ width: number; height: number; } | undefined>());

	private _onDidChangeSizeConstraints = this._register(new Relay<{ width: number; height: number; } | undefined>());
	override readonly onDidChangeSizeConstraints = Event.any(this.onDidCreateEditors.event, this._onDidChangeSizeConstraints.event);

	//#endregion

	protected primaryEditorPane: EditorPane | undefined = undefined;
	protected secondaryEditorPane: EditorPane | undefined = undefined;

	private primaryEditorContainer: HTMLElement | undefined;
	private secondaryEditorContainer: HTMLElement | undefined;

	private splitview: SplitView | undefined;
	private splitviewDisposables = this._register(new DisposableStore());

	private orientation = this.configurationService.getValue<'vertical' | 'horizontal'>(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING) === 'vertical' ? Orientation.VERTICAL : Orientation.HORIZONTAL;

	private dimension: Dimension = new Dimension(0, 0);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(SideBySideEditor.ID, telemetryService, themeService, storageService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
	}

	private onConfigurationUpdated(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING)) {
			this.orientation = this.configurationService.getValue<'vertical' | 'horizontal'>(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING) === 'vertical' ? Orientation.VERTICAL : Orientation.HORIZONTAL;

			// If config updated from event, re-create the split
			// editor using the new layout orientation if it was
			// already created.
			if (this.splitview) {
				this.recreateEditor();
			}
		}
	}

	private recreateEditor(): void {
		const container = assertIsDefined(this.getContainer());

		// Clear old (if any)
		if (this.splitview) {
			container.removeChild(this.splitview.el);
			this.splitviewDisposables.clear();
		}

		// Create new
		this.createSplitView(container);

		this.layout(this.dimension);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.classList.add('side-by-side-editor');

		// Editor pane containers
		this.secondaryEditorContainer = $('.side-by-side-editor-container');
		this.primaryEditorContainer = $('.side-by-side-editor-container');

		// Split view
		this.createSplitView(parent);
	}

	private createSplitView(parent: HTMLElement): void {

		// Splitview widget
		this.splitview = this.splitviewDisposables.add(new SplitView(parent, { orientation: this.orientation }));
		this.splitviewDisposables.add(this.splitview.onDidSashReset(() => this.splitview?.distributeViewSizes()));

		// Secondary (left)
		const secondaryEditorContainer = assertIsDefined(this.secondaryEditorContainer);
		this.splitview.addView({
			element: secondaryEditorContainer,
			layout: size => this.layoutPane(this.secondaryEditorPane, size),
			minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, Sizing.Distribute);

		// Primary (right)
		const primaryEditorContainer = assertIsDefined(this.primaryEditorContainer);
		this.splitview.addView({
			element: primaryEditorContainer,
			layout: size => this.layoutPane(this.primaryEditorPane, size),
			minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
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
		splitview.layout(this.orientation === Orientation.HORIZONTAL ? dimension.width : dimension.height);
	}

	private layoutPane(pane: EditorPane | undefined, size: number): void {
		if (this.orientation === Orientation.HORIZONTAL) {
			pane?.layout(new Dimension(size, this.dimension.height));
		} else {
			pane?.layout(new Dimension(this.dimension.width, size));
		}
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
			this.secondaryEditorPane.setInput(newInput.secondary as EditorInput, undefined, context, token),
			this.primaryEditorPane.setInput(newInput.primary as EditorInput, options, context, token)
		]);
	}

	private async setNewInput(newInput: SideBySideEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.secondaryEditorPane = this.doCreateEditor(newInput.secondary as EditorInput, assertIsDefined(this.secondaryEditorContainer));
		this.primaryEditorPane = this.doCreateEditor(newInput.primary as EditorInput, assertIsDefined(this.primaryEditorContainer));

		this.layout(this.dimension);

		this._onDidChangeSizeConstraints.input = Event.any(
			Event.map(this.secondaryEditorPane.onDidChangeSizeConstraints, () => undefined),
			Event.map(this.primaryEditorPane.onDidChangeSizeConstraints, () => undefined)
		);

		this.onDidCreateEditors.fire(undefined);

		await Promise.all([
			this.secondaryEditorPane.setInput(newInput.secondary as EditorInput, undefined, context, token),
			this.primaryEditorPane.setInput(newInput.primary as EditorInput, options, context, token)]
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
			if (this.orientation === Orientation.HORIZONTAL) {
				this.primaryEditorContainer.style.borderLeftWidth = '1px';
				this.primaryEditorContainer.style.borderLeftStyle = 'solid';
				this.primaryEditorContainer.style.borderLeftColor = this.getColor(EDITOR_GROUP_BORDER)?.toString() ?? '';

				this.primaryEditorContainer.style.borderTopWidth = '0';
			} else {
				this.primaryEditorContainer.style.borderTopWidth = '1px';
				this.primaryEditorContainer.style.borderTopStyle = 'solid';
				this.primaryEditorContainer.style.borderTopColor = this.getColor(EDITOR_GROUP_BORDER)?.toString() ?? '';

				this.primaryEditorContainer.style.borderLeftWidth = '0';
			}
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
