/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Relay } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SIDE_BAR_BACKGROUND } from '../../../../common/theme.js';
import { DetachedProcessInfo } from '../../../terminal/browser/detachedTerminal.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../../../terminal/common/terminalColorRegistry.js';
import { IChatProgressMessage, IChatToolInvocation, IChatToolInvocationSerialized } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { ChatConfirmationWidget } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';

export class ChatToolInvocationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-tool-invocation-part');

		// This part is a bit different, since IChatToolInvocation is not an immutable model object. So this part is able to rerender itself.
		// If this turns out to be a typical pattern, we could come up with a more reusable pattern, like telling the list to rerender an element
		// when the model changes, or trying to make the model immutable and swap out one content part for a new one based on user actions in the view.
		const partStore = this._register(new DisposableStore());
		const render = () => {
			dom.clearNode(this.domNode);

			const subPart = partStore.add(instantiationService.createInstance(ChatToolInvocationSubPart, toolInvocation, context, renderer));
			this.domNode.appendChild(subPart.domNode);
			partStore.add(subPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			partStore.add(subPart.onNeedsRerender(() => {
				render();
				this._onDidChangeHeight.fire();
			}));
		};
		render();
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class ChatToolInvocationSubPart extends Disposable {
	public readonly domNode: HTMLElement;

	private _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	private _onDidChangeHeight = this._register(new Relay<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
		@ITerminalService terminalService: ITerminalService,
	) {
		super();

		if (toolInvocation.kind === 'toolInvocation' && toolInvocation.confirmationMessages) {
			const title = toolInvocation.confirmationMessages.title;
			const message = toolInvocation.confirmationMessages.message;
			const confirmWidget = this._register(instantiationService.createInstance(
				ChatConfirmationWidget,
				title,
				message,
				[{ label: localize('continue', 'Continue'), data: true }, { label: localize('cancel', 'Cancel'), data: false, isSecondary: true }]));
			this.domNode = confirmWidget.domNode;
			this._register(confirmWidget.onDidClick(button => {
				toolInvocation.confirmed.complete(button.data);
			}));
			this._onDidChangeHeight.input = confirmWidget.onDidChangeHeight;
			toolInvocation.confirmed.p.then(() => {
				this._onNeedsRerender.fire();
			});
		} else {
			let content: IMarkdownString;
			if (toolInvocation.isComplete && toolInvocation.isConfirmed !== false && toolInvocation.pastTenseMessage) {
				content = typeof toolInvocation.pastTenseMessage === 'string' ?
					new MarkdownString().appendText(toolInvocation.pastTenseMessage) :
					toolInvocation.pastTenseMessage;
			} else {
				content = typeof toolInvocation.invocationMessage === 'string' ?
					new MarkdownString().appendText(toolInvocation.invocationMessage + '…') :
					new MarkdownString(toolInvocation.invocationMessage.value + '…');
			}

			if (content.value === 'Running&nbsp;command&nbsp;in&nbsp;terminal…') {
				const element = document.createElement('div');
				this.domNode = element;
				terminalService.createDetachedTerminal({
					cols: 80,
					rows: 16,
					colorProvider: {
						getBackgroundColor(theme) {
							return theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(SIDE_BAR_BACKGROUND);
						},
					},
					processInfo: new DetachedProcessInfo({})
				}).then(terminal => {
					this._register(terminal);
					terminal.attachToElement(element);
					const win = dom.getActiveWindow();
					const events = [
						{ id: 7, event: '\u001b]0;npm\u0007', time: 48.550 },
						{ id: 7, event: '\u001b]0;npm install\u0007', time: 48.653 },
						{ id: 7, event: '⠙\u001b[K', time: 49.340 },
						{ id: 7, event: '\r', time: 49.410 },
						{ id: 7, event: '⠹\u001b[K', time: 49.423 },
						{ id: 7, event: '\r', time: 49.493 },
						{ id: 7, event: '⠸\u001b[K', time: 49.499 },
						{ id: 7, event: '\r', time: 49.670 },
						{ id: 7, event: '⠼\u001b[K', time: 49.689 },
						{ id: 7, event: '\r', time: 49.896 },
						{ id: 7, event: '⠴\u001b[K', time: 49.902 },
						{ id: 7, event: '\r', time: 50.000 },
						{ id: 7, event: '⠦\u001b[K', time: 50.006 },
						{ id: 7, event: '\r', time: 50.204 },
						{ id: 7, event: '⠧\u001b[K', time: 50.213 },
						{ id: 7, event: '\r', time: 50.304 },
						{ id: 7, event: '⠇\u001b[K', time: 50.312 },
						{ id: 7, event: '\r', time: 50.549 },
						{ id: 7, event: '⠏\u001b[K', time: 50.556 },
						{ id: 7, event: '\r\u001b[K', time: 50.681 },
						{ id: 7, event: '⠋', time: 50.687 },
						{ id: 7, event: '\r', time: 50.759 },
						{ id: 7, event: '⠙\u001b[K', time: 50.774 },
						{ id: 7, event: '\r', time: 50.850 },
						{ id: 7, event: '⠹\u001b[K', time: 50.861 },
						{ id: 7, event: '\r', time: 50.917 },
						{ id: 7, event: '⠸\u001b[K', time: 50.932 },
						{ id: 7, event: '\r', time: 51.007 },
						{ id: 7, event: '⠼\u001b[K', time: 51.022 },
						{ id: 7, event: '\r', time: 51.090 },
						{ id: 7, event: '⠴\u001b[K', time: 51.098 },
						{ id: 7, event: '\r', time: 51.155 },
						{ id: 7, event: '⠦\u001b[K', time: 51.174 },
						{ id: 7, event: '\r', time: 51.249 },
						{ id: 7, event: '⠧\u001b[K', time: 51.259 },
						{ id: 7, event: '\r', time: 51.328 },
						{ id: 7, event: '⠇\u001b[K', time: 51.337 },
						{ id: 7, event: '\r', time: 51.396 },
						{ id: 7, event: '⠏\u001b[K', time: 51.410 },
						{ id: 7, event: '\r', time: 51.482 },
						{ id: 7, event: '⠋\u001b[K', time: 51.493 },
						{ id: 7, event: '\r', time: 51.556 },
						{ id: 7, event: '⠙\u001b[K', time: 51.578 },
						{ id: 7, event: '\r', time: 51.640 },
						{ id: 7, event: '⠹\u001b[K', time: 51.645 },
						{ id: 7, event: '\r', time: 51.716 },
						{ id: 7, event: '⠸\u001b[K', time: 51.731 },
						{ id: 7, event: '\r', time: 51.796 },
						{ id: 7, event: '⠼\u001b[K', time: 51.816 },
						{ id: 7, event: '\r', time: 51.878 },
						{ id: 7, event: '⠴\u001b[K', time: 51.886 },
						{ id: 7, event: '\r', time: 51.970 },
						{ id: 7, event: '⠦\u001b[K', time: 51.976 },
						{ id: 7, event: '\r', time: 52.042 },
						{ id: 7, event: '⠧\u001b[K', time: 52.048 },
						{ id: 7, event: '\r', time: 52.118 },
						{ id: 7, event: '⠇\u001b[K', time: 52.124 },
						{ id: 7, event: '\r', time: 52.202 },
						{ id: 7, event: '⠏\u001b[K', time: 52.209 },
						{ id: 7, event: '\r', time: 52.280 },
						{ id: 7, event: '⠋\u001b[K', time: 52.292 },
						{ id: 7, event: '\r', time: 52.365 },
						{ id: 7, event: '⠙\u001b[K', time: 52.373 },
						{ id: 7, event: '\r', time: 52.436 },
						{ id: 7, event: '⠹\u001b[K', time: 52.460 },
						{ id: 7, event: '\r', time: 52.522 },
						{ id: 7, event: '⠸\u001b[K', time: 52.535 },
						{ id: 7, event: '\r', time: 52.598 },
						{ id: 7, event: '⠼\u001b[K', time: 52.604 },
						{ id: 7, event: '\r', time: 52.677 },
						{ id: 7, event: '⠴\u001b[K', time: 52.708 },
						{ id: 7, event: '\r', time: 52.762 },
						{ id: 7, event: '⠦\u001b[K', time: 52.771 },
						{ id: 7, event: '\r', time: 52.843 },
						{ id: 7, event: '⠧\u001b[K', time: 52.850 },
						{ id: 7, event: '\r', time: 52.920 },
						{ id: 7, event: '⠇\u001b[K', time: 52.930 },
						{ id: 7, event: '\r', time: 53.000 },
						{ id: 7, event: '⠏\u001b[K', time: 53.007 },
						{ id: 7, event: '\r', time: 53.083 },
						{ id: 7, event: '⠋\u001b[K', time: 53.099 },
						{ id: 7, event: '\r', time: 53.161 },
						{ id: 7, event: '⠙\u001b[K', time: 53.176 },
						{ id: 7, event: '\r', time: 53.242 },
						{ id: 7, event: '⠹\u001b[K', time: 53.250 },
						{ id: 7, event: '\r', time: 53.319 },
						{ id: 7, event: '⠸\u001b[K', time: 53.324 },
						{ id: 7, event: '\r', time: 53.396 },
						{ id: 7, event: '⠼\u001b[K', time: 53.427 },
						{ id: 7, event: '\r', time: 53.479 },
						{ id: 7, event: '⠴\u001b[K', time: 53.485 },
						{ id: 7, event: '\r', time: 53.556 },
						{ id: 7, event: '⠦\u001b[K', time: 53.570 },
						{ id: 7, event: '\r', time: 53.640 },
						{ id: 7, event: '⠧\u001b[K', time: 53.653 },
						{ id: 7, event: '\r', time: 53.723 },
						{ id: 7, event: '⠇\u001b[K', time: 53.734 },
						{ id: 7, event: '\r', time: 53.804 },
						{ id: 7, event: '⠏\u001b[K', time: 53.809 },
						{ id: 7, event: '\r', time: 53.882 },
						{ id: 7, event: '⠋\u001b[K', time: 53.902 },
						{ id: 7, event: '\r', time: 53.964 },
						{ id: 7, event: '⠙\u001b[K', time: 53.972 },
						{ id: 7, event: '\r', time: 54.044 },
						{ id: 7, event: '⠹\u001b[K', time: 54.050 },
						{ id: 7, event: '\r', time: 54.133 },
						{ id: 7, event: '⠸\u001b[K', time: 54.139 },
						{ id: 7, event: '\r', time: 54.202 },
						{ id: 7, event: '⠼\u001b[K', time: 54.216 },
						{ id: 7, event: '\r', time: 54.284 },
						{ id: 7, event: '⠴\u001b[K', time: 54.293 },
						{ id: 7, event: '\r', time: 54.362 },
						{ id: 7, event: '⠦\u001b[K', time: 54.376 },
						{ id: 7, event: '\r', time: 54.446 },
						{ id: 7, event: '⠧\u001b[K', time: 54.466 },
						{ id: 7, event: '\r', time: 54.528 },
						{ id: 7, event: '⠇\u001b[K', time: 54.550 },
						{ id: 7, event: '\r', time: 54.612 },
						{ id: 7, event: '⠏\u001b[K', time: 54.624 },
						{ id: 7, event: '\r', time: 54.694 },
						{ id: 7, event: '⠋\u001b[K', time: 54.706 },
						{ id: 7, event: '\r', time: 54.800 },
						{ id: 7, event: '⠙\u001b[K', time: 54.806 },
						{ id: 7, event: '\r', time: 54.884 },
						{ id: 7, event: '⠹\u001b[K', time: 54.901 },
						{ id: 7, event: '\r', time: 54.959 },
						{ id: 7, event: '⠸\u001b[K', time: 54.976 },
						{ id: 7, event: '\r', time: 55.037 },
						{ id: 7, event: '⠼\u001b[K', time: 55.056 },
						{ id: 7, event: '\r', time: 55.119 },
						{ id: 7, event: '⠴\u001b[K', time: 55.126 },
						{ id: 7, event: '\r', time: 55.202 },
						{ id: 7, event: '⠦\u001b[K', time: 55.214 },
						{ id: 7, event: '\r', time: 55.301 },
						{ id: 7, event: '⠧\u001b[K', time: 55.306 },
						{ id: 7, event: '\r', time: 55.390 },
						{ id: 7, event: '⠇\u001b[K', time: 55.406 },
						{ id: 7, event: '\r⠏\u001b[K', time: 55.468 },
						{ id: 7, event: '\r', time: 55.538 },
						{ id: 7, event: '⠋\u001b[K', time: 55.556 },
						{ id: 7, event: '\r', time: 55.619 },
						{ id: 7, event: '⠙\u001b[K', time: 55.627 },
						{ id: 7, event: '\r', time: 55.705 },
						{ id: 7, event: '⠹\u001b[K', time: 55.720 },
						{ id: 7, event: '\r', time: 55.841 },
						{ id: 7, event: '\u001b[K\r\nchanged 45 packages, and audited 676 packages in 7s\r\n⠸\u001b[K', time: 55.855 },
						{ id: 7, event: '\u001b[?25l\r\u001b[K\u001b[31m\u001b[1m\r\n7\u001b[m vulnerabilities (3 \u001b[1mlow\u001b[22m, 2 \u001b[33m\u001b[1mmoderate\u001b[m, 2 \u001b[31m\u001b[1mhigh\u001b[m)\u001b[7;1HTo address all issues, run:\r\n  npm audit fix\u001b[10;1HRun `npm audit` for details.\r\n\u001b[K\u001b[?25h', time: 55.869 },
						{ id: 7, event: '\u001b]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.5.0.0_x64__8wekyb3d8bbwe\\pwsh.exe\u0007', time: 55.885 },
					];

					async function fireEvent(i: number) {
						terminal.xterm.write(events[i].event);
						if (i === events.length - 1) {
							return;
						}
						win.setTimeout(() => {
							fireEvent(i + 1);
						}, (events[i + 1].time - events[i].time) * 1000);
					}
					fireEvent(0);
				});
				return;
			}

			const progressMessage: IChatProgressMessage = {
				kind: 'progressMessage',
				content
			};
			const iconOverride = toolInvocation.isConfirmed === false ?
				Codicon.error :
				toolInvocation.isComplete ?
					Codicon.check : undefined;
			const progressPart = this._register(instantiationService.createInstance(ChatProgressContentPart, progressMessage, renderer, context, undefined, true, iconOverride));
			if (toolInvocation.tooltip) {
				this._register(hoverService.setupDelayedHover(progressPart.domNode, { content: toolInvocation.tooltip, additionalClasses: ['chat-tool-hover'] }));
			}

			this.domNode = progressPart.domNode;
		}

		if (toolInvocation.kind === 'toolInvocation' && !toolInvocation.isComplete) {
			toolInvocation.isCompletePromise.then(() => this._onNeedsRerender.fire());
		}
	}
}
