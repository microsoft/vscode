/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, IActionItem } from 'vs/base/common/actions';
import lifecycle = require('vs/base/common/lifecycle');
import dom = require('vs/base/browser/dom');
import actions = require('vs/base/common/actions');
import splitview = require('vs/base/browser/ui/splitview/splitview');
import { IViewletView } from 'vs/workbench/browser/viewlet';
import debug = require('vs/workbench/parts/debug/common/debug');
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

const $ = dom.emmet;

export class InformationView extends splitview.CollapsibleView implements IViewletView {

	private static MEMENTO = 'informationview.memento';
	private bodyContainer: HTMLElement;
	private toDispose: lifecycle.IDisposable[];
	private customEventListener: lifecycle.IDisposable;

	// the view's model:
	private debugSession: debug.IRawDebugSession;
	private debugState: debug.State;
	private stackFrame: debug.IStackFrame;
	private currentFile: string;
	private currentLine: number;
	private sessionDuration: number;

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@ITelemetryService private telemetryService: ITelemetryService,
		@debug.IDebugService private debugService: debug.IDebugService
	) {
		super({
			minimumSize: 2 * 22,
			initialState: !!settings[InformationView.MEMENTO] ? splitview.CollapsibleState.COLLAPSED : splitview.CollapsibleState.EXPANDED,
			ariaHeaderLabel: nls.localize('information', "Information")
		});
		this.toDispose = [];

		// the following 'wireing' should probably go into a separate lifcycle hook.
		this.debugState = this.debugService.state;

		const viewModel = this.debugService.getViewModel();
		this.toDispose.push(viewModel.onDidFocusStackFrame(() => this.onFocusedStackFrameUpdated()));

		this.toDispose.push(this.debugService.onDidChangeState(state => this.onDebugStateChange(state)));
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = dom.append(container, $('div.title'));
		const titleSpan = dom.append(titleDiv, $('span.label'));
		titleSpan.textContent = nls.localize('information', "Information");
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'mock-information');
		this.bodyContainer = container;
		this.renderContent();
	}

	/**
	 * remember the selected stackframe's name in the view model
	 */
	private onFocusedStackFrameUpdated(): void {
		this.stackFrame = this.debugService.getViewModel().getFocusedStackFrame();
		this.renderContent();
	}

	private onDebugStateChange(state: debug.State): void {

		const session = this.debugService.getActiveSession();
		this.debugState = state;
		if (this.debugState === debug.State.Stopped) {

			// we need an easier way to track lifetime of a session
			if (!this.debugSession && session) {
				// new session
				this.debugSession = session;
				this.sessionDuration = 0;
				// listen for our custom event
				this.customEventListener = session.addListener2('heartbeatEvent', (event: DebugProtocol.Event) => this.onCustomEvent(event) );
			}

			if (session) {
				this.stackFrame = this.debugService.getViewModel().getFocusedStackFrame();
				session.custom('infoRequest', {}).then(response => {
					this.currentFile = response.body.currentFile;
					this.currentLine = response.body.currentLine;
					this.renderContent();
				});
			}
		} else {

			// we need an easier way to track lifetime of a session
			if (this.debugSession && !session) {
				// session gone
				this.debugSession = undefined;
				// deregister for our custom event
				this.customEventListener.dispose();
			}

			this.stackFrame = undefined;
			this.currentFile = undefined;
			this.currentLine = undefined;
			this.sessionDuration = undefined;
			this.renderContent();
		}
	}

	/**
	 * Custom 'heartbeat' event is used to update a duration counter.
	 */
	private onCustomEvent(event: DebugProtocol.Event): void {
		this.sessionDuration++;
		this.renderContent();
	}

	private renderContent(): void {

		let content = `state: ${debug.State[this.debugState]}`;
		if (this.stackFrame) {
			content += `<br>frame: ${this.stackFrame.name}`;
		}
		if (this.currentFile) {
			content += `<br>file: ${this.currentFile}<br>line: ${this.currentLine}`;
		}
		if (this.sessionDuration) {
			content += `<br>duration: ${this.sessionDuration}`;
		}
		this.bodyContainer.innerHTML = content;
	}

	public shutdown(): void {
		this.settings[InformationView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public setVisible(visible: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public focusBody(): void {
		super.focus();
	}

	protected layoutBody(size: number): void {
	}
}
