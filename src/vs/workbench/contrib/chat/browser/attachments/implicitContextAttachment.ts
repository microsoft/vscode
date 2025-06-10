/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind, IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { IChatRequestImplicitVariableEntry } from '../../common/chatModel.js';
import { IChatWidgetService } from '../chat.js';
import { ChatAttachmentModel } from '../chatAttachmentModel.js';

export class ImplicitContextAttachmentWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		private readonly attachment: IChatRequestImplicitVariableEntry,
		private readonly resourceLabels: ResourceLabels,
		private readonly attachmentModel: ChatAttachmentModel,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ILabelService private readonly labelService: ILabelService,
		@IMenuService private readonly menuService: IMenuService,
		@IFileService private readonly fileService: IFileService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this.domNode = dom.$('.chat-attached-context-attachment.show-file-icons.implicit');
		this.render();
	}

	private render() {
		dom.clearNode(this.domNode);
		this.renderDisposables.clear();

		this.domNode.classList.add('disabled');
		const label = this.resourceLabels.create(this.domNode, { supportIcons: true });
		const file = URI.isUri(this.attachment.value) ? this.attachment.value : this.attachment.value!.uri;
		const range = undefined;

		const attachmentTypeName = (this.attachment.isPromptFile === false)
			? file.scheme === Schemas.vscodeNotebookCell ? localize('cell.lowercase', "cell") : localize('file.lowercase', "file")
			: localize('prompt.lowercase', "prompt");

		const fileBasename = basename(file);
		const fileDirname = dirname(file);
		const friendlyName = `${fileBasename} ${fileDirname}`;
		const ariaLabel = localize('chat.fileAttachment', "Attached {0}, {1}", attachmentTypeName, friendlyName);

		const uriLabel = this.labelService.getUriLabel(file, { relative: true });
		const currentFile = localize('openEditor', "Suggested context (current file)");
		const title = `${currentFile}\n${uriLabel}`;

		const icon = this.attachment.isPromptFile
			? ThemeIcon.fromId(Codicon.bookmark.id)
			: undefined;

		label.setFile(file, {
			fileKind: FileKind.FILE,
			hidePath: true,
			range,
			title,
			icon,
		});
		this.domNode.ariaLabel = ariaLabel;
		this.domNode.tabIndex = 0;

		this.renderDisposables.add(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, e => {
			this.convertToRegularAttachment();
		}));

		this.renderDisposables.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				e.preventDefault();
				e.stopPropagation();
				this.convertToRegularAttachment();
			}
		}));

		// Context menu
		const scopedContextKeyService = this.renderDisposables.add(this.contextKeyService.createScoped(this.domNode));

		const resourceContextKey = this.renderDisposables.add(new ResourceContextKey(scopedContextKeyService, this.fileService, this.languageService, this.modelService));
		resourceContextKey.set(file);

		this.renderDisposables.add(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, async domEvent => {
			const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
			dom.EventHelper.stop(domEvent, true);

			this.contextMenuService.showContextMenu({
				contextKeyService: scopedContextKeyService,
				getAnchor: () => event,
				getActions: () => {
					const menu = this.menuService.getMenuActions(MenuId.ChatInputResourceAttachmentContext, scopedContextKeyService, { arg: file });
					return getFlatContextMenuActions(menu);
				},
			});
		}));
	}

	private convertToRegularAttachment(): void {
		if (!this.attachment.value) {
			return;
		}

		const file = URI.isUri(this.attachment.value) ? this.attachment.value : this.attachment.value.uri;
		this.attachmentModel.addFile(file);
		this.chatWidgetService.lastFocusedWidget?.focusInput();
	}
}
