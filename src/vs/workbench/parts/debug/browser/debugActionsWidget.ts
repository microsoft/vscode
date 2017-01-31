/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!vs/workbench/parts/debug/browser/media/debugActionsWidget';
import * as lifecycle from 'vs/base/common/lifecycle';
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
import * as debug from 'vs/workbench/parts/debug/common/debug';
import { AbstractDebugAction, PauseAction, ContinueAction, StepBackAction, ReverseContinueAction, StopAction, DisconnectAction, StepOverAction, StepIntoAction, StepOutAction, RestartAction, FocusProcessAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { FocusProcessActionItem } from 'vs/workbench/parts/debug/browser/debugActionItems';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import IDebugService = debug.IDebugService;

const $ = builder.$;
const DEBUG_ACTIONS_WIDGET_POSITION_KEY = 'debug.actionswidgetposition';

export class DebugActionsWidget implements IWorkbenchContribution {
	private static ID = 'debug.actionsWidget';

	private $el: builder.Builder;
	private dragArea: builder.Builder;
	private toDispose: lifecycle.IDisposable[];
	private actionBar: ActionBar;
	private allActions: AbstractDebugAction[];
	private activeActions: AbstractDebugAction[];

	private isVisible: boolean;
	private isBuilt: boolean;
	private focusProcessActionItem: FocusProcessActionItem;

	constructor(
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IStorageService private storageService: IStorageService
	) {
		this.$el = $().div().addClass('debug-actions-widget').style('top', `${partService.getTitleBarOffset()}px`);
		this.dragArea = $().div().addClass('drag-area');
		this.$el.append(this.dragArea);

		const actionBarContainter = $().div().addClass('.action-bar-container');
		this.$el.append(actionBarContainter);

		this.toDispose = [];
		this.activeActions = [];
		this.actionBar = new ActionBar(actionBarContainter, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionItemProvider: (action: IAction) => {
				if (action.id === FocusProcessAction.ID) {
					if (!this.focusProcessActionItem) {
						this.focusProcessActionItem = this.instantiationService.createInstance(FocusProcessActionItem, action);
						this.toDispose.push(this.focusProcessActionItem);
					}

					return this.focusProcessActionItem;
				}

				return null;
			}
		});

		this.toDispose.push(this.actionBar);
		this.registerListeners();

		this.hide();
		this.isBuilt = false;
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.onDidChangeState(() => {
			this.update();
		}));
		this.toDispose.push(this.actionBar.actionRunner.addListener2(EventType.RUN, (e: any) => {
			// check for error
			if (e.error && !errors.isPromiseCanceledError(e.error)) {
				this.messageService.show(severity.Error, e.error);
			}

			// log in telemetry
			if (this.telemetryService) {
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'debugActionsWidget' });
			}
		}));
		$(window).on(dom.EventType.RESIZE, () => this.setXCoordinate(), this.toDispose);

		this.dragArea.on(dom.EventType.MOUSE_UP, (event: MouseEvent) => {
			const mouseClickEvent = new StandardMouseEvent(event);
			if (mouseClickEvent.detail === 2) {
				// double click on debug bar centers it again #8250
				this.setXCoordinate(0.5 * window.innerWidth);
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
				const mouseMoveEvent = new StandardMouseEvent(e);
				this.storageService.store(DEBUG_ACTIONS_WIDGET_POSITION_KEY, mouseMoveEvent.posx / window.innerWidth, StorageScope.WORKSPACE);
				this.dragArea.removeClass('dragged');
				$window.off('mousemove');
			});
		});

		this.toDispose.push(this.partService.onTitleBarVisibilityChange(() => this.positionDebugWidget()));
		this.toDispose.push(browser.onDidChangeZoomLevel(() => this.positionDebugWidget()));
	}

	private positionDebugWidget(): void {
		const titlebarOffset = this.partService.getTitleBarOffset();

		$(this.$el).style('top', `${titlebarOffset}px`);
	}

	private setXCoordinate(x?: number): void {
		if (!this.isVisible) {
			return;
		}
		if (x === undefined) {
			x = parseFloat(this.storageService.get(DEBUG_ACTIONS_WIDGET_POSITION_KEY, StorageScope.WORKSPACE, '0.5')) * window.innerWidth;
		}

		const widgetWidth = this.$el.getHTMLElement().clientWidth;
		x = Math.max(0, Math.min(x, window.innerWidth - widgetWidth)); // do not allow the widget to overflow on the right
		this.$el.style('left', `${x}px`);
	}

	public getId(): string {
		return DebugActionsWidget.ID;
	}

	private update(): void {
		const state = this.debugService.state;
		if (state === debug.State.Inactive) {
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
				this.toDispose.push(a);
			});
		}

		const state = this.debugService.state;
		const process = this.debugService.getViewModel().focusedProcess;
		const attached = process && !strings.equalsIgnoreCase(process.session.configuration.type, 'extensionHost') && process.isAttach();

		return this.allActions.filter(a => {
			if (a.id === ContinueAction.ID) {
				return state !== debug.State.Running;
			}
			if (a.id === PauseAction.ID) {
				return state === debug.State.Running;
			}
			if (a.id === StepBackAction.ID) {
				return process && process.session.configuration.capabilities.supportsStepBack;
			}
			if (a.id === ReverseContinueAction.ID) {
				return process && process.session.configuration.capabilities.supportsStepBack;
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
		this.toDispose = lifecycle.dispose(this.toDispose);

		if (this.$el) {
			this.$el.destroy();
			delete this.$el;
		}
	}
}
