/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../base/common/actions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { LanguageFeatureRegistry } from '../../../../editor/common/languageFeatureRegistry.js';
import { Location, SymbolKinds } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { DefinitionAction } from '../../../../editor/contrib/gotoSymbol/browser/goToCommands.js';
import * as nls from '../../../../nls.js';
import { localize } from '../../../../nls.js';
import { createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { fillEditorsDragData } from '../../../browser/dnd.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { ExplorerFolderContext } from '../../files/common/files.js';
import { IWorkspaceSymbol } from '../../search/common/search.js';
import { IChatContentInlineReference } from '../common/chatService.js';
import { IChatVariablesService } from '../common/chatVariables.js';
import { IChatWidgetService } from './chat.js';
import { IChatMarkdownAnchorService } from './chatContentParts/chatMarkdownAnchorService.js';

const chatResourceContextKey = new RawContextKey<string>('chatAnchorResource', undefined, { type: 'URI', description: localize('resource', "The full value of the chat anchor resource, including scheme and path") });
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
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ILanguageService languageService: ILanguageService,
		@IMenuService menuService: IMenuService,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		// TODO: Make sure we handle updates from an inlineReference being `resolved` late

		this.data = 'uri' in inlineReference.inlineReference
			? inlineReference.inlineReference
			: 'name' in inlineReference.inlineReference
				? { kind: 'symbol', symbol: inlineReference.inlineReference }
				: { uri: inlineReference.inlineReference };

		const contextKeyService = this._register(originalContextKeyService.createScoped(element));
		this._chatResourceContext = chatResourceContextKey.bindTo(contextKeyService);

		const anchorId = new Lazy(generateUuid);

		element.classList.add(InlineAnchorWidget.className, 'show-file-icons');

		let iconText: string;
		let iconClasses: string[];

		let location: { readonly uri: URI; readonly range?: IRange };
		let contextMenuId: MenuId;
		let contextMenuArg: URI | { readonly uri: URI; readonly range?: IRange };

		let updateContextKeys: (() => Promise<void>) | undefined;
		if (this.data.kind === 'symbol') {
			location = this.data.symbol.location;
			contextMenuId = MenuId.ChatInlineSymbolAnchorContext;
			contextMenuArg = location;

			iconText = this.data.symbol.name;
			iconClasses = ['codicon', ...getIconClasses(modelService, languageService, undefined, undefined, SymbolKinds.toIcon(this.data.symbol.kind))];

			const providerContexts: ReadonlyArray<[IContextKey<boolean>, LanguageFeatureRegistry<unknown>]> = [
				[EditorContextKeys.hasDefinitionProvider.bindTo(contextKeyService), languageFeaturesService.definitionProvider],
				[EditorContextKeys.hasReferenceProvider.bindTo(contextKeyService), languageFeaturesService.referenceProvider],
				[EditorContextKeys.hasImplementationProvider.bindTo(contextKeyService), languageFeaturesService.implementationProvider],
				[EditorContextKeys.hasTypeDefinitionProvider.bindTo(contextKeyService), languageFeaturesService.typeDefinitionProvider],
			];

			updateContextKeys = async () => {
				const modelRef = await textModelService.createModelReference(location.uri);
				try {
					if (this._isDisposed) {
						return;
					}

					const model = modelRef.object.textEditorModel;
					for (const [contextKey, registry] of providerContexts) {
						contextKey.set(registry.has(model));
					}
				} finally {
					modelRef.dispose();
				}
			};

			this._register(dom.addDisposableListener(element, 'click', () => {
				telemetryService.publicLog2<{
					anchorId: string;
				}, {
					anchorId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for the current anchor.' };
					owner: 'mjbvz';
					comment: 'Provides insight into the usage of Chat features.';
				}>('chat.inlineAnchor.openSymbol', {
					anchorId: anchorId.value
				});
			}));
		} else {
			location = this.data;
			contextMenuId = MenuId.ChatInlineResourceAnchorContext;
			contextMenuArg = location.uri;

			const label = labelService.getUriBasenameLabel(location.uri);
			iconText = location.range && this.data.kind !== 'symbol' ?
				`${label}#${location.range.startLineNumber}-${location.range.endLineNumber}` :
				label;

			const fileKind = location.uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
			iconClasses = getIconClasses(modelService, languageService, location.uri, fileKind);

			const isFolderContext = ExplorerFolderContext.bindTo(contextKeyService);
			fileService.stat(location.uri)
				.then(stat => {
					isFolderContext.set(stat.isDirectory);
				})
				.catch(() => { });

			this._register(dom.addDisposableListener(element, 'click', () => {
				telemetryService.publicLog2<{
					anchorId: string;
				}, {
					anchorId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Unique identifier for the current anchor.' };
					owner: 'mjbvz';
					comment: 'Provides insight into the usage of Chat features.';
				}>('chat.inlineAnchor.openResource', {
					anchorId: anchorId.value
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
					const menu = menuService.getMenuActions(contextMenuId, contextKeyService, { arg: contextMenuArg });
					const primary: IAction[] = [];
					createAndFillInContextMenuActions(menu, primary);
					return primary;
				},
			});
		}));

		// Hover
		const relativeLabel = labelService.getUriLabel(location.uri, { relative: true });
		this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), element, relativeLabel));

		// Drag and drop
		element.draggable = true;
		this._register(dom.addDisposableListener(element, 'dragstart', e => {
			instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, [location.uri], e));

			e.dataTransfer?.setDragImage(element, 0, 0);
		}));
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
			precondition: chatResourceContextKey,
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
		if (!anchor || anchor.data.kind === 'symbol') {
			return;
		}

		clipboardService.writeResources([anchor.data.uri]);
	}
});

registerAction2(class OpenToSideResourceAction extends Action2 {

	static readonly id = 'chat.inlineResourceAnchor.openToSide';

	constructor() {
		super({
			id: OpenToSideResourceAction.id,
			title: nls.localize2('actions.openToSide.label', "Open to the Side"),
			f1: false,
			precondition: chatResourceContextKey,
			keybinding: {
				weight: KeybindingWeight.ExternalExtension + 2,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.Enter
				},
			},
			menu: [{
				id: MenuId.ChatInlineSymbolAnchorContext,
				group: 'navigation',
				order: 1
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
		const editorService = accessor.get(IEditorService);

		const anchor = chatWidgetService.lastFocusedAnchor;
		if (!anchor) {
			return;
		}

		const input: ITextResourceEditorInput = anchor.data.kind === 'symbol'
			? {
				resource: anchor.data.symbol.location.uri, options: {
					selection: {
						startColumn: anchor.data.symbol.location.range.startColumn,
						startLineNumber: anchor.data.symbol.location.range.startLineNumber,
					}
				}
			}
			: { resource: anchor.data.uri };

		await editorService.openEditors([input], SIDE_GROUP);
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
			menu: [{
				id: MenuId.ChatInlineSymbolAnchorContext,
				group: '4_symbol_nav',
				order: 1.1,
				when: EditorContextKeys.hasDefinitionProvider,
			}]
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
			menu: [{
				id: MenuId.ChatInlineSymbolAnchorContext,
				group: '4_symbol_nav',
				order: 1.1,
				when: EditorContextKeys.hasTypeDefinitionProvider,
			},]
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
			menu: [{
				id: MenuId.ChatInlineSymbolAnchorContext,
				group: '4_symbol_nav',
				order: 1.2,
				when: EditorContextKeys.hasImplementationProvider,
			},]
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
			menu: [{
				id: MenuId.ChatInlineSymbolAnchorContext,
				group: '4_symbol_nav',
				order: 1.3,
				when: EditorContextKeys.hasReferenceProvider,
			},]
		});
	}

	override async run(accessor: ServicesAccessor, location: Location): Promise<void> {
		return runGoToCommand(accessor, 'editor.action.goToReferences', location);
	}
});

//#endregion
