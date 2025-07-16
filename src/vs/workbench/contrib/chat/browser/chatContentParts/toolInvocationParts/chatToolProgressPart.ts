/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, IChatProgressMessage } from '../../../common/chatService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatToolProgressSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService
	) {
		super(toolInvocation);

		this.domNode = this.createProgressPart();
		// Add stop button if stopAction is present
		if (this.toolInvocation.renderStopButton) {
			const stopButton = this._register(new Button(this.domNode, {
				ariaLabel: 'Continue on',
				title: 'Continue on',
				supportIcons: true,
			}));
			stopButton.element.tabIndex = 0;
			for (const className of ThemeIcon.asClassNameArray(Codicon.play)) {
				stopButton.element.classList.add(className);
			}
			this._register(dom.addDisposableListener(stopButton.element, dom.EventType.CLICK, (e) => {
				stopButton.element.remove();
				commandService.executeCommand('workbench.action.chat.cancel');
				this.toolInvocation.renderStopButton = undefined;
			}));
			this._register(dom.addDisposableListener(stopButton.element, dom.EventType.KEY_DOWN, (e) => {
				if (e.key !== 'Enter' && e.key !== ' ') {
					stopButton.element.remove();
					commandService.executeCommand('workbench.action.chat.cancel');
					this.toolInvocation.renderStopButton = undefined;
				}
			}));
		}
	}

	private createProgressPart(): HTMLElement {
		if (this.toolInvocation.isComplete && this.toolInvocation.isConfirmed !== false && this.toolInvocation.pastTenseMessage) {
			const part = this.renderProgressContent(this.toolInvocation.pastTenseMessage);
			this._register(part);
			return part.domNode;
		} else {
			const container = document.createElement('div');
			const progressObservable = this.toolInvocation.kind === 'toolInvocation' ? this.toolInvocation.progress : undefined;
			this._register(autorun(reader => {
				const progress = progressObservable?.read(reader);
				const part = reader.store.add(this.renderProgressContent(progress?.message || this.toolInvocation.invocationMessage));
				dom.reset(container, part.domNode);
			}));
			return container;
		}
	}

	private renderProgressContent(content: IMarkdownString | string) {
		if (typeof content === 'string') {
			content = new MarkdownString().appendText(content);
		}

		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content
		};

		const iconOverride = !this.toolInvocation.isConfirmed ?
			Codicon.error :
			this.toolInvocation.isComplete ?
				Codicon.check : undefined;
		return this.instantiationService.createInstance(ChatProgressContentPart, progressMessage, this.renderer, this.context, undefined, true, iconOverride);
	}
}
