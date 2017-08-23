/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!vs/workbench/parts/debug/browser/media/debugActionsWidget';
import * as errors from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import * as browser from 'vs/base/browser/browser';
import severity from 'vs/base/common/severity';
import * as builder from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction } from 'vs/base/common/actions';
import { EventType } from 'vs/base/common/events';
import { ActionBar, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugConfiguration, IDebugService, State } from 'vs/workbench/parts/debug/common/debug';
import { AbstractDebugAction, PauseAction, ContinueAction, StepBackAction, ReverseContinueAction, StopAction, DisconnectAction, StepOverAction, StepIntoAction, StepOutAction, RestartAction, FocusProcessAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { FocusProcessActionItem } from 'vs/workbench/parts/debug/browser/debugActionItems';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Themable } from 'vs/workbench/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { registerColor, contrastBorder, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';

const $ = builder.$;
const DEBUG_ACTIONS_WIDGET_POSITION_KEY = 'debug.actionswidgetposition';

export const debugToolBarBackground = registerColor('debugToolBar.background', {
	dark: '#333333',
	light: '#F3F3F3',
	hc: '#000000'
}, localize('debugToolBarBackground', "Debug toolbar background color."));

export class DebugActionsWidget extends Themable implements IWorkbenchContribution {
	private static ID = 'debug.actionsWidget';

	private $el: builder.Builder;
	private dragArea: builder.Builder;
	private actionBar: ActionBar;
	private allActions: AbstractDebugAction[];
	private activeActions: AbstractDebugAction[];

	private isVisible: boolean;
	private isBuilt: boolean;

	constructor(
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.$el = $().div().addClass('debug-actions-widget').style('top', `${partService.getTitleBarOffset()}px`);
		this.dragArea = $().div().addClass('drag-area');
		this.$el.append(this.dragArea);

		const actionBarContainter = $().div().addClass('.action-bar-container');
		this.$el.append(actionBarContainter);

		this.activeActions = [];
		this.actionBar = new ActionBar(actionBarContainter, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action: IAction) => {
				if (action.id === FocusProcessAction.ID) {
					return this.instantiationService.createInstance(FocusProcessActionItem, action);
				}

				return null;
			}
		});

		this.updateStyles();

		this.toUnbind.push(this.actionBar);
		this.registerListeners();

		this.hide();
		this.isBuilt = false;
	}

	private registerListeners(): void {
		this.toUnbind.push(this.debugService.onDidChangeState(state => this.update(state)));
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(() => this.update(this.debugService.state)));
		this.toUnbind.push(this.actionBar.actionRunner.addListener(EventType.RUN, (e: any) => {
			// check for error
			if (e.error && !errors.isPromiseCanceledError(e.error)) {
				this.messageService.show(severity.Error, e.error);
			}

			// log in telemetry
			if (this.telemetryService) {
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'debugActionsWidget' });
			}
		}));
		$(window).on(dom.EventType.RESIZE, () => this.setXCoordinate(), this.toUnbind);

		this.dragArea.on(dom.EventType.MOUSE_UP, (event: MouseEvent) => {
			const mouseClickEvent = new StandardMouseEvent(event);
			if (mouseClickEvent.detail === 2) {
				// double click on debug bar centers it again #8250
				const widgetWidth = this.$el.getHTMLElement().clientWidth;
				this.setXCoordinate(0.5 * window.innerWidth - 0.5 * widgetWidth);
				this.storePosition();
			}
		});

		this.dragArea.on(dom.EventType.MOUSE_DOWN, (event: MouseEvent) => {
			const $window = $(window);
			this.dragArea.addClass('dragged');

			$window.on('mousemove', (e: MouseEvent) => {
				const mouseMoveEvent = new StandardMouseEvent(e);
				// Prevent default to stop editor selecting text #8524
				mouseMoveEvent.preventDefault();
				// Reduce x by width of drag handle to reduce jarring #16604
				this.setXCoordinate(mouseMoveEvent.posx - 14);
			}).once('mouseup', (e: MouseEvent) => {
				this.storePosition();
				this.dragArea.removeClass('dragged');
				$window.off('mousemove');
			});
		});

		this.toUnbind.push(this.partService.onTitleBarVisibilityChange(() => this.positionDebugWidget()));
		this.toUnbind.push(browser.onDidChangeZoomLevel(() => this.positionDebugWidget()));
	}

	private storePosition(): void {
		const position = parseFloat(this.$el.getComputedStyle().left) / window.innerWidth;
		this.storageService.store(DEBUG_ACTIONS_WIDGET_POSITION_KEY, position, StorageScope.WORKSPACE);
		this.telemetryService.publicLog(DEBUG_ACTIONS_WIDGET_POSITION_KEY, { position });
	}

	protected updateStyles(): void {
		super.updateStyles();

		if (this.$el) {
			this.$el.style('background-color', this.getColor(debugToolBarBackground));

			const widgetShadowColor = this.getColor(widgetShadow);
			this.$el.style('box-shadow', widgetShadowColor ? `0 5px 8px ${widgetShadowColor}` : null);

			const contrastBorderColor = this.getColor(contrastBorder);
			this.$el.style('border-style', contrastBorderColor ? 'solid' : null);
			this.$el.style('border-width', contrastBorderColor ? '1px' : null);
			this.$el.style('border-color', contrastBorderColor);
		}
	}

	private positionDebugWidget(): void {
		const titlebarOffset = this.partService.getTitleBarOffset();

		$(this.$el).style('top', `${titlebarOffset}px`);
	}

	private setXCoordinate(x?: number): void {
		if (!this.isVisible) {
			return;
		}
		const widgetWidth = this.$el.getHTMLElement().clientWidth;
		if (x === undefined) {
			const positionPercentage = this.storageService.get(DEBUG_ACTIONS_WIDGET_POSITION_KEY, StorageScope.WORKSPACE);
			x = positionPercentage !== undefined ? parseFloat(positionPercentage) * window.innerWidth : (0.5 * window.innerWidth - 0.5 * widgetWidth);
		}

		x = Math.max(0, Math.min(x, window.innerWidth - widgetWidth)); // do not allow the widget to overflow on the right
		this.$el.style('left', `${x}px`);
	}

	public getId(): string {
		return DebugActionsWidget.ID;
	}

	private update(state: State): void {
		if (state === State.Inactive || this.configurationService.getConfiguration<IDebugConfiguration>('debug').hideActionBar) {
			return this.hide();
		}

		const actions = this.getActions();
		if (!arrays.equals(actions, this.activeActions, (first, second) => first.id === second.id)) {
			this.actionBar.clear();
			this.actionBar.push(actions, { icon: true, label: false });
			this.activeActions = actions;
		}
		this.show();
	}

	private show(): void {
		if (this.isVisible) {
			return;
		}
		if (!this.isBuilt) {
			this.isBuilt = true;
			this.$el.build(builder.withElementById(this.partService.getWorkbenchElementId()).getHTMLElement());
		}

		this.isVisible = true;
		this.$el.show();
		this.setXCoordinate();
	}

	private hide(): void {
		this.isVisible = false;
		this.$el.hide();
	}

	private getActions(): AbstractDebugAction[] {
		if (!this.allActions) {
			this.allActions = [];
			this.allActions.push(this.instantiationService.createInstance(ContinueAction, ContinueAction.ID, ContinueAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(PauseAction, PauseAction.ID, PauseAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(StopAction, StopAction.ID, StopAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(DisconnectAction, DisconnectAction.ID, DisconnectAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(StepOverAction, StepOverAction.ID, StepOverAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(StepIntoAction, StepIntoAction.ID, StepIntoAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(StepOutAction, StepOutAction.ID, StepOutAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(RestartAction, RestartAction.ID, RestartAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(StepBackAction, StepBackAction.ID, StepBackAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(ReverseContinueAction, ReverseContinueAction.ID, ReverseContinueAction.LABEL));
			this.allActions.push(this.instantiationService.createInstance(FocusProcessAction, FocusProcessAction.ID, FocusProcessAction.LABEL));
			this.allActions.forEach(a => {
				this.toUnbind.push(a);
			});
		}

		const state = this.debugService.state;
		const process = this.debugService.getViewModel().focusedProcess;
		const attached = process && process.configuration.request === 'attach' && process.configuration.type && !strings.equalsIgnoreCase(process.configuration.type, 'extensionHost');

		return this.allActions.filter(a => {
			if (a.id === ContinueAction.ID) {
				return state !== State.Running;
			}
			if (a.id === PauseAction.ID) {
				return state === State.Running;
			}
			if (a.id === StepBackAction.ID) {
				return process && process.session.capabilities.supportsStepBack;
			}
			if (a.id === ReverseContinueAction.ID) {
				return process && process.session.capabilities.supportsStepBack;
			}
			if (a.id === DisconnectAction.ID) {
				return attached;
			}
			if (a.id === StopAction.ID) {
				return !attached;
			}
			if (a.id === FocusProcessAction.ID) {
				return this.debugService.getViewModel().isMultiProcessView();
			}

			return true;
		}).sort((first, second) => first.weight - second.weight);
	}

	public dispose(): void {
		super.dispose();

		if (this.$el) {
			this.$el.destroy();
			delete this.$el;
		}
	}
}