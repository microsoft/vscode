/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { browserZoomFactors, browserZoomLabel, browserZoomAccessibilityLabel } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../../../browserView/common/browserView.js';
import { BrowserZoomService, IBrowserZoomService, MATCH_WINDOW_ZOOM_LABEL } from '../../../browserView/common/browserZoomService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_FOCUSED, IBrowserEditorWidgetContribution } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { getZoomLevel, onDidChangeZoomLevel } from '../../../../../base/browser/browser.js';
import { zoomLevelToZoomFactor } from '../../../../../platform/window/common/window.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';

const CONTEXT_BROWSER_CAN_ZOOM_IN = new RawContextKey<boolean>('browserCanZoomIn', true, localize('browser.canZoomIn', "Whether the browser can zoom in further"));
const CONTEXT_BROWSER_CAN_ZOOM_OUT = new RawContextKey<boolean>('browserCanZoomOut', true, localize('browser.canZoomOut', "Whether the browser can zoom out further"));

/**
 * Transient zoom-level indicator that briefly appears inside the URL bar on zoom changes.
 */
class BrowserZoomPill extends Disposable {
	readonly element: HTMLElement;
	private readonly _icon: HTMLElement;
	private readonly _label: HTMLElement;
	private readonly _timeout = this._register(new MutableDisposable());

	constructor() {
		super();
		this.element = $('.browser-zoom-pill');
		// Don't announce this transient element; the zoom level is announced via IAccessibilityService.status()
		this.element.setAttribute('aria-hidden', 'true');
		this._icon = $('span');
		this._label = $('span');
		this.element.appendChild(this._icon);
		this.element.appendChild(this._label);
	}

	/**
	 * Briefly show the zoom level, then auto-hide after 750 ms.
	 */
	show(zoomLabel: string, isAtOrAboveDefault: boolean): void {
		this._icon.className = ThemeIcon.asClassName(isAtOrAboveDefault ? Codicon.zoomIn : Codicon.zoomOut);
		this._label.textContent = zoomLabel;
		this.element.classList.add('visible');
		// Reset auto-hide timer so rapid zoom actions extend the display
		this._timeout.value = disposableTimeout(() => {
			this.element.classList.remove('visible');
		}, 750); // Chrome shows the zoom level for 1.5 seconds, but we show it for less because ours is non-interactive
	}
}

/**
 * Browser editor contribution that manages zoom context keys and the zoom pill indicator.
 */
export class BrowserEditorZoomSupport extends BrowserEditorContribution {
	private readonly _zoomPill: BrowserZoomPill;
	private readonly _canZoomInContext: IContextKey<boolean>;
	private readonly _canZoomOutContext: IContextKey<boolean>;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IBrowserZoomService private readonly browserZoomService: IBrowserZoomService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super(editor);
		this._canZoomInContext = CONTEXT_BROWSER_CAN_ZOOM_IN.bindTo(contextKeyService);
		this._canZoomOutContext = CONTEXT_BROWSER_CAN_ZOOM_OUT.bindTo(contextKeyService);
		this._zoomPill = this._register(new BrowserZoomPill());
	}

	override get urlBarWidgets(): readonly IBrowserEditorWidgetContribution[] {
		return [{ element: this._zoomPill.element, order: 0 }];
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		this._updateZoomContext(model);
		store.add(model.onDidChangeZoom(() => {
			this._updateZoomContext(model);
		}));
	}

	override clear(): void {
		this._canZoomInContext.reset();
		this._canZoomOutContext.reset();
	}

	async zoomIn(): Promise<void> {
		await this.editor.model?.zoomIn();
		this._showZoomPill();
	}

	async zoomOut(): Promise<void> {
		await this.editor.model?.zoomOut();
		this._showZoomPill();
	}

	async resetZoom(): Promise<void> {
		await this.editor.model?.resetZoom();
		this._showZoomPill();
	}

	private _updateZoomContext(model: IBrowserViewModel): void {
		this._canZoomInContext.set(model.canZoomIn);
		this._canZoomOutContext.set(model.canZoomOut);
	}

	private _showZoomPill(): void {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		const defaultIndex = this.browserZoomService.getEffectiveZoomIndex(undefined, false);
		const defaultFactor = browserZoomFactors[defaultIndex];
		const currentFactor = model.zoomFactor;
		const label = browserZoomLabel(currentFactor);
		this._zoomPill.show(label, currentFactor >= defaultFactor);
		// Announce the new zoom level to screen readers (polite, non-interruptive).
		this.accessibilityService.status(browserZoomAccessibilityLabel(currentFactor));
	}
}

// Register the contribution
BrowserEditor.registerContribution(BrowserEditorZoomSupport);

// -- Actions ------------------------------------------------------------

class ZoomInAction extends Action2 {
	static readonly ID = 'workbench.action.browser.zoomIn';

	constructor() {
		super({
			id: ZoomInAction.ID,
			title: localize2('browser.zoomInAction', 'Zoom In'),
			category: BrowserActionCategory,
			icon: Codicon.zoomIn,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Zoom,
				order: 1,
				when: CONTEXT_BROWSER_CAN_ZOOM_IN,
			},
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 75,
				// Same shortcuts as 'workbench.action.zoomIn'
				primary: KeyMod.CtrlCmd | KeyCode.Equal,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Equal, KeyMod.CtrlCmd | KeyCode.NumpadAdd],
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorZoomSupport)?.zoomIn();
		}
	}
}

class ZoomOutAction extends Action2 {
	static readonly ID = 'workbench.action.browser.zoomOut';

	constructor() {
		super({
			id: ZoomOutAction.ID,
			title: localize2('browser.zoomOutAction', 'Zoom Out'),
			category: BrowserActionCategory,
			icon: Codicon.zoomOut,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Zoom,
				order: 2,
				when: CONTEXT_BROWSER_CAN_ZOOM_OUT,
			},
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 75,
				// Same shortcuts as 'workbench.action.zoomOut'
				primary: KeyMod.CtrlCmd | KeyCode.Minus,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, KeyMod.CtrlCmd | KeyCode.NumpadSubtract],
				linux: {
					primary: KeyMod.CtrlCmd | KeyCode.Minus,
					secondary: [KeyMod.CtrlCmd | KeyCode.NumpadSubtract]
				}
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorZoomSupport)?.zoomOut();
		}
	}
}

class ResetZoomAction extends Action2 {
	static readonly ID = 'workbench.action.browser.resetZoom';

	constructor() {
		super({
			id: ResetZoomAction.ID,
			title: localize2('browser.resetZoomAction', 'Reset Zoom'),
			category: BrowserActionCategory,
			icon: Codicon.screenNormal,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Zoom,
				order: 3,
			},
			keybinding: {
				when: CONTEXT_BROWSER_FOCUSED,
				weight: KeybindingWeight.WorkbenchContrib + 75,
				// Same shortcuts as 'workbench.action.zoomReset'
				// (note: both workbench and here use Numpad0 instead of Digit0 to avoid conflicts with keybinding to focus sidebar.)
				primary: KeyMod.CtrlCmd | KeyCode.Numpad0,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			await browserEditor.getContribution(BrowserEditorZoomSupport)?.resetZoom();
		}
	}
}

registerAction2(ZoomInAction);
registerAction2(ZoomOutAction);
registerAction2(ResetZoomAction);

/**
 * Bridges the application's UI zoom level changes into IBrowserZoomService so that
 * views using the 'Match Window' default zoom level stay in sync.
 */
class WindowZoomSynchronizer extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserView.windowZoomSynchronizer';

	constructor(@IBrowserZoomService browserZoomService: IBrowserZoomService) {
		super();
		browserZoomService.notifyWindowZoomChanged(zoomLevelToZoomFactor(getZoomLevel(mainWindow)));
		this._register(onDidChangeZoomLevel(() => {
			browserZoomService.notifyWindowZoomChanged(zoomLevelToZoomFactor(getZoomLevel(mainWindow)));
		}));
	}
}

registerWorkbenchContribution2(WindowZoomSynchronizer.ID, WindowZoomSynchronizer, WorkbenchPhase.BlockRestore);

registerSingleton(IBrowserZoomService, BrowserZoomService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.pageZoom': {
			type: 'string',
			enum: [MATCH_WINDOW_ZOOM_LABEL, ...browserZoomFactors.map(f => `${Math.round(f * 100)}%`)],
			markdownEnumDescriptions: [
				localize(
					{ comment: ['This is the description for a setting enum value.'], key: 'browser.defaultZoomLevel.matchWindow' },
					'Matches the application\'s current UI zoom level.'
				),
				...browserZoomFactors.map(() => ''),
			],
			default: MATCH_WINDOW_ZOOM_LABEL,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.pageZoom' },
				'Default zoom level for all sites in the Integrated Browser.'
			),
			// Zoom can change from machine to machine, so we don't need the workspace-level nor syncing that WINDOW has.
			scope: ConfigurationScope.MACHINE
		}
	}
});
