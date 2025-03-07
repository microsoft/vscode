/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { Location, SymbolKinds } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { DefinitionAction } from '../../../../editor/contrib/gotoSymbol/browser/goToCommands.js';
import * as nls from '../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IResourceStat } from '../../../../platform/dnd/browser/dnd.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { FolderThemeIcon, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../browser/dnd.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { ExplorerFolderContext } from '../../files/common/files.js';
import { IWorkspaceSymbol } from '../../search/common/search.js';
import { IChatContentInlineReference } from '../common/chatService.js';
import { IChatVariablesService } from '../common/chatVariables.js';
import { IChatWidgetService } from './chat.js';
import { chatAttachmentResourceContextKey, hookUpSymbolAttachmentDragAndContextMenu } from './chatContentParts/chatAttachmentsContentPart.js';
import { IChatMarkdownAnchorService } from './chatContentParts/chatMarkdownAnchorService.js';

type ContentRefData =
	| { readonly kind: 'symbol'; readonly symbol: IWorkspaceSymbol }
	| {
		readonly kind?: undefined;
		readonly uri: URI;
		readonly range?: IRange;
	};

export class InlineAnchorWidget extends Disposable {

	public static readonly className = 'chat-inline-anchor-widget';

	private readonly _chatResourceContext: IContextKey<string>;

	readonly data: ContentRefData;

	private _isDisposed = false;

	constructor(
		private readonly element: HTMLAnchorElement | HTMLElement,
		public readonly inlineReference: IChatContentInlineReference,
		@IContextKeyService originalContextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IFileService fileService: IFileService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@ILanguageService languageService: ILanguageService,
		@IMenuService menuService: IMenuService,
		@IModelService modelService: IModelService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
	) {
		super();

		// TODO: Make sure we handle updates from an inlineReference being `resolved` late

		this.data = 'uri' in inlineReference.inlineReference
			? inlineReference.inlineReference
			: 'name' in inlineReference.inlineReference
				? { kind: 'symbol', symbol: inlineReference.inlineReference }
				: { uri: inlineReference.inlineReference };

		const contextKeyService = this._register(originalContextKeyService.createScoped(element));
		this._chatResourceContext = chatAttachmentResourceContextKey.bindTo(contextKeyService);

		element.classList.add(InlineAnchorWidget.className, 'show-file-icons');

		let iconText: string;
		let iconClasses: string[];

		let location: { readonly uri: URI; readonly range?: IRange };

		let updateContextKeys: (() => Promise<void>) | undefined;
		if (this.data.kind === 'symbol') {
			const symbol = this.data.symbol;

			location = this.data.symbol.location;
			iconText = this.data.symbol.name;
			iconClasses = ['codicon', ...getIconClasses(modelService, languageService, undefined, undefined, SymbolKinds.toIcon(symbol.kind))];

			this._store.add(instantiationService.invokeFunction(accessor => hookUpSymbolAttachmentDragAndContextMenu(accessor, element, contextKeyService, { value: symbol.location, name: symbol.name, kind: symbol.kind }, MenuId.ChatInlineSymbolAnchorContext)));
		} else {
			location = this.data;

			const label = labelService.getUriBasenameLabel(location.uri);
			iconText = location.range && this.data.kind !== 'symbol' ?
				`${label}#${location.range.startLineNumber}-${location.range.endLineNumber}` :
				label;

			let fileKind = location.uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
			const recomputeIconClasses = () => getIconClasses(modelService, languageService, location.uri, fileKind, fileKind === FileKind.FOLDER && !themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : undefined);

			iconClasses = recomputeIconClasses();

			const refreshIconClasses = () => {
				iconEl.classList.remove(...iconClasses);
				iconClasses = recomputeIconClasses();
				iconEl.classList.add(...iconClasses);
			};

			this._register(themeService.onDidFileIconThemeChange(() => {
				refreshIconClasses();
			}));

			const isFolderContext = ExplorerFolderContext.bindTo(contextKeyService);
			fileService.stat(location.uri)
				.then(stat => {
					isFolderContext.set(stat.isDirectory);
					if (stat.isDirectory) {
						fileKind = FileKind.FOLDER;
						refreshIconClasses();
					}
				})
				.catch(() => { });

			// Context menu
			this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, async domEvent => {
				const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
				dom.EventHelper.stop(domEvent, true);

				try {
					await updateContextKeys?.();
				} catch (e) {
					console.error(e);
				}

				if (this._isDisposed) {
					return;
				}

				contextMenuService.showContextMenu({
					contextKeyService,
					getAnchor: () => event,
					getActions: () => {
						const menu = menuService.getMenuActions(MenuId.ChatInlineResourceAnchorContext, contextKeyService, { arg: location.uri });
						return getFlatContextMenuActions(menu);
					},
				});
			}));
		}

		const resourceContextKey = this._register(new ResourceContextKey(contextKeyService, fileService, languageService, modelService));
		resourceContextKey.set(location.uri);
		this._chatResourceContext.set(location.uri.toString());

		const iconEl = dom.$('span.icon');
		iconEl.classList.add(...iconClasses);
		element.replaceChildren(iconEl, dom.$('span.icon-label', {}, iconText));

		const fragment = location.range ? `${location.range.startLineNumber},${location.range.startColumn}` : '';
		element.setAttribute('data-href', (fragment ? location.uri.with({ fragment }) : location.uri).toString());

		// Hover
		const relativeLabel = labelService.getUriLabel(location.uri, { relative: true });
		this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), element, relativeLabel));

		// Drag and drop
		if (this.data.kind !== 'symbol') {
			element.draggable = true;
			this._register(dom.addDisposableListener(element, 'dragstart', e => {
				const stat: IResourceStat = {
					resource: location.uri,
					selection: location.range,
				};
				instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, [stat], e));


				e.dataTransfer?.setDragImage(element, 0, 0);
			}));
		}
	}

	override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	getHTMLElement(): HTMLElement {
		return this.element;
	}
}

//#region Resource context menu

registerAction2(class AddFileToChatAction extends Action2 {

	static readonly id = 'chat.inlineResourceAnchor.addFileToChat';

	constructor() {
		super({
			id: AddFileToChatAction.id,
			title: nls.localize2('actions.attach.label', "Add File to Chat"),
			menu: [{
				id: MenuId.ChatInlineResourceAnchorContext,
				group: 'chat',
				order: 1,
				when: ExplorerFolderContext.negate(),
			}]
		});
	}

	override async run(accessor: ServicesAccessor, resource: URI): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const variablesService = accessor.get(IChatVariablesService);

		const widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		variablesService.attachContext('file', resource, widget.location);
	}
});

//#endregion

//#region Resource keybindings

registerAction2(class CopyResourceAction extends Action2 {

	static readonly id = 'chat.inlineResourceAnchor.copyResource';

	constructor() {
		super({
			id: CopyResourceAction.id,
			title: nls.localize2('actions.copy.label', "Copy"),
			f1: false,
			precondition: chatAttachmentResourceContextKey,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyC,
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
		const clipboardService = accessor.get(IClipboardService);

		const anchor = chatWidgetService.lastFocusedAnchor;
		if (!anchor) {
			return;
		}

		// TODO: we should also write out the standard mime types so that external programs can use them
		// like how `fillEditorsDragData` works but without having an event to work with.
		const resource = anchor.data.kind === 'symbol' ? anchor.data.symbol.location.uri : anchor.data.uri;
		clipboardService.writeResources([resource]);
	}
});

registerAction2(class OpenToSideResourceAction extends Action2 {

	static readonly id = 'chat.inlineResourceAnchor.openToSide';

	constructor() {
		super({
			id: OpenToSideResourceAction.id,
			title: nls.localize2('actions.openToSide.label', "Open to the Side"),
			f1: false,
			precondition: chatAttachmentResourceContextKey,
			keybinding: {
				weight: KeybindingWeight.ExternalExtension + 2,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.Enter
				},
			},
			menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
				id: id,
				group: 'navigation',
				order: 1
			}))
		});
	}

	override async run(accessor: ServicesAccessor, arg?: Location | URI): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const target = this.getTarget(accessor, arg);
		if (!target) {
			return;
		}

		const input: ITextResourceEditorInput = URI.isUri(target)
			? { resource: target }
			: {
				resource: target.uri, options: {
					selection: {
						startColumn: target.range.startColumn,
						startLineNumber: target.range.startLineNumber,
					}
				}
			};

		await editorService.openEditors([input], SIDE_GROUP);
	}

	private getTarget(accessor: ServicesAccessor, arg: URI | Location | undefined): Location | URI | undefined {
		const chatWidgetService = accessor.get(IChatMarkdownAnchorService);

		if (arg) {
			return arg;
		}

		const anchor = chatWidgetService.lastFocusedAnchor;
		if (!anchor) {
			return undefined;
		}

		return anchor.data.kind === 'symbol' ? anchor.data.symbol.location : anchor.data.uri;
	}
});

//#endregion

//#region Symbol context menu

registerAction2(class GoToDefinitionAction extends Action2 {

	static readonly id = 'chat.inlineSymbolAnchor.goToDefinition';

	constructor() {
		super({
			id: GoToDefinitionAction.id,
			title: {
				...nls.localize2('actions.goToDecl.label', "Go to Definition"),
				mnemonicTitle: nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition"),
			},
			menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
				id,
				group: '4_symbol_nav',
				order: 1.1,
				when: EditorContextKeys.hasDefinitionProvider,
			}))
		});
	}

	override async run(accessor: ServicesAccessor, location: Location): Promise<void> {
		const editorService = accessor.get(ICodeEditorService);

		await openEditorWithSelection(editorService, location);

		const action = new DefinitionAction({ openToSide: false, openInPeek: false, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
		return action.run(accessor);
	}
});

async function openEditorWithSelection(editorService: ICodeEditorService, location: Location) {
	await editorService.openCodeEditor({
		resource: location.uri, options: {
			selection: {
				startColumn: location.range.startColumn,
				startLineNumber: location.range.startLineNumber,
			}
		}
	}, null);
}

async function runGoToCommand(accessor: ServicesAccessor, command: string, location: Location) {
	const editorService = accessor.get(ICodeEditorService);
	const commandService = accessor.get(ICommandService);

	await openEditorWithSelection(editorService, location);

	return commandService.executeCommand(command);
}

registerAction2(class GoToTypeDefinitionsAction extends Action2 {

	static readonly id = 'chat.inlineSymbolAnchor.goToTypeDefinitions';

	constructor() {
		super({
			id: GoToTypeDefinitionsAction.id,
			title: {
				...nls.localize2('goToTypeDefinitions.label', "Go to Type Definitions"),
				mnemonicTitle: nls.localize({ key: 'miGotoTypeDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Type Definitions"),
			},
			menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
				id,
				group: '4_symbol_nav',
				order: 1.1,
				when: EditorContextKeys.hasTypeDefinitionProvider,
			})),
		});
	}

	override async run(accessor: ServicesAccessor, location: Location): Promise<void> {
		return runGoToCommand(accessor, 'editor.action.goToTypeDefinition', location);
	}
});

registerAction2(class GoToImplementations extends Action2 {

	static readonly id = 'chat.inlineSymbolAnchor.goToImplementations';

	constructor() {
		super({
			id: GoToImplementations.id,
			title: {
				...nls.localize2('goToImplementations.label', "Go to Implementations"),
				mnemonicTitle: nls.localize({ key: 'miGotoImplementations', comment: ['&& denotes a mnemonic'] }, "Go to &&Implementations"),
			},
			menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
				id,
				group: '4_symbol_nav',
				order: 1.2,
				when: EditorContextKeys.hasImplementationProvider,
			})),
		});
	}

	override async run(accessor: ServicesAccessor, location: Location): Promise<void> {
		return runGoToCommand(accessor, 'editor.action.goToImplementation', location);
	}
});

registerAction2(class GoToReferencesAction extends Action2 {

	static readonly id = 'chat.inlineSymbolAnchor.goToReferences';

	constructor() {
		super({
			id: GoToReferencesAction.id,
			title: {
				...nls.localize2('goToReferences.label', "Go to References"),
				mnemonicTitle: nls.localize({ key: 'miGotoReference', comment: ['&& denotes a mnemonic'] }, "Go to &&References"),
			},
			menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map(id => ({
				id,
				group: '4_symbol_nav',
				order: 1.3,
				when: EditorContextKeys.hasReferenceProvider,
			})),
		});
	}

	override async run(accessor: ServicesAccessor, location: Location): Promise<void> {
		return runGoToCommand(accessor, 'editor.action.goToReferences', location);
	}
});

//#endregion
