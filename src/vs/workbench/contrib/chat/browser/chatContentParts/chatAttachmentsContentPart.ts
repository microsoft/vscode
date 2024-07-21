/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IChatRequestVariableEntry } from 'vs/workbench/contrib/chat/common/chatModel';
import { Emitter } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { URI } from 'vs/base/common/uri';
import { FileKind } from 'vs/platform/files/common/files';
import { Range } from 'vs/editor/common/core/range';
import { basename, dirname } from 'vs/base/common/path';
import { localize } from 'vs/nls';
import { ChatResponseReferencePartStatusKind, IChatContentReference } from 'vs/workbench/contrib/chat/common/chatService';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export class ChatAttachmentsContentPart extends Disposable {
	private readonly attachedContextDisposables = this._register(new DisposableStore());

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	private readonly _contextResourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event });

	constructor(
		private readonly variables: IChatRequestVariableEntry[],
		private readonly contentReferences: ReadonlyArray<IChatContentReference> = [],
		public readonly domNode: HTMLElement = dom.$('.chat-attached-context'),
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();

		this.initAttachedContext(domNode);
	}

	private initAttachedContext(container: HTMLElement) {
		dom.clearNode(container);
		this.attachedContextDisposables.clear();
		dom.setVisibility(Boolean(this.variables.length), this.domNode);

		this.variables.forEach((attachment) => {
			const widget = dom.append(container, dom.$('.chat-attached-context-attachment.show-file-icons'));
			const label = this._contextResourceLabels.create(widget, { supportIcons: true });
			const file = URI.isUri(attachment.value) ? attachment.value : attachment.value && typeof attachment.value === 'object' && 'uri' in attachment.value && URI.isUri(attachment.value.uri) ? attachment.value.uri : undefined;
			const range = attachment.value && typeof attachment.value === 'object' && 'range' in attachment.value && Range.isIRange(attachment.value.range) ? attachment.value.range : undefined;

			const correspondingContentReference = this.contentReferences.find((ref) => 'variableName' in ref.reference && ref.reference.variableName === attachment.name);

			if (file) {
				const fileBasename = basename(file.path);
				const fileDirname = dirname(file.path);
				const friendlyName = `${fileBasename} ${fileDirname}`;
				const ariaLabel = range ? localize('chat.fileAttachmentWithRange2', "Attached file, {0}, line {1} to line {2}.", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment2', "Attached file, {0}.", friendlyName);

				label.setFile(file, {
					fileKind: FileKind.FILE,
					hidePath: true,
					range,
					title: correspondingContentReference?.options?.status?.description
				});
				widget.ariaLabel = ariaLabel;
				widget.tabIndex = 0;
				widget.style.cursor = 'pointer';

				this.attachedContextDisposables.add(dom.addDisposableListener(widget, dom.EventType.CLICK, async (e: MouseEvent) => {
					dom.EventHelper.stop(e, true);
					if (file) {
						this.openerService.open(
							file,
							{
								fromUserGesture: true,
								editorOptions: {
									selection: range
								} as any
							});
					}
				}));
			} else {
				const attachmentLabel = attachment.fullName ?? attachment.name;
				label.setLabel(attachmentLabel, correspondingContentReference?.options?.status?.description);

				widget.ariaLabel = localize('chat.attachment2', "Attached context, {0}.", attachment.name);
				widget.tabIndex = 0;
			}

			const isAttachmentPartialOrOmitted = correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted || correspondingContentReference?.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial;
			if (isAttachmentPartialOrOmitted) {
				widget.classList.add('warning');
			}
			const description = correspondingContentReference?.options?.status?.description;
			if (isAttachmentPartialOrOmitted) {
				widget.ariaLabel = `${widget.ariaLabel}${description ? ` ${description}` : ''}`;
				for (const selector of ['.monaco-icon-suffix-container', '.monaco-icon-name-container']) {
					const element = label.element.querySelector(selector);
					if (element) {
						element.classList.add('warning');
					}
				}
			}
		});
	}
}

