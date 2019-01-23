/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debugToolbar';
import * as errors from 'vs/base/common/errors';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction, IRunEvent } from 'vs/base/common/actions';
import { ActionBar, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugConfiguration, IDebugService, State } from 'vs/workbench/parts/debug/common/debug';
import { AbstractDebugAction, PauseAction, ContinueAction, StepBackAction, ReverseContinueAction, StopAction, DisconnectAction, StepOverAction, StepIntoAction, StepOutAction, RestartAction, FocusSessionAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { FocusSessionActionItem } from 'vs/workbench/parts/debug/browser/debugActionItems';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Themable } from 'vs/workbench/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { registerColor, contrastBorder, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isExtensionHostDebugging } from 'vs/workbench/parts/debug/common/debugUtils';

const DEBUG_TOOLBAR_POSITION_KEY = 'debug.actionswidgetposition';
const DEBUG_TOOLBAR_Y_KEY = 'debug.actionswidgety';

export const debugToolBarBackground = registerColor('debugToolBar.background', {
	dark: '#333333',
	light: '#F3F3F3',
	hc: '#000000'
}, localize('debugToolBarBackground', "Debug toolbar background color."));
export const debugToolBarBorder = registerColor('debugToolBar.border', {
	dark: null,
	light: null,
	hc: null
}, localize('debugToolBarBorder', "Debug toolbar border color."));

export class DebugToolbar extends Themable implements IWorkbenchContribution {

	private $el: HTMLElement;
	private dragArea: HTMLElement;
	private actionBar: ActionBar;
	private allActions: AbstractDebugAction[] = [];
	private activeActions: AbstractDebugAction[];
	private updateScheduler: RunOnceScheduler;

	private isVisible: boolean;
	private isBuilt: boolean;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IDebugService private readonly debugService: IDebugService,
		@IPartService private readonly partService: IPartService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(themeService);

		this.$el = dom.$('div.debug-toolbar');
		this.$el.style.top = `${partService.getTitleBarOffset()}px`;

		this.dragArea = dom.append(this.$el, dom.$('div.drag-area'));

		const actionBarContainer = dom.append(this.$el, dom.$('div.action-bar-container'));

		this.activeActions = [];
		this.actionBar = this._register(new ActionBar(actionBarContainer, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action: IAction) => {
				if (action.id === FocusSessionAction.ID) {
					return new FocusSessionActionItem(action, this.debugService, this.themeService, contextViewService);
				}

				return null;
			}
		}));

		this.updateScheduler = this._register(new RunOnceScheduler(() => {
			const state = this.debugService.state;
			const toolBarLocation = this.configurationService.getValue<IDebugConfiguration>('debug').toolBarLocation;
			if (state === State.Inactive || toolBarLocation === 'docked' || toolBarLocation === 'hidden') {
				return this.hide();
			}

			const actions = DebugToolbar.getActions(this.allActions, this.toDispose, this.debugService, this.keybindingService, this.instantiationService);
			if (!arrays.equals(actions, this.activeActions, (first, second) => first.id === second.id)) {
				this.actionBar.clear();
				this.actionBar.push(actions, { icon: true, label: false });
				this.activeActions = actions;
			}
			this.show();
		}, 20));

		this.updateStyles();

		this.registerListeners();

		this.hide();
		this.isBuilt = false;
	}

	private registerListeners(): void {
		this._register(this.debugService.onDidChangeState(() => this.updateScheduler.schedule()));
		this._register(this.debugService.getViewModel().onDidFocusSession(() => this.updateScheduler.schedule()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidConfigurationChange(e)));
		this._register(this.actionBar.actionRunner.onDidRun((e: IRunEvent) => {
			// check for error
			if (e.error && !errors.isPromiseCanceledError(e.error)) {
				this.notificationService.error(e.error);
			}

			// log in telemetry
			if (this.telemetryService) {
				/* __GDPR__
					"workbenchActionExecuted" : {
						"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'debugActionsWidget' });
			}
		}));
		this._register(dom.addDisposableListener(window, dom.EventType.RESIZE, () => this.setCoordinates()));

		this._register(dom.addDisposableListener(this.dragArea, dom.EventType.MOUSE_UP, (event: MouseEvent) => {
			const mouseClickEvent = new StandardMouseEvent(event);
			if (mouseClickEvent.detail === 2) {
				// double click on debug bar centers it again #8250
				const widgetWidth = this.$el.clientWidth;
				this.setCoordinates(0.5 * window.innerWidth - 0.5 * widgetWidth, 0);
				this.storePosition();
			}
		}));

		this._register(dom.addDisposableListener(this.dragArea, dom.EventType.MOUSE_DOWN, (event: MouseEvent) => {
			dom.addClass(this.dragArea, 'dragged');

			const mouseMoveListener = dom.addDisposableListener(window, 'mousemove', (e: MouseEvent) => {
				const mouseMoveEvent = new StandardMouseEvent(e);
				// Prevent default to stop editor selecting text #8524
				mouseMoveEvent.preventDefault();
				// Reduce x by width of drag handle to reduce jarring #16604
				this.setCoordinates(mouseMoveEvent.posx - 14, mouseMoveEvent.posy - this.partService.getTitleBarOffset());
			});

			const mouseUpListener = dom.addDisposableListener(window, 'mouseup', (e: MouseEvent) => {
				this.storePosition();
				dom.removeClass(this.dragArea, 'dragged');

				mouseMoveListener.dispose();
				mouseUpListener.dispose();
			});
		}));

		this._register(this.partService.onTitleBarVisibilityChange(() => this.setYCoordinate()));
		this._register(browser.onDidChangeZoomLevel(() => this.setYCoordinate()));
	}

	private storePosition(): void {
		const position = parseFloat(dom.getComputedStyle(this.$el).left) / window.innerWidth;
		this.storageService.store(DEBUG_TOOLBAR_POSITION_KEY, position, StorageScope.GLOBAL);
	}

	protected updateStyles(): void {
		super.updateStyles();

		if (this.$el) {
			this.$el.style.backgroundColor = this.getColor(debugToolBarBackground);

			const widgetShadowColor = this.getColor(widgetShadow);
			this.$el.style.boxShadow = widgetShadowColor ? `0 5px 8px ${widgetShadowColor}` : null;

			const contrastBorderColor = this.getColor(contrastBorder);
			const borderColor = this.getColor(debugToolBarBorder);

			if (contrastBorderColor) {
				this.$el.style.border = `1px solid ${contrastBorderColor}`;
			} else {
				this.$el.style.border = borderColor ? `solid ${borderColor}` : 'none';
				this.$el.style.border = '1px 0';
			}
		}
	}

	private setYCoordinate(y = 0): void {
		const titlebarOffset = this.partService.getTitleBarOffset();
		this.$el.style.top = `${titlebarOffset + y}px`;
	}

	private setCoordinates(x?: number, y?: number): void {
		if (!this.isVisible) {
			return;
		}
		const widgetWidth = this.$el.clientWidth;
		if (x === undefined) {
			const positionPercentage = this.storageService.get(DEBUG_TOOLBAR_POSITION_KEY, StorageScope.GLOBAL);
			x = positionPercentage !== undefined ? parseFloat(positionPercentage) * window.innerWidth : (0.5 * window.innerWidth - 0.5 * widgetWidth);
		}

		x = Math.max(0, Math.min(x, window.innerWidth - widgetWidth)); // do not allow the widget to overflow on the right
		this.$el.style.left = `${x}px`;

		if (y === undefined) {
			y = this.storageService.getInteger(DEBUG_TOOLBAR_Y_KEY, StorageScope.GLOBAL, 0);
		}
		const titleAreaHeight = 35;
		if ((y < titleAreaHeight / 2) || (y > titleAreaHeight + titleAreaHeight / 2)) {
			const moveToTop = y < titleAreaHeight;
			this.setYCoordinate(moveToTop ? 0 : titleAreaHeight);
			this.storageService.store(DEBUG_TOOLBAR_Y_KEY, moveToTop ? 0 : 2 * titleAreaHeight, StorageScope.GLOBAL);
		}
	}

	private onDidConfigurationChange(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration('debug.hideActionBar') || event.affectsConfiguration('debug.toolBarLocation')) {
			this.updateScheduler.schedule();
		}
	}

	private show(): void {
		if (this.isVisible) {
			this.setCoordinates();
			return;
		}
		if (!this.isBuilt) {
			this.isBuilt = true;
			this.partService.getWorkbenchElement().appendChild(this.$el);
		}

		this.isVisible = true;
		dom.show(this.$el);
		this.setCoordinates();
	}

	private hide(): void {
		this.isVisible = false;
		dom.hide(this.$el);
	}

	public static getActions(allActions: AbstractDebugAction[], toDispose: IDisposable[], debugService: IDebugService, keybindingService: IKeybindingService, instantiationService: IInstantiationService): AbstractDebugAction[] {
		if (allActions.length === 0) {
			allActions.push(new ContinueAction(ContinueAction.ID, ContinueAction.LABEL, debugService, keybindingService));
			allActions.push(new PauseAction(PauseAction.ID, PauseAction.LABEL, debugService, keybindingService));
			allActions.push(new StopAction(StopAction.ID, StopAction.LABEL, debugService, keybindingService));
			allActions.push(new DisconnectAction(DisconnectAction.ID, DisconnectAction.LABEL, debugService, keybindingService));
			allActions.push(new StepOverAction(StepOverAction.ID, StepOverAction.LABEL, debugService, keybindingService));
			allActions.push(new StepIntoAction(StepIntoAction.ID, StepIntoAction.LABEL, debugService, keybindingService));
			allActions.push(new StepOutAction(StepOutAction.ID, StepOutAction.LABEL, debugService, keybindingService));
			allActions.push(instantiationService.createInstance(RestartAction, RestartAction.ID, RestartAction.LABEL));
			allActions.push(new StepBackAction(StepBackAction.ID, StepBackAction.LABEL, debugService, keybindingService));
			allActions.push(new ReverseContinueAction(ReverseContinueAction.ID, ReverseContinueAction.LABEL, debugService, keybindingService));
			allActions.push(instantiationService.createInstance(FocusSessionAction, FocusSessionAction.ID, FocusSessionAction.LABEL));
			allActions.forEach(a => toDispose.push(a));
		}

		const state = debugService.state;
		const session = debugService.getViewModel().focusedSession;
		const attached = session && session.configuration.request === 'attach' && !isExtensionHostDebugging(session.configuration);

		return allActions.filter(a => {
			if (a.id === ContinueAction.ID) {
				return state !== State.Running;
			}
			if (a.id === PauseAction.ID) {
				return state === State.Running;
			}
			if (a.id === StepBackAction.ID) {
				return session && session.capabilities.supportsStepBack;
			}
			if (a.id === ReverseContinueAction.ID) {
				return session && session.capabilities.supportsStepBack;
			}
			if (a.id === DisconnectAction.ID) {
				return attached;
			}
			if (a.id === StopAction.ID) {
				return !attached;
			}
			if (a.id === FocusSessionAction.ID) {
				return debugService.getViewModel().isMultiSessionView();
			}

			return true;
		}).sort((first, second) => first.weight - second.weight);
	}

	public dispose(): void {
		super.dispose();

		if (this.$el) {
			this.$el.remove();
			delete this.$el;
		}
	}
}
