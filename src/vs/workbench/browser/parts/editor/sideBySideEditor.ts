/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebysideeditor';
import { localize } from 'vs/nls';
import { Dimension, $, clearNode } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorControl, IEditorPane, IEditorOpenContext, EditorExtensions, SIDE_BY_SIDE_EDITOR_ID, SideBySideEditor as Side } from 'vs/workbench/common/editor';
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
import { SIDE_BY_SIDE_EDITOR_BORDER } from 'vs/workbench/common/theme';

export class SideBySideEditor extends EditorPane {

	static readonly ID: string = SIDE_BY_SIDE_EDITOR_ID;

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

	private primaryEditorPane: EditorPane | undefined = undefined;
	private secondaryEditorPane: EditorPane | undefined = undefined;

	private primaryEditorContainer: HTMLElement | undefined;
	private secondaryEditorContainer: HTMLElement | undefined;

	private splitview: SplitView | undefined;

	private readonly splitviewDisposables = this._register(new DisposableStore());
	private readonly editorDisposables = this._register(new DisposableStore());

	private orientation = this.configurationService.getValue<'vertical' | 'horizontal'>(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING) === 'vertical' ? Orientation.VERTICAL : Orientation.HORIZONTAL;
	private dimension = new Dimension(0, 0);

	private lastFocusedSide: Side.PRIMARY | Side.SECONDARY | undefined = undefined;

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
				this.recreateSplitview();
			}
		}
	}

	private recreateSplitview(): void {
		const container = assertIsDefined(this.getContainer());

		// Clear old (if any)
		let ratio: number | undefined = undefined;
		if (this.splitview) {

			// Keep ratio to restore later but only when
			// the sizes differ significantly enough
			const leftViewSize = this.splitview.getViewSize(0);
			const rightViewSize = this.splitview.getViewSize(1);
			if (Math.abs(leftViewSize - rightViewSize) > 1) {
				const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
				ratio = leftViewSize / totalSize;
			}

			// Remove from container
			container.removeChild(this.splitview.el);
			this.splitviewDisposables.clear();
		}

		// Create new
		this.createSplitView(container, ratio);

		this.layout(this.dimension);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.classList.add('side-by-side-editor');

		// Editor pane containers
		this.secondaryEditorContainer = $('.side-by-side-editor-container.editor-instance');
		this.primaryEditorContainer = $('.side-by-side-editor-container.editor-instance');

		// Split view
		this.createSplitView(parent);
	}

	private createSplitView(parent: HTMLElement, ratio?: number): void {

		// Splitview widget
		this.splitview = this.splitviewDisposables.add(new SplitView(parent, { orientation: this.orientation }));
		this.splitviewDisposables.add(this.splitview.onDidSashReset(() => this.splitview?.distributeViewSizes()));

		// Figure out sizing
		let leftSizing: number | Sizing = Sizing.Distribute;
		let rightSizing: number | Sizing = Sizing.Distribute;
		if (ratio) {
			const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;

			leftSizing = Math.round(totalSize * ratio);
			rightSizing = totalSize - leftSizing;

			// We need to call `layout` for the `ratio` to have any effect
			this.splitview.layout(this.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height);
		}

		// Secondary (left)
		const secondaryEditorContainer = assertIsDefined(this.secondaryEditorContainer);
		this.splitview.addView({
			element: secondaryEditorContainer,
			layout: size => this.layoutPane(this.secondaryEditorPane, size),
			minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, leftSizing);

		// Primary (right)
		const primaryEditorContainer = assertIsDefined(this.primaryEditorContainer);
		this.splitview.addView({
			element: primaryEditorContainer,
			layout: size => this.layoutPane(this.primaryEditorPane, size),
			minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, rightSizing);

		this.updateStyles();
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return localize('sideBySideEditor', "Side by Side Editor");
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

		// Forward to both sides
		this.primaryEditorPane?.setVisible(visible, group);
		this.secondaryEditorPane?.setVisible(visible, group);

		super.setEditorVisible(visible, group);
	}

	override clearInput(): void {

		// Forward to both sides
		this.primaryEditorPane?.clearInput();
		this.secondaryEditorPane?.clearInput();

		// Since we do not keep side editors alive
		// we dispose any editor created for recreation
		this.disposeEditors();

		super.clearInput();
	}

	override focus(): void {
		this.getLastFocusedEditorPane()?.focus();
	}

	private getLastFocusedEditorPane(): EditorPane | undefined {
		if (this.lastFocusedSide === Side.SECONDARY) {
			return this.secondaryEditorPane;
		}

		return this.primaryEditorPane;
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		const splitview = assertIsDefined(this.splitview);
		splitview.layout(this.orientation === Orientation.HORIZONTAL ? dimension.width : dimension.height);
	}

	private layoutPane(pane: EditorPane | undefined, size: number): void {
		pane?.layout(this.orientation === Orientation.HORIZONTAL ? new Dimension(size, this.dimension.height) : new Dimension(this.dimension.width, size));
	}

	override getControl(): IEditorControl | undefined {
		return this.getLastFocusedEditorPane()?.getControl();
	}

	getPrimaryEditorPane(): IEditorPane | undefined {
		return this.primaryEditorPane;
	}

	getSecondaryEditorPane(): IEditorPane | undefined {
		return this.secondaryEditorPane;
	}

	private async updateInput(oldInput: EditorInput | undefined, newInput: SideBySideEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// Create new side by side editors for new input
		if (!oldInput || !newInput.matches(oldInput)) {
			if (oldInput) {
				this.disposeEditors();
			}

			return this.setNewInput(newInput, options, context, token);
		}

		// Otherwise set to existing editor panes if matching
		await Promise.all([
			this.secondaryEditorPane?.setInput(newInput.secondary as EditorInput, undefined, context, token),
			this.primaryEditorPane?.setInput(newInput.primary as EditorInput, options, context, token)
		]);
	}

	private async setNewInput(newInput: SideBySideEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		// Create editors
		this.secondaryEditorPane = this.doCreateEditor(newInput.secondary as EditorInput, assertIsDefined(this.secondaryEditorContainer));
		this.primaryEditorPane = this.doCreateEditor(newInput.primary as EditorInput, assertIsDefined(this.primaryEditorContainer));

		// Layout
		this.layout(this.dimension);

		// Eventing
		this._onDidChangeSizeConstraints.input = Event.any(
			Event.map(this.secondaryEditorPane.onDidChangeSizeConstraints, () => undefined),
			Event.map(this.primaryEditorPane.onDidChangeSizeConstraints, () => undefined)
		);
		this.onDidCreateEditors.fire(undefined);

		// Track focus and signal active control change via event
		this.editorDisposables.add(this.primaryEditorPane.onDidFocus(() => this.onDidFocusChange(Side.PRIMARY)));
		this.editorDisposables.add(this.secondaryEditorPane.onDidFocus(() => this.onDidFocusChange(Side.SECONDARY)));

		// Set input to all
		await Promise.all([
			this.secondaryEditorPane.setInput(newInput.secondary as EditorInput, undefined, context, token),
			this.primaryEditorPane.setInput(newInput.primary as EditorInput, options, context, token)]
		);
	}

	private onDidFocusChange(side: Side.PRIMARY | Side.SECONDARY): void {
		this.lastFocusedSide = side;

		// Signal to outside that our active control changed
		this._onDidChangeControl.fire();
	}

	private doCreateEditor(editorInput: EditorInput, container: HTMLElement): EditorPane {
		const editorPaneDescriptor = Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).getEditorPane(editorInput);
		if (!editorPaneDescriptor) {
			throw new Error('No editor pane descriptor for editor found');
		}

		// Create editor pane and make visible
		const editorPane = editorPaneDescriptor.instantiate(this.instantiationService);
		editorPane.create(container);
		editorPane.setVisible(this.isVisible(), this.group);

		// Track for disposal
		this.editorDisposables.add(editorPane);

		return editorPane;
	}

	override updateStyles(): void {
		super.updateStyles();

		if (this.primaryEditorContainer) {
			if (this.orientation === Orientation.HORIZONTAL) {
				this.primaryEditorContainer.style.borderLeftWidth = '1px';
				this.primaryEditorContainer.style.borderLeftStyle = 'solid';
				this.primaryEditorContainer.style.borderLeftColor = this.getColor(SIDE_BY_SIDE_EDITOR_BORDER)?.toString() ?? '';

				this.primaryEditorContainer.style.borderTopWidth = '0';
			} else {
				this.primaryEditorContainer.style.borderTopWidth = '1px';
				this.primaryEditorContainer.style.borderTopStyle = 'solid';
				this.primaryEditorContainer.style.borderTopColor = this.getColor(SIDE_BY_SIDE_EDITOR_BORDER)?.toString() ?? '';

				this.primaryEditorContainer.style.borderLeftWidth = '0';
			}
		}
	}

	override dispose(): void {
		this.disposeEditors();

		super.dispose();
	}

	private disposeEditors(): void {
		this.editorDisposables.clear();

		this.secondaryEditorPane = undefined;
		this.primaryEditorPane = undefined;

		this.lastFocusedSide = undefined;

		if (this.secondaryEditorContainer) {
			clearNode(this.secondaryEditorContainer);
		}

		if (this.primaryEditorContainer) {
			clearNode(this.primaryEditorContainer);
		}
	}
}
