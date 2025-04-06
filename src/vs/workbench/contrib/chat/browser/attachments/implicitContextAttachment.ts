/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind, IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { IChatRequestImplicitVariableEntry } from '../../common/chatModel.js';

export class ImplicitContextAttachmentWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		private readonly attachment: IChatRequestImplicitVariableEntry,
		private readonly resourceLabels: ResourceLabels,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@IMenuService private readonly menuService: IMenuService,
		@IFileService private readonly fileService: IFileService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();

		this.domNode = dom.$('.chat-attached-context-attachment.show-file-icons.implicit');
		this.render();
	}

	private render() {
		dom.clearNode(this.domNode);
		this.renderDisposables.clear();

		this.domNode.classList.toggle('disabled', !this.attachment.enabled);
		const label = this.resourceLabels.create(this.domNode, { supportIcons: true });
		const file = URI.isUri(this.attachment.value) ? this.attachment.value : this.attachment.value!.uri;
		const range = URI.isUri(this.attachment.value) || !this.attachment.isSelection ? undefined : this.attachment.value!.range;

		const fileBasename = basename(file);
		const fileDirname = dirname(file);
		const friendlyName = `${fileBasename} ${fileDirname}`;
		const ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);

		const uriLabel = this.labelService.getUriLabel(file, { relative: true });
		const currentFile = localize('openEditor', "Current file context");
		const inactive = localize('enableHint', "disabled");
		const currentFileHint = currentFile + (this.attachment.enabled ? '' : ` (${inactive})`);
		const title = `${currentFileHint}\n${uriLabel}`;
		label.setFile(file, {
			fileKind: FileKind.FILE,
			hidePath: true,
			range,
			title
		});
		this.domNode.ariaLabel = ariaLabel;
		this.domNode.tabIndex = 0;
		const hintElement = dom.append(this.domNode, dom.$('span.chat-implicit-hint', undefined, 'Current file'));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), hintElement, title));

		const buttonMsg = this.attachment.enabled ? localize('disable', "Disable current file context") : localize('enable', "Enable current file context");
		const toggleButton = this.renderDisposables.add(new Button(this.domNode, { supportIcons: true, title: buttonMsg }));
		toggleButton.icon = this.attachment.enabled ? Codicon.eye : Codicon.eyeClosed;
		this.renderDisposables.add(toggleButton.onDidClick((e) => {
			e.stopPropagation(); // prevent it from triggering the click handler on the parent immediately after rerendering
			this.attachment.enabled = !this.attachment.enabled;
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
}
