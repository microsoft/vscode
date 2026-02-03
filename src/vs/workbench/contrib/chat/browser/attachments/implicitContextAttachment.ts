/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isLocation, Location } from '../../../../../editor/common/languages.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind, IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { IChatRequestStringVariableEntry, isStringImplicitContextValue } from '../../common/attachments/chatVariableEntries.js';
import { IChatWidget } from '../chat.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { IChatContextService } from '../contextContrib/chatContextService.js';
import { ChatImplicitContext, ChatImplicitContexts } from './chatImplicitContext.js';
import { IRange } from '../../../../../editor/common/core/range.js';

export class ImplicitContextAttachmentWidget extends Disposable {

	private readonly renderDisposables = this._register(new DisposableStore());
	private renderedCount = 0;

	constructor(
		private readonly widgetRef: () => IChatWidget | undefined,
		private readonly isAttachmentAlreadyAttached: (targetUri: URI | undefined, targetRange: IRange | undefined, targetHandle: number | undefined) => boolean,
		private readonly attachment: ChatImplicitContexts,
		private readonly resourceLabels: ResourceLabels,
		private readonly attachmentModel: ChatAttachmentModel,
		private readonly domNode: HTMLElement,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ILabelService private readonly labelService: ILabelService,
		@IMenuService private readonly menuService: IMenuService,
		@IFileService private readonly fileService: IFileService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@IHoverService private readonly hoverService: IHoverService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IChatContextService private readonly chatContextService: IChatContextService,
	) {
		super();

		this.render();
	}

	private render() {
		this.renderDisposables.clear();
		this.renderedCount = 0;

		for (const context of this.attachment.values) {
			const targetUri: URI | undefined = context.uri;
			const targetRange = isLocation(context.value) ? context.value.range : undefined;
			const targetHandle = isStringImplicitContextValue(context.value) ? context.value.handle : undefined;
			const currentlyAttached = this.isAttachmentAlreadyAttached(targetUri, targetRange, targetHandle);
			if (!currentlyAttached) {
				this.renderMainContext(context, context.isSelection);
				this.renderedCount++;
			}
		}
	}

	get hasRenderedContexts(): boolean {
		return this.renderedCount > 0;
	}

	private renderMainContext(context: ChatImplicitContext, isSelection?: boolean) {
		const contextNode = dom.$('.chat-attached-context-attachment.show-file-icons.implicit');
		this.domNode.appendChild(contextNode);

		contextNode.classList.toggle('disabled', !context.enabled);
		const file: URI | undefined = context.uri;
		const attachmentTypeName = file?.scheme === Schemas.vscodeNotebookCell ? localize('cell.lowercase', "cell") : localize('file.lowercase', "file");

		const isSuggestedEnabled = this.configService.getValue('chat.implicitContext.suggestedContext');

		// Create toggle button BEFORE the label so it appears on the left
		if (isSuggestedEnabled) {
			if (!isSelection) {
				const buttonMsg = context.enabled ? localize('disable', "Disable current {0} context", attachmentTypeName) : '';
				const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
				toggleButton.icon = context.enabled ? Codicon.x : Codicon.plus;
				this.renderDisposables.add(toggleButton.onDidClick(async (e) => {
					e.stopPropagation();
					e.preventDefault();
					if (!context.enabled) {
						await this.convertToRegularAttachment(context);
					}
					context.enabled = false;
				}));
			} else {
				const pinButtonMsg = localize('pinSelection', "Pin selection");
				const pinButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: pinButtonMsg }));
				pinButton.icon = Codicon.pinned;
				this.renderDisposables.add(pinButton.onDidClick(async (e) => {
					e.stopPropagation();
					e.preventDefault();
					await this.pinSelection();
				}));
			}

			if (!context.enabled && isSelection) {
				contextNode.classList.remove('disabled');
			}

			this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CLICK, async (e) => {
				if (!context.enabled && !isSelection) {
					await this.convertToRegularAttachment(context);
				}
			}));

			this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.KEY_DOWN, async (e) => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					if (!context.enabled && !isSelection) {
						e.preventDefault();
						e.stopPropagation();
						await this.convertToRegularAttachment(context);
					}
				}
			}));
		} else {
			const buttonMsg = context.enabled ? localize('disable', "Disable current {0} context", attachmentTypeName) : localize('enable', "Enable current {0} context", attachmentTypeName);
			const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
			toggleButton.icon = context.enabled ? Codicon.eye : Codicon.eyeClosed;
			this.renderDisposables.add(toggleButton.onDidClick((e) => {
				e.stopPropagation(); // prevent it from triggering the click handler on the parent immediately after rerendering
				context.enabled = !context.enabled;
			}));
		}

		const label = this.resourceLabels.create(contextNode, { supportIcons: true });

		let title: string | undefined;
		let markdownTooltip: IMarkdownString | undefined;
		if (isStringImplicitContextValue(context.value)) {
			markdownTooltip = context.value.tooltip;
			title = this.renderString(label, context.name, context.icon, context.value.resourceUri, markdownTooltip, localize('openFile', "Current file context"));
		} else {
			title = this.renderResource(context.value, context.isSelection, context.enabled, label);
		}

		if (markdownTooltip || title) {
			this.renderDisposables.add(this.hoverService.setupDelayedHover(contextNode, {
				content: markdownTooltip! ?? title!,
				appearance: { showPointer: true },
			}));
		}

		// Context menu
		const scopedContextKeyService = this.renderDisposables.add(this.contextKeyService.createScoped(contextNode));

		const resourceContextKey = this.renderDisposables.add(new ResourceContextKey(scopedContextKeyService, this.fileService, this.languageService, this.modelService));
		resourceContextKey.set(file);

		this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CONTEXT_MENU, async domEvent => {
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

	private renderString(resourceLabel: IResourceLabel, name: string, icon: ThemeIcon | undefined, resourceUri: URI | undefined, markdownTooltip: IMarkdownString | undefined, defaultTitle: string): string | undefined {
		// Don't set title if we have a markdown tooltip - the hover service will handle it
		const title = markdownTooltip ? undefined : defaultTitle;

		// Derive icon classes from resourceUri for file/folder icons
		if (icon && (ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon)) && resourceUri) {
			const fileKind = ThemeIcon.isFolder(icon) ? FileKind.FOLDER : FileKind.FILE;
			const iconClasses = getIconClasses(this.modelService, this.languageService, resourceUri, fileKind);
			resourceLabel.setLabel(name, undefined, { extraClasses: iconClasses, title });
		} else {
			resourceLabel.setLabel(name, undefined, { iconPath: icon, title });
		}
		return title;
	}

	private renderResource(attachmentValue: Location | URI | undefined, isSelection: boolean, enabled: boolean, label: IResourceLabel): string {
		const file = URI.isUri(attachmentValue) ? attachmentValue : attachmentValue!.uri;
		const range = URI.isUri(attachmentValue) || !isSelection ? undefined : attachmentValue!.range;

		const attachmentTypeName = file.scheme === Schemas.vscodeNotebookCell ? localize('cell.lowercase', "cell") : localize('file.lowercase', "file");

		const fileBasename = basename(file);
		const fileDirname = dirname(file);
		const friendlyName = `${fileBasename} ${fileDirname}`;
		const ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached {0}, {1}, line {2} to line {3}", attachmentTypeName, friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached {0}, {1}", attachmentTypeName, friendlyName);

		const uriLabel = this.labelService.getUriLabel(file, { relative: true });
		const currentFile = localize('openEditor', "Current {0} context", attachmentTypeName);
		const inactive = localize('enableHint', "Enable current {0} context", attachmentTypeName);
		const currentFileHint = enabled || isSelection ? currentFile : inactive;
		const title = `${currentFileHint}\n${uriLabel}`;

		label.setFile(file, {
			fileKind: FileKind.FILE,
			hidePath: true,
			range,
			title
		});
		this.domNode.ariaLabel = ariaLabel;
		this.domNode.tabIndex = 0;

		return title;
	}

	private async convertToRegularAttachment(attachment: ChatImplicitContext): Promise<void> {
		if (!attachment.value) {
			return;
		}
		if (isStringImplicitContextValue(attachment.value)) {
			if (attachment.value.value === undefined) {
				await this.chatContextService.resolveChatContext(attachment.value);
			}
			const context: IChatRequestStringVariableEntry = {
				kind: 'string',
				value: attachment.value.value,
				id: attachment.id,
				name: attachment.name,
				icon: attachment.value.icon,
				modelDescription: attachment.modelDescription,
				uri: attachment.value.uri,
				resourceUri: attachment.value.resourceUri,
				tooltip: attachment.value.tooltip,
				commandId: attachment.value.commandId,
				handle: attachment.value.handle
			};
			this.attachmentModel.addContext(context);
		} else {
			const file = URI.isUri(attachment.value) ? attachment.value : attachment.value.uri;
			if (file.scheme === Schemas.vscodeNotebookCell && isLocation(attachment.value)) {
				this.attachmentModel.addFile(file, attachment.value.range);
			} else {
				this.attachmentModel.addFile(file);
			}
		}
		this.widgetRef()?.focusInput();
	}

	private async pinSelection(): Promise<void> {
		for (const attachment of this.attachment.values) {
			if (!attachment.value || !attachment.isSelection) {
				continue;
			}

			if (!URI.isUri(attachment.value) && !isStringImplicitContextValue(attachment.value)) {
				const location = attachment.value;
				this.attachmentModel.addFile(location.uri, location.range);
			}
		}
		this.widgetRef()?.focusInput();
	}
}
