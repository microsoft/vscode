/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressMessage, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService.js';
import { AccessibilityWorkbenchSettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatToolProgressSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	public override readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: IMarkdownRenderer,
		private readonly announcedToolProgressKeys: Set<string> | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(toolInvocation);

		this.domNode = this.createProgressPart();
	}

	private createProgressPart(): HTMLElement {
		if (IChatToolInvocation.isComplete(this.toolInvocation) && this.toolIsConfirmed && this.toolInvocation.pastTenseMessage) {
			const key = this.getAnnouncementKey('complete');
			const completionContent = this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage;
			const shouldAnnounce = this.toolInvocation.kind === 'toolInvocation' && this.hasMeaningfulContent(completionContent) ? this.computeShouldAnnounce(key) : false;
			const part = this.renderProgressContent(completionContent, shouldAnnounce);
			this._register(part);
			return part.domNode;
		} else {
			const container = document.createElement('div');
			const progressObservable = this.toolInvocation.kind === 'toolInvocation' ? this.toolInvocation.state.map((s, r) => s.type === IChatToolInvocation.StateKind.Executing ? s.progress.read(r) : undefined) : undefined;
			this._register(autorun(reader => {
				const progress = progressObservable?.read(reader);
				const key = this.getAnnouncementKey('progress');
				const progressContent = progress?.message ?? this.toolInvocation.invocationMessage;
				const shouldAnnounce = this.toolInvocation.kind === 'toolInvocation' && this.hasMeaningfulContent(progressContent) ? this.computeShouldAnnounce(key) : false;
				const part = reader.store.add(this.renderProgressContent(progressContent, shouldAnnounce));
				dom.reset(container, part.domNode);
			}));
			return container;
		}
	}

	private get toolIsConfirmed() {
		const c = IChatToolInvocation.executionConfirmedOrDenied(this.toolInvocation);
		return !!c && c.type !== ToolConfirmKind.Denied;
	}

	private renderProgressContent(content: IMarkdownString | string, shouldAnnounce: boolean) {
		if (typeof content === 'string') {
			content = new MarkdownString().appendText(content);
		}

		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content
		};

		if (shouldAnnounce) {
			this.provideScreenReaderStatus(content);
		}

		return this.instantiationService.createInstance(ChatProgressContentPart, progressMessage, this.renderer, this.context, undefined, true, this.getIcon(), this.toolInvocation);
	}

	private getAnnouncementKey(kind: 'progress' | 'complete'): string {
		return `${kind}:${this.toolInvocation.toolCallId}`;
	}

	private computeShouldAnnounce(key: string): boolean {
		if (!this.announcedToolProgressKeys) {
			return false;
		}
		if (!this.configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
			return false;
		}
		if (this.announcedToolProgressKeys.has(key)) {
			return false;
		}
		this.announcedToolProgressKeys.add(key);
		return true;
	}

	private provideScreenReaderStatus(content: IMarkdownString | string): void {
		const message = typeof content === 'string' ? content : content.value;
		status(message);
	}

	private hasMeaningfulContent(content: IMarkdownString | string | undefined): boolean {
		if (!content) {
			return false;
		}

		const text = typeof content === 'string' ? content : content.value;
		return text.trim().length > 0;
	}
}
