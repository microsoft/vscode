/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { getZoomFactor } from '../../../../../base/browser/browser.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { ISashEvent, Orientation, OrthogonalEdge, Sash, SashState } from '../../../../../base/browser/ui/sash/sash.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IBrowserDeviceProfile } from '../../../../../platform/browserView/common/browserView.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, IContainerLayout, IContainerLayoutOverride } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';

const CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE = new RawContextKey<boolean>(
	'browserEmulationToolbarVisible',
	false,
	localize('browser.emulationToolbarVisible', "Whether the browser emulation toolbar is visible")
);

const CONTEXT_BROWSER_EMULATION_IS_MOBILE = new RawContextKey<boolean>(
	'browserEmulationIsMobile',
	false,
	localize('browser.emulationIsMobile', "Whether the browser emulation is in mobile mode")
);

const CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT = new RawContextKey<boolean>(
	'browserEmulationHasUserAgent',
	false,
	localize('browser.emulationHasUserAgent', "Whether the browser emulation has a custom user agent")
);

/**
 * A named device preset. Applying a preset stamps its `device` (including
 * any embedded viewport width/height) onto the active device profile, while
 * preserving the user's current scale.
 */
export interface IBrowserDevicePreset {
	readonly name: string;
	readonly device?: IBrowserDeviceProfile;
}

/**
 * Keep track of the last used device + scale so we can restore them when the
 * toolbar is reopened. Note this isn't (currently) persisted in storage.
 */
const lastSettings = {
	device: undefined as IBrowserDeviceProfile | undefined,
	scale: undefined as number | undefined,
};

/**
 * Toolbar shown above the browser viewport with device emulation controls
 * (dimensions, DPR, zoom, and an action toolbar for presets / UA / mobile / close).
 */
class BrowserEmulationToolbar extends Disposable {

	readonly element: HTMLElement;
	private readonly _groupWrapper: HTMLElement;

	private readonly _widthInput: InputBox;
	private readonly _heightInput: InputBox;
	private readonly _swapDimensionsAction: Action;
	private readonly _dprInput: InputBox;
	private readonly _zoom: SelectBox;

	private _suppressChange = false;
	private _autoFitScale = 1;

	private static readonly ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];
	private static readonly AUTO_INDEX = 0;

	constructor(
		private readonly _feature: BrowserEditorEmulationSupport,
		actionsContainer: HTMLElement,
		hoverDelegate: IHoverDelegate,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		this.element = $('.browser-emulation-toolbar');
		this.element.style.display = 'none';

		this._groupWrapper = $('.browser-emulation-toolbar-groups');
		this.element.appendChild(this._groupWrapper);

		const dimensions = this._appendGroup('dimensions');
		const dimensionsLabel = $('span.browser-emulation-toolbar-label');
		dimensionsLabel.textContent = localize('browser.device.dimensionsLabel', "Dimensions:");
		dimensions.appendChild(dimensionsLabel);
		this._widthInput = this._createNumberInput(dimensions, contextViewService, localize('browser.device.widthAriaLabel', "Viewport width"), 1, 9999);

		const swapDimensionsLabel = localize('browser.device.swapDimensionsTitle', "Swap Dimensions");
		this._swapDimensionsAction = this._register(new Action(
			'browser.device.swapDimensions',
			swapDimensionsLabel,
			ThemeIcon.asClassName(Codicon.arrowSwap),
			false,
			async () => this._feature.swapDimensions()
		));
		const swapDimensionsBar = this._register(new ActionBar(dimensions, { hoverDelegate }));
		swapDimensionsBar.push(this._swapDimensionsAction, { icon: true, label: false });

		this._heightInput = this._createNumberInput(dimensions, contextViewService, localize('browser.device.heightAriaLabel', "Viewport height"), 1, 9999);

		// DPR override. Blank / 0 = system DPR.
		const dprGroup = this._appendGroup('dpr');
		const dprLabel = $('span.browser-emulation-toolbar-label');
		dprLabel.textContent = localize('browser.device.dprLabel', "DPR:");
		this._register(hoverService.setupManagedHover(hoverDelegate, dprLabel, localize('browser.device.dprTitle', "Device pixel ratio (blank = system default)")));
		dprGroup.appendChild(dprLabel);
		this._dprInput = this._createNumberInput(dprGroup, contextViewService, localize('browser.device.dprAriaLabel', "Device pixel ratio"), 0, 8, 'decimal');

		const zoomGroup = this._appendGroup('zoom');
		const zoomLabel = $('span.browser-emulation-toolbar-label');
		zoomLabel.textContent = localize('browser.device.scaleLabel', "Scale:");
		zoomGroup.appendChild(zoomLabel);
		this._zoom = this._register(new SelectBox(
			this._buildZoomOptions(),
			BrowserEmulationToolbar.AUTO_INDEX,
			contextViewService,
			defaultSelectBoxStyles,
			{ ariaLabel: localize('browser.device.zoomAriaLabel', "Zoom factor") }
		));
		this._zoom.render(zoomGroup);

		this.element.appendChild($('.browser-emulation-toolbar-spacer'));

		this.element.appendChild(actionsContainer);

		this._registerEvents();
	}

	private _registerEvents(): void {
		const commitDims = () => this._onDimensionInput();
		const onEnterDims = (e: KeyboardEvent) => {
			if (e.keyCode === KeyCode.Enter) {
				this._onDimensionInput();
			}
		};
		this._register(addDisposableListener(this._widthInput.inputElement, EventType.CHANGE, commitDims));
		this._register(addDisposableListener(this._heightInput.inputElement, EventType.CHANGE, commitDims));
		this._register(addDisposableListener(this._widthInput.inputElement, EventType.KEY_DOWN, onEnterDims));
		this._register(addDisposableListener(this._heightInput.inputElement, EventType.KEY_DOWN, onEnterDims));

		this._register(addDisposableListener(this._dprInput.inputElement, EventType.CHANGE, () => this._onDprInput()));
		this._register(addDisposableListener(this._dprInput.inputElement, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.keyCode === KeyCode.Enter) {
				this._onDprInput();
			}
		}));

		this._register(this._zoom.onDidSelect(e => {
			const model = this._feature.model;
			if (this._suppressChange || !model?.device) {
				return;
			}
			const scale = e.index === BrowserEmulationToolbar.AUTO_INDEX
				? undefined
				: BrowserEmulationToolbar.ZOOM_PRESETS[e.index - 1];
			if (scale === this._feature.scale) {
				return;
			}
			this._feature.setScale(scale);
		}));
	}

	get isVisible(): boolean {
		return this.element.style.display !== 'none';
	}

	show(): void {
		this.element.style.display = '';
	}

	hide(): void {
		this.element.style.display = 'none';
	}

	setAutoFitScale(scale: number): void {
		if (this._autoFitScale === scale) {
			return;
		}
		const oldPercent = Math.round(this._autoFitScale * 100);
		this._autoFitScale = scale;
		const newPercent = Math.round(scale * 100);
		if (oldPercent !== newPercent) {
			// setOptions rebuilds <select>; keep it rare to avoid focus loss.
			const wasSuppressed = this._suppressChange;
			this._suppressChange = true;
			try {
				this._zoom.setOptions(this._buildZoomOptions(), this._currentZoomIndex());
			} finally {
				this._suppressChange = wasSuppressed;
			}
		}
	}

	refresh(): void {
		this._writeInputs(this._feature.model?.device);
		this._updateZoom();
	}

	private _writeInputs(device: IBrowserDeviceProfile | undefined): void {
		const width = device?.width;
		const height = device?.height;
		this._suppressChange = true;
		try {
			this._widthInput.value = width ? String(width) : '';
			this._heightInput.value = height ? String(height) : '';
			this._dprInput.value = device?.deviceScaleFactor ? String(device.deviceScaleFactor) : '';
		} finally {
			this._suppressChange = false;
		}
		this._swapDimensionsAction.enabled = !!width || !!height;
	}

	private _appendGroup(name: string): HTMLElement {
		const group = $(`.browser-emulation-toolbar-group.browser-emulation-toolbar-${name}`);
		this._groupWrapper.appendChild(group);
		return group;
	}

	private _buildZoomOptions(): { text: string }[] {
		return [
			{ text: localize('browser.device.zoomAuto', "Auto ({0}%)", Math.round(this._autoFitScale * 100)) },
			...BrowserEmulationToolbar.ZOOM_PRESETS.map(z => ({ text: `${Math.round(z * 100)}%` })),
		];
	}

	private _currentZoomIndex(): number {
		const scale = this._feature.scale;
		if (scale === undefined) {
			return BrowserEmulationToolbar.AUTO_INDEX;
		}
		const idx = BrowserEmulationToolbar.ZOOM_PRESETS.findIndex(p => Math.abs(p - scale) < 0.005);
		return idx >= 0 ? idx + 1 : BrowserEmulationToolbar.AUTO_INDEX;
	}

	private _updateZoom(): void {
		const wasSuppressed = this._suppressChange;
		this._suppressChange = true;
		try {
			this._zoom.select(this._currentZoomIndex());
			this._zoom.setEnabled(!!this._feature.model?.device);
		} finally {
			this._suppressChange = wasSuppressed;
		}
	}

	private _onDimensionInput(): void {
		const model = this._feature.model;
		if (this._suppressChange || !model?.device) {
			return;
		}
		const parse = (raw: string): number | undefined => {
			const trimmed = raw.trim();
			if (trimmed === '') {
				return undefined;
			}
			const n = Math.floor(Number(trimmed));
			if (!n || n <= 0) {
				return undefined;
			}
			return Math.max(1, Math.min(9999, n));
		};
		const width = parse(this._widthInput.value);
		const height = parse(this._heightInput.value);
		const device = model.device;
		if (device.width === width && device.height === height) {
			return;
		}
		void model.setDevice({ ...device, width, height });
	}

	private _onDprInput(): void {
		const model = this._feature.model;
		if (this._suppressChange || !model?.device) {
			return;
		}
		const device = model.device;
		const raw = this._dprInput.value.trim();
		const next = raw === '' ? undefined : Math.max(0, Math.min(8, Number(raw) || 0)) || undefined;
		if (device.deviceScaleFactor === next) {
			return;
		}
		void model.setDevice({ ...device, deviceScaleFactor: next });
	}

	private _createNumberInput(parent: HTMLElement, contextViewService: IContextViewService, ariaLabel: string, min: number, max: number, inputMode: 'numeric' | 'decimal' = 'numeric'): InputBox {
		const container = $('.browser-emulation-toolbar-input');
		parent.appendChild(container);
		const input = this._register(new InputBox(container, contextViewService, {
			type: 'number',
			ariaLabel,
			placeholder: localize('browser.device.inputPlaceholderAuto', "auto"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		input.inputElement.min = String(min);
		input.inputElement.max = String(max);
		input.inputElement.inputMode = inputMode;
		if (inputMode === 'decimal') {
			input.inputElement.step = '0.5';
		}
		return input;
	}
}

/**
 * Editor contribution that owns the device toolbar, the renderer-side scale
 * for the emulated viewport, and the resize sashes that drive viewport size
 * interactively (committed onto {@link IBrowserViewModel.device}). Also
 * implements {@link computeContainerLayout} so the editor delegates container
 * sizing to this contribution whenever device emulation is engaged.
 */
export class BrowserEditorEmulationSupport extends BrowserEditorContribution {

	private readonly _toolbar: BrowserEmulationToolbar;
	private readonly _toolbarVisible: IContextKey<boolean>;
	private readonly _isMobile: IContextKey<boolean>;
	private readonly _hasUserAgent: IContextKey<boolean>;

	/** Committed renderer-side scale; undefined = auto-fit. Not persisted in the device model (rides on the layout call). */
	private _scale: number | undefined;
	/** Scale Auto-fit would produce for the current device + pane. Drives the toolbar's "Auto (X%)" label. */
	private _autoFitScale = 1;

	private readonly _onDidChangeScale = this._register(new Emitter<number | undefined>());
	private readonly _onDidChangeAutoFitScale = this._register(new Emitter<number>());

	private _eastSash: Sash | undefined;
	private _southSash: Sash | undefined;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(editor);
		this._toolbarVisible = CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE.bindTo(contextKeyService);
		this._isMobile = CONTEXT_BROWSER_EMULATION_IS_MOBILE.bindTo(contextKeyService);
		this._hasUserAgent = CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT.bindTo(contextKeyService);

		const actionsContainer = $('.browser-emulation-toolbar-actions');
		const hoverDelegate = this._register(instantiationService.createInstance(
			WorkbenchHoverDelegate,
			'element',
			undefined,
			{ position: { hoverPosition: HoverPosition.ABOVE } }
		));
		const actionsToolbar = this._register(instantiationService.createInstance(
			MenuWorkbenchToolBar,
			actionsContainer,
			MenuId.BrowserEmulationToolbar,
			{
				hoverDelegate,
				highlightToggledItems: true,
				toolbarOptions: { primaryGroup: () => true },
				menuOptions: { shouldForwardArgs: true },
			}
		));
		actionsToolbar.context = editor;

		this._toolbar = this._register(instantiationService.createInstance(BrowserEmulationToolbar, this, actionsContainer, hoverDelegate));

		// React to our own scale state: refresh the toolbar, sync context keys, and relayout.
		this._register(this._onDidChangeScale.event(() => {
			this._toolbar.refresh();
			this.editor.layoutBrowserContainer();
		}));
		this._register(this._onDidChangeAutoFitScale.event(scale => this._toolbar.setAutoFitScale(scale)));
	}

	// -- BrowserEditorContribution hooks ------------------------------------

	override get toolbarElements(): readonly HTMLElement[] {
		return [this._toolbar.element];
	}

	override onContainerReady(container: HTMLElement): void {
		this._createResizeSashes(container);

		const observer = new (getWindow(container).ResizeObserver)(() => {
			this._eastSash?.layout();
			this._southSash?.layout();
		});
		observer.observe(container);
		this._register({ dispose: () => observer.disconnect() });
	}

	override getContainerLayoutOverride(): IContainerLayoutOverride | undefined {
		if (!this.editor.model?.device) {
			return undefined;
		}
		return {
			// Reserve space for the east + south resize sashes that sit just outside the container.
			padding: { right: 16, bottom: 16 },
			compute: (w, h) => this._computeLayout(w, h),
		};
	}

	private _computeLayout(paneWidth: number, paneHeight: number): IContainerLayout {
		const device = this.editor.model?.device;
		const width = device?.width;
		const height = device?.height;
		const z = getZoomFactor(this.editor.window);
		const snap = (v: number) => Math.floor(v * z) / z;
		const fitScale = paneWidth > 0 && paneHeight > 0
			? Math.min(width ? paneWidth / width : 1, height ? paneHeight / height : 1, 1)
			: 1;
		if (this._autoFitScale !== fitScale) {
			this._autoFitScale = fitScale;
			this._onDidChangeAutoFitScale.fire(fitScale);
		}
		const scale = this._scale ?? fitScale;
		return {
			width: snap(width ? Math.min(width * scale, paneWidth) : paneWidth),
			height: snap(height ? Math.min(height * scale, paneHeight) : paneHeight),
			emulation: { scale },
		};
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		this._toolbar.refresh();
		this._syncContextKeys(model.device);
		this._updateSashState();
		this._setToolbarVisible(!!model.device);
		store.add(model.onDidChangeDevice(device => {
			this._updateSashState();
			// Turning emulation off discards any in-progress scale override so
			// reopening the toolbar starts clean.
			if (!device && this._scale !== undefined) {
				this.setScale(undefined);
			}
			if (device) {
				lastSettings.device = device;
			}
			this._toolbar.refresh();
			this._syncContextKeys(device);
			this._setToolbarVisible(!!device);
			this.editor.layoutBrowserContainer();
		}));
	}

	override clear(): void {
		// Editor input is being cleared — drop renderer-side state so a freshly
		// reopened input starts without stale viewport overrides.
		this._scale = undefined;
		this._toolbar.refresh();
		this._syncContextKeys(undefined);
		this._setToolbarVisible(false);
	}

	// -- Public API consumed by toolbar + actions --------------------------

	/** Current renderer-side scale; undefined = auto-fit. */
	get scale(): number | undefined { return this._scale; }
	/** Convenience accessor for the toolbar — proxies the editor's model. */
	get model(): IBrowserViewModel | undefined { return this.editor.model; }

	setScale(scale: number | undefined): void {
		if (this._scale === scale) {
			return;
		}
		lastSettings.scale = scale;
		this._scale = scale;
		this._onDidChangeScale.fire(scale);
	}

	get isVisible(): boolean {
		return this._toolbar.isVisible;
	}

	/**
	 * Toggle the toolbar. Entering toolbar mode engages device emulation
	 * (responsive viewport, default device); exiting disables it.
	 */
	setVisible(visible: boolean): void {
		if (visible === this._toolbar.isVisible) {
			return;
		}
		const model = this.editor.model;
		if (visible) {
			if (model && !model.device) {
				void model.setDevice({ ...lastSettings.device });
				this.setScale(lastSettings.scale);
			}
			this._setToolbarVisible(true);
		} else {
			void model?.setDevice(undefined);
			this._setToolbarVisible(false);
		}
	}

	/** Apply a preset onto the current emulation, preserving the current scale. */
	applyPreset(preset: IBrowserDevicePreset): void {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		void model.setDevice(preset.device ?? {});
	}

	/** Reset all device + scale overrides to defaults while keeping emulation engaged. */
	resetAll(): void {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		void model.setDevice({});
		this.setScale(undefined);
	}

	/** Set the user agent on the current device. Empty / undefined = default. Engages emulation if not already active. */
	setUserAgent(userAgent: string | undefined): void {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		const next = userAgent ? userAgent : undefined;
		const device = model.device;
		if (device?.userAgent === next) {
			return;
		}
		void model.setDevice({ ...(device ?? {}), userAgent: next });
	}

	/** The current device's user agent, if any. */
	get userAgent(): string | undefined {
		return this.editor.model?.device?.userAgent;
	}

	/** Swap the current viewport's width and height. No-op without any fixed dim. */
	swapDimensions(): void {
		const model = this.editor.model;
		const device = model?.device;
		if (!model || !device || (!device.width && !device.height)) {
			return;
		}
		void model.setDevice({ ...device, width: device.height, height: device.width });
	}

	/** Flip the mobile flag on the current device (drives touch + pointer media). Engages emulation if not already active. */
	toggleMobile(): void {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		const device = model.device;
		void model.setDevice({ ...(device ?? {}), mobile: !device?.mobile });
	}

	// -- Internal helpers ---------------------------------------------------

	private _syncContextKeys(device: IBrowserDeviceProfile | undefined): void {
		this._isMobile.set(!!device?.mobile);
		this._hasUserAgent.set(!!device?.userAgent);
	}

	private _setToolbarVisible(visible: boolean): void {
		if (visible === this._toolbar.isVisible) {
			return;
		}
		if (visible) {
			this._toolbar.show();
		} else {
			this._toolbar.hide();
		}
		this._toolbarVisible.set(visible);
		this.editor.layoutBrowserContainer();
	}

	private _updateSashState(): void {
		const state = this.editor.model?.device ? SashState.Enabled : SashState.Disabled;
		if (this._eastSash) {
			this._eastSash.state = state;
		}
		if (this._southSash) {
			this._southSash.state = state;
		}
	}

	/**
	 * Create east + south resize sashes (with an auto-managed south-east corner)
	 * that drag the container to set explicit device dimensions. The container is
	 * centered in the wrapper, so a pointer delta of N px equals 2*N px of growth.
	 */
	private _createResizeSashes(container: HTMLElement): void {
		const SASH_OFFSET = 6;
		const eastSash = this._register(new Sash(container, {
			getVerticalSashLeft: () => container.clientWidth + SASH_OFFSET,
			getVerticalSashTop: () => 0,
			getVerticalSashHeight: () => container.clientHeight,
		}, { orientation: Orientation.VERTICAL, orthogonalEdge: OrthogonalEdge.South }));
		const southSash = this._register(new Sash(container, {
			getHorizontalSashTop: () => container.clientHeight + SASH_OFFSET,
			getHorizontalSashLeft: () => 0,
			getHorizontalSashWidth: () => container.clientWidth,
		}, { orientation: Orientation.HORIZONTAL, orthogonalEdge: OrthogonalEdge.East }));
		southSash.orthogonalEndSash = eastSash;
		eastSash.orthogonalEndSash = southSash;
		this._eastSash = eastSash;
		this._southSash = southSash;
		this._updateSashState();

		type DragState = {
			readonly startContainerW: number;
			readonly startContainerH: number;
			readonly scale: number;
			readonly paneW: number;
			readonly paneH: number;
		};
		let drag: DragState | undefined;

		const onStart = () => {
			const model = this.editor.model;
			if (!model || !model.device) {
				return;
			}
			const device = model.device;
			container.classList.add('browser-container--dragging');
			const pane = this.editor.paneSize;
			const containerRect = container.getBoundingClientRect();
			// Mirror computeContainerLayout's fit-scale math to derive starting scale.
			const fitScale = pane.width > 0 && pane.height > 0
				? Math.min(device.width ? pane.width / device.width : 1, device.height ? pane.height / device.height : 1, 1)
				: 1;
			const startScale = this._scale ?? fitScale;
			drag = {
				startContainerW: containerRect.width,
				startContainerH: containerRect.height,
				scale: Math.max(0.01, startScale),
				paneW: pane.width,
				paneH: pane.height,
			};
		};

		const onChange = (axis: 'x' | 'y', evt: ISashEvent) => {
			if (!drag) {
				return;
			}
			const device = this.editor.model?.device ?? {};
			if (axis === 'x') {
				const w = Math.max(50, Math.min(drag.paneW, drag.startContainerW + (evt.currentX - evt.startX) * 2));
				void this.editor.model?.setDevice({ ...device, width: Math.max(50, Math.round(w / drag.scale)) });
			} else {
				const h = Math.max(50, Math.min(drag.paneH, drag.startContainerH + (evt.currentY - evt.startY) * 2));
				void this.editor.model?.setDevice({ ...device, height: Math.max(50, Math.round(h / drag.scale)) });
			}
		};

		const onEnd = () => {
			if (!drag) {
				return;
			}
			container.classList.remove('browser-container--dragging');
			drag = undefined;
		};

		this._register(eastSash.onDidStart(onStart));
		this._register(southSash.onDidStart(onStart));
		this._register(eastSash.onDidChange(evt => onChange('x', evt)));
		this._register(southSash.onDidChange(evt => onChange('y', evt)));
		this._register(eastSash.onDidEnd(onEnd));
		this._register(southSash.onDidEnd(onEnd));
		this._register(eastSash.onDidReset(() => this._resetAxis('x')));
		this._register(southSash.onDidReset(() => this._resetAxis('y')));
	}

	private _resetAxis(axis: 'x' | 'y'): void {
		const model = this.editor.model;
		if (!model?.device) {
			return;
		}
		const device = model.device;
		void model.setDevice(axis === 'x'
			? { ...device, width: undefined }
			: { ...device, height: undefined });
	}
}

BrowserEditor.registerContribution(BrowserEditorEmulationSupport);

/**
 * Show the emulation toolbar (engages device emulation). Mirrors the
 * find-widget pattern: show command on the main action bar / F1, and the
 * toolbar is dismissed via its own close button or the Escape keybinding.
 */
class ShowBrowserEmulationToolbarAction extends Action2 {
	static readonly ID = 'workbench.action.browser.showEmulationToolbar';

	constructor() {
		super({
			id: ShowBrowserEmulationToolbarAction.ID,
			title: localize2('browser.showEmulationToolbar', 'Show Emulation Toolbar'),
			category: BrowserActionCategory,
			icon: Codicon.deviceMobile,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Developer,
				order: 10,
			},
		});
	}

	override run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): void {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserEditorEmulationSupport)?.setVisible(true);
		}
	}
}

/**
 * Hide the emulation toolbar (disables emulation). Available via F1 and bound
 * to Escape while the toolbar is visible; also surfaced as the toolbar's
 * close button.
 */
class HideBrowserEmulationToolbarAction extends Action2 {
	static readonly ID = 'workbench.action.browser.hideEmulationToolbar';

	constructor() {
		super({
			id: HideBrowserEmulationToolbarAction.ID,
			title: localize2('browser.hideEmulationToolbar', 'Hide Emulation Toolbar'),
			category: BrowserActionCategory,
			icon: Codicon.close,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
				when: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE),
			},
		});
	}

	override run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): void {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserEditorEmulationSupport)?.setVisible(false);
		}
	}
}
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
	command: {
		id: HideBrowserEmulationToolbarAction.ID,
		title: localize('browser.emulationToolbar.close', "Close"),
		icon: Codicon.close,
	},
	order: 100,
});

class ToggleBrowserMobileEmulationAction extends Action2 {
	static readonly ID = 'workbench.action.browser.toggleMobileEmulation';

	constructor() {
		super({
			id: ToggleBrowserMobileEmulationAction.ID,
			title: localize2('browser.toggleMobileEmulation', 'Toggle Mobile Emulation'),
			category: BrowserActionCategory,
			icon: Codicon.deviceMobile,
			f1: true,
			toggled: CONTEXT_BROWSER_EMULATION_IS_MOBILE,
			precondition: BROWSER_EDITOR_ACTIVE,
		});
	}

	override run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): void {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserEditorEmulationSupport)?.toggleMobile();
		}
	}
}
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
	command: {
		id: ToggleBrowserMobileEmulationAction.ID,
		title: localize('browser.emulationToolbar.mobile', "Mobile Emulation"),
		icon: Codicon.deviceMobile,
		toggled: CONTEXT_BROWSER_EMULATION_IS_MOBILE,
	},
	order: 20,
});

const DEFAULT_BROWSER_DEVICE_PRESETS: readonly IBrowserDevicePreset[] = [
	{
		name: 'iPhone 15 Pro',
		device: { width: 393, height: 852, mobile: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
	},
	{
		name: 'iPhone SE',
		device: { width: 375, height: 667, mobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
	},
	{
		name: 'Pixel 8',
		device: { width: 412, height: 915, mobile: true, deviceScaleFactor: 2.625, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' },
	},
	{
		name: 'iPad Mini',
		device: { width: 768, height: 1024, mobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
	},
];

class PickBrowserDevicePresetAction extends Action2 {
	static readonly ID = 'workbench.action.browser.pickDevicePreset';

	constructor() {
		super({
			id: PickBrowserDevicePresetAction.ID,
			title: localize2('browser.pickDevicePreset', 'Emulate Device...'),
			category: BrowserActionCategory,
			icon: Codicon.library,
			f1: true,
			precondition: BROWSER_EDITOR_ACTIVE,
		});
	}

	override async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(browserEditor instanceof BrowserEditor)) {
			return;
		}
		const support = browserEditor.getContribution(BrowserEditorEmulationSupport);
		if (!support) {
			return;
		}
		const quickInputService = accessor.get(IQuickInputService);

		type PresetItem = IQuickPickItem & { preset: IBrowserDevicePreset };
		const items: PresetItem[] = DEFAULT_BROWSER_DEVICE_PRESETS.map(p => ({
			label: p.name,
			description: p.device?.width && p.device?.height
				? `${p.device.width}\u00D7${p.device.height}${p.device?.mobile ? ` \u2022 ${localize('browser.devicePresets.mobileTag', "mobile")}` : ''}`
				: undefined,
			preset: p,
		}));

		const picked = await quickInputService.pick(items, {
			placeHolder: localize('browser.devicePresets.placeholder', "Select a device preset"),
			matchOnDescription: true,
		});
		if (picked) {
			support.applyPreset(picked.preset);
		}
	}
}
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
	command: {
		id: PickBrowserDevicePresetAction.ID,
		title: localize('browser.emulationToolbar.presets', "Apply Preset..."),
		icon: Codicon.library,
	},
	order: 5,
});

class SetBrowserUserAgentAction extends Action2 {
	static readonly ID = 'workbench.action.browser.setUserAgent';

	constructor() {
		super({
			id: SetBrowserUserAgentAction.ID,
			title: localize2('browser.setUserAgent', 'Emulate User Agent...'),
			category: BrowserActionCategory,
			icon: Codicon.tag,
			f1: true,
			toggled: CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT,
			precondition: BROWSER_EDITOR_ACTIVE,
		});
	}

	override async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(browserEditor instanceof BrowserEditor)) {
			return;
		}
		const support = browserEditor.getContribution(BrowserEditorEmulationSupport);
		if (!support) {
			return;
		}
		const quickInputService = accessor.get(IQuickInputService);
		const value = await quickInputService.input({
			prompt: localize('browser.userAgent.prompt', "User agent string (leave empty for VS Code default)"),
			value: support.userAgent ?? '',
		});
		if (value === undefined) {
			return;
		}
		support.setUserAgent(value.trim() || undefined);
	}
}
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
	command: {
		id: SetBrowserUserAgentAction.ID,
		title: localize('browser.emulationToolbar.userAgent', "Set User Agent..."),
		icon: Codicon.tag,
		toggled: CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT,
	},
	order: 6,
});

class ResetBrowserEmulationAction extends Action2 {
	static readonly ID = 'workbench.action.browser.resetEmulation';

	constructor() {
		super({
			id: ResetBrowserEmulationAction.ID,
			title: localize2('browser.resetEmulation', 'Reset Emulation'),
			category: BrowserActionCategory,
			icon: Codicon.discard,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE),
		});
	}

	override run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): void {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserEditorEmulationSupport)?.resetAll();
		}
	}
}
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
	command: {
		id: ResetBrowserEmulationAction.ID,
		title: localize('browser.emulationToolbar.reset', "Reset"),
		icon: Codicon.discard,
	},
	order: 90,
});

registerAction2(ShowBrowserEmulationToolbarAction);
registerAction2(HideBrowserEmulationToolbarAction);
registerAction2(PickBrowserDevicePresetAction);
registerAction2(SetBrowserUserAgentAction);
registerAction2(ToggleBrowserMobileEmulationAction);
registerAction2(ResetBrowserEmulationAction);
