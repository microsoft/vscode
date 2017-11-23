/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import * as builder from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, State } from 'vs/workbench/parts/debug/common/debug';
import { Thread, StackFrame, ThreadAndProcessIds } from 'vs/workbench/parts/debug/common/debugModel';
import * as viewer from 'vs/workbench/parts/debug/electron-browser/debugViewer';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IListService } from 'vs/platform/list/browser/listService';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';

function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = document.createElement('div');
	dom.addClass(treeContainer, 'debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

const $ = builder.$;
const twistiePixels = 20;

export class CallStackView extends ViewsViewletPanel {

	private static readonly MEMENTO = 'callstackview.memento';
	private pauseMessage: builder.Builder;
	private pauseMessageLabel: builder.Builder;
	private onCallStackChangeScheduler: RunOnceScheduler;
	private settings: any;

	constructor(
		private options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IListService private listService: IListService,
		@IThemeService private themeService: IThemeService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('callstackSection', "Call Stack Section") }, keybindingService, contextMenuService);
		this.settings = options.viewletSettings;

		// Create scheduler to prevent unnecessary flashing of tree when reacting to changes
		this.onCallStackChangeScheduler = new RunOnceScheduler(() => {
			let newTreeInput: any = this.debugService.getModel();
			const processes = this.debugService.getModel().getProcesses();
			if (!this.debugService.getViewModel().isMultiProcessView() && processes.length) {
				const threads = processes[0].getAllThreads();
				// Only show the threads in the call stack if there is more than 1 thread.
				newTreeInput = threads.length === 1 ? threads[0] : processes[0];
			}

			// Only show the global pause message if we do not display threads.
			// Otherwise there will be a pause message per thread and there is no need for a global one.
			if (newTreeInput instanceof Thread && newTreeInput.stoppedDetails) {
				this.pauseMessageLabel.text(newTreeInput.stoppedDetails.description || nls.localize('debugStopped', "Paused on {0}", newTreeInput.stoppedDetails.reason));
				if (newTreeInput.stoppedDetails.text) {
					this.pauseMessageLabel.title(newTreeInput.stoppedDetails.text);
				}
				newTreeInput.stoppedDetails.reason === 'exception' ? this.pauseMessageLabel.addClass('exception') : this.pauseMessageLabel.removeClass('exception');
				this.pauseMessage.show();
			} else {
				this.pauseMessage.hide();
			}

			(this.tree.getInput() === newTreeInput ? this.tree.refresh() : this.tree.setInput(newTreeInput))
				.done(() => this.updateTreeSelection(), errors.onUnexpectedError);
		}, 50);
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		const title = $('.title.debug-call-stack-title').appendTo(container);
		$('span').text(this.options.name).appendTo(title);
		this.pauseMessage = $('span.pause-message').appendTo(title);
		this.pauseMessage.hide();
		this.pauseMessageLabel = $('span.label').appendTo(this.pauseMessage);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-call-stack');
		this.treeContainer = renderViewTree(container);
		const actionProvider = this.instantiationService.createInstance(viewer.CallStackActionProvider);
		const controller = this.instantiationService.createInstance(viewer.CallStackController, actionProvider, MenuId.DebugCallStackContext);

		this.tree = new Tree(this.treeContainer, {
			dataSource: this.instantiationService.createInstance(viewer.CallStackDataSource),
			renderer: this.instantiationService.createInstance(viewer.CallStackRenderer),
			accessibilityProvider: this.instantiationService.createInstance(viewer.CallstackAccessibilityProvider),
			controller
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'callStackAriaLabel' }, "Debug Call Stack"),
				twistiePixels,
				keyboardSupport: false
			});

		this.disposables.push(attachListStyler(this.tree, this.themeService));
		this.disposables.push(this.listService.register(this.tree));

		this.disposables.push(this.tree.onDidChangeSelection(event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				const element = this.tree.getFocus();
				if (element instanceof ThreadAndProcessIds) {
					controller.showMoreStackFrames(this.tree, element);
				} else if (element instanceof StackFrame) {
					controller.focusStackFrame(element, event, false);
				}
			}
		}));

		this.disposables.push(this.debugService.getModel().onDidChangeCallStack(() => {
			if (!this.onCallStackChangeScheduler.isScheduled()) {
				this.onCallStackChangeScheduler.schedule();
			}
		}));
		this.disposables.push(this.debugService.getViewModel().onDidFocusStackFrame(() =>
			this.updateTreeSelection().done(undefined, errors.onUnexpectedError)));

		// Schedule the update of the call stack tree if the viewlet is opened after a session started #14684
		if (this.debugService.state === State.Stopped) {
			this.onCallStackChangeScheduler.schedule();
		}
	}

	private updateTreeSelection(): TPromise<void> {
		if (!this.tree.getInput()) {
			// Tree not initialized yet
			return TPromise.as(null);
		}

		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		const thread = this.debugService.getViewModel().focusedThread;
		const process = this.debugService.getViewModel().focusedProcess;
		if (!thread) {
			if (!process) {
				this.tree.clearSelection();
				return TPromise.as(null);
			}

			this.tree.setSelection([process]);
			return this.tree.reveal(process);
		}

		return this.tree.expandAll([thread.process, thread]).then(() => {
			if (!stackFrame) {
				return TPromise.as(null);
			}

			this.tree.setSelection([stackFrame]);
			return this.tree.reveal(stackFrame);
		});
	}

	public shutdown(): void {
		this.settings[CallStackView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}

