/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sidebysideeditor.css';
import { localize } from '../../../../nls.js';
import { Dimension, $, clearNode, multibyteAwareBtoa } from '../../../../base/browser/dom.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IEditorControl, IEditorPane, IEditorOpenContext, EditorExtensions, SIDE_BY_SIDE_EDITOR_ID, SideBySideEditor as Side, IEditorPaneSelection, IEditorPaneWithSelection, IEditorPaneSelectionChangeEvent, isEditorPaneWithSelection, EditorPaneSelectionCompareResult } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorPane } from './editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorPaneRegistry } from '../../editor.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { SplitView, Sizing, Orientation } from '../../../../base/browser/ui/splitview/splitview.js';
import { Event, Relay, Emitter } from '../../../../base/common/event.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from './editor.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { SIDE_BY_SIDE_EDITOR_HORIZONTAL_BORDER, SIDE_BY_SIDE_EDITOR_VERTICAL_BORDER } from '../../../common/theme.js';
import { AbstractEditorWithViewState } from './editorWithViewState.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IBoundarySashes } from '../../../../base/browser/ui/sash/sash.js';

interface ISideBySideEditorViewState {
	primary: object;
	secondary: object;
	focus: Side.PRIMARY | Side.SECONDARY | undefined;
	ratio: number | undefined;
}

function isSideBySideEditorViewState(thing: unknown): thing is ISideBySideEditorViewState {
	const candidate = thing as ISideBySideEditorViewState | undefined;

	return typeof candidate?.primary === 'object' && typeof candidate.secondary === 'object';
}

interface ISideBySideEditorOptions extends IEditorOptions {

	/**
	 * Whether the editor options should apply to
	 * the primary or secondary side.
	 *
	 * If a target side is provided, that side will
	 * also receive keyboard focus unless focus is
	 * to be preserved.
	 */
	target?: Side.PRIMARY | Side.SECONDARY;
}

export class SideBySideEditor extends AbstractEditorWithViewState<ISideBySideEditorViewState> implements IEditorPaneWithSelection {

	static readonly ID: string = SIDE_BY_SIDE_EDITOR_ID;

	static SIDE_BY_SIDE_LAYOUT_SETTING = 'workbench.editor.splitInGroupLayout';

	private static readonly VIEW_STATE_PREFERENCE_KEY = 'sideBySideEditorViewState';

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

	private _boundarySashes: IBoundarySashes | undefined;

	//#endregion

	//#region Events

	private onDidCreateEditors = this._register(new Emitter<{ width: number; height: number } | undefined>());

	private _onDidChangeSizeConstraints = this._register(new Relay<{ width: number; height: number } | undefined>());
	override readonly onDidChangeSizeConstraints = Event.any(this.onDidCreateEditors.event, this._onDidChangeSizeConstraints.event);

	private readonly _onDidChangeSelection = this._register(new Emitter<IEditorPaneSelectionChangeEvent>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

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
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(SideBySideEditor.ID, group, SideBySideEditor.VIEW_STATE_PREFERENCE_KEY, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);

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

		// Clear old (if any) but remember ratio
		const ratio = this.getSplitViewRatio();
		if (this.splitview) {
			this.splitview.el.remove();
			this.splitviewDisposables.clear();
		}

		// Create new
		this.createSplitView(container, ratio);

		this.layout(this.dimension);
	}

	private getSplitViewRatio(): number | undefined {
		let ratio: number | undefined = undefined;

		if (this.splitview) {
			const leftViewSize = this.splitview.getViewSize(0);
			const rightViewSize = this.splitview.getViewSize(1);

			// Only return a ratio when the view size is significantly
			// enough different for left and right view sizes
			if (Math.abs(leftViewSize - rightViewSize) > 1) {
				const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
				ratio = leftViewSize / totalSize;
			}
		}

		return ratio;
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

		if (this.orientation === Orientation.HORIZONTAL) {
			this.splitview.orthogonalEndSash = this._boundarySashes?.bottom;
		} else {
			this.splitview.orthogonalStartSash = this._boundarySashes?.left;
			this.splitview.orthogonalEndSash = this._boundarySashes?.right;
		}

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

	override async setInput(input: SideBySideEditorInput, options: ISideBySideEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const oldInput = this.input;
		await super.setInput(input, options, context, token);

		// Create new side by side editors if either we have not
		// been created before or the input no longer matches.
		if (!oldInput || !input.matches(oldInput)) {
			if (oldInput) {
				this.disposeEditors();
			}

			this.createEditors(input);
		}

		// Restore any previous view state
		const { primary, secondary, viewState } = this.loadViewState(input, options, context);
		this.lastFocusedSide = viewState?.focus;

		if (typeof viewState?.ratio === 'number' && this.splitview) {
			const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;

			this.splitview.resizeView(0, Math.round(totalSize * viewState.ratio));
		} else {
			this.splitview?.distributeViewSizes();
		}

		// Set input to both sides
		await Promise.all([
			this.secondaryEditorPane?.setInput(input.secondary, secondary, context, token),
			this.primaryEditorPane?.setInput(input.primary, primary, context, token)
		]);

		// Update focus if target is provided
		if (typeof options?.target === 'number') {
			this.lastFocusedSide = options.target;
		}
	}

	private loadViewState(input: SideBySideEditorInput, options: ISideBySideEditorOptions | undefined, context: IEditorOpenContext): { primary: IEditorOptions | undefined; secondary: IEditorOptions | undefined; viewState: ISideBySideEditorViewState | undefined } {
		const viewState = isSideBySideEditorViewState(options?.viewState) ? options?.viewState : this.loadEditorViewState(input, context);

		let primaryOptions: IEditorOptions = Object.create(null);
		let secondaryOptions: IEditorOptions | undefined = undefined;

		// Depending on the optional `target` property, we apply
		// the provided options to either the primary or secondary
		// side

		if (options?.target === Side.SECONDARY) {
			secondaryOptions = { ...options };
		} else {
			primaryOptions = { ...options };
		}

		primaryOptions.viewState = viewState?.primary;

		if (viewState?.secondary) {
			if (!secondaryOptions) {
				secondaryOptions = { viewState: viewState.secondary };
			} else {
				secondaryOptions.viewState = viewState?.secondary;
			}
		}

		return { primary: primaryOptions, secondary: secondaryOptions, viewState };
	}

	private createEditors(newInput: SideBySideEditorInput): void {

		// Create editors
		this.secondaryEditorPane = this.doCreateEditor(newInput.secondary, assertIsDefined(this.secondaryEditorContainer));
		this.primaryEditorPane = this.doCreateEditor(newInput.primary, assertIsDefined(this.primaryEditorContainer));

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
	}

	private doCreateEditor(editorInput: EditorInput, container: HTMLElement): EditorPane {
		const editorPaneDescriptor = Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).getEditorPane(editorInput);
		if (!editorPaneDescriptor) {
			throw new Error('No editor pane descriptor for editor found');
		}

		// Create editor pane and make visible
		const editorPane = editorPaneDescriptor.instantiate(this.instantiationService, this.group);
		editorPane.create(container);
		editorPane.setVisible(this.isVisible());

		// Track selections if supported
		if (isEditorPaneWithSelection(editorPane)) {
			this.editorDisposables.add(editorPane.onDidChangeSelection(e => this._onDidChangeSelection.fire(e)));
		}

		// Track for disposal
		this.editorDisposables.add(editorPane);

		return editorPane;
	}

	private onDidFocusChange(side: Side.PRIMARY | Side.SECONDARY): void {
		this.lastFocusedSide = side;

		// Signal to outside that our active control changed
		this._onDidChangeControl.fire();
	}

	getSelection(): IEditorPaneSelection | undefined {
		const lastFocusedEditorPane = this.getLastFocusedEditorPane();
		if (isEditorPaneWithSelection(lastFocusedEditorPane)) {
			const selection = lastFocusedEditorPane.getSelection();
			if (selection) {
				return new SideBySideAwareEditorPaneSelection(selection, lastFocusedEditorPane === this.primaryEditorPane ? Side.PRIMARY : Side.SECONDARY);
			}
		}

		return undefined;
	}

	override setOptions(options: ISideBySideEditorOptions | undefined): void {
		super.setOptions(options);

		// Update focus if target is provided
		if (typeof options?.target === 'number') {
			this.lastFocusedSide = options.target;
		}

		// Apply to focused side
		this.getLastFocusedEditorPane()?.setOptions(options);
	}

	protected override setEditorVisible(visible: boolean): void {

		// Forward to both sides
		this.primaryEditorPane?.setVisible(visible);
		this.secondaryEditorPane?.setVisible(visible);

		super.setEditorVisible(visible);
	}

	override clearInput(): void {
		super.clearInput();

		// Forward to both sides
		this.primaryEditorPane?.clearInput();
		this.secondaryEditorPane?.clearInput();

		// Since we do not keep side editors alive
		// we dispose any editor created for recreation
		this.disposeEditors();
	}

	override focus(): void {
		super.focus();

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

	override setBoundarySashes(sashes: IBoundarySashes) {
		this._boundarySashes = sashes;

		if (this.splitview) {
			this.splitview.orthogonalEndSash = sashes.bottom;
		}
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

	protected tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof SideBySideEditorInput;
	}

	protected computeEditorViewState(resource: URI): ISideBySideEditorViewState | undefined {
		if (!this.input || !isEqual(resource, this.toEditorViewStateResource(this.input))) {
			return; // unexpected state
		}

		const primarViewState = this.primaryEditorPane?.getViewState();
		const secondaryViewState = this.secondaryEditorPane?.getViewState();

		if (!primarViewState || !secondaryViewState) {
			return; // we actually need view states
		}

		return {
			primary: primarViewState,
			secondary: secondaryViewState,
			focus: this.lastFocusedSide,
			ratio: this.getSplitViewRatio()
		};
	}

	protected toEditorViewStateResource(input: EditorInput): URI | undefined {
		let primary: URI | undefined;
		let secondary: URI | undefined;

		if (input instanceof SideBySideEditorInput) {
			primary = input.primary.resource;
			secondary = input.secondary.resource;
		}

		if (!secondary || !primary) {
			return undefined;
		}

		// create a URI that is the Base64 concatenation of original + modified resource
		return URI.from({ scheme: 'sideBySide', path: `${multibyteAwareBtoa(secondary.toString())}${multibyteAwareBtoa(primary.toString())}` });
	}

	override updateStyles(): void {
		super.updateStyles();

		if (this.primaryEditorContainer) {
			if (this.orientation === Orientation.HORIZONTAL) {
				this.primaryEditorContainer.style.borderLeftWidth = '1px';
				this.primaryEditorContainer.style.borderLeftStyle = 'solid';
				this.primaryEditorContainer.style.borderLeftColor = this.getColor(SIDE_BY_SIDE_EDITOR_VERTICAL_BORDER) ?? '';

				this.primaryEditorContainer.style.borderTopWidth = '0';
			} else {
				this.primaryEditorContainer.style.borderTopWidth = '1px';
				this.primaryEditorContainer.style.borderTopStyle = 'solid';
				this.primaryEditorContainer.style.borderTopColor = this.getColor(SIDE_BY_SIDE_EDITOR_HORIZONTAL_BORDER) ?? '';

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

class SideBySideAwareEditorPaneSelection implements IEditorPaneSelection {

	constructor(
		private readonly selection: IEditorPaneSelection,
		private readonly side: Side.PRIMARY | Side.SECONDARY
	) { }

	compare(other: IEditorPaneSelection): EditorPaneSelectionCompareResult {
		if (!(other instanceof SideBySideAwareEditorPaneSelection)) {
			return EditorPaneSelectionCompareResult.DIFFERENT;
		}

		if (this.side !== other.side) {
			return EditorPaneSelectionCompareResult.DIFFERENT;
		}

		return this.selection.compare(other.selection);
	}

	restore(options: IEditorOptions): ISideBySideEditorOptions {
		const sideBySideEditorOptions: ISideBySideEditorOptions = {
			...options,
			target: this.side
		};

		return this.selection.restore(sideBySideEditorOptions);
	}
}
