/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../base/common/actions.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { Location, SymbolKinds } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { DefinitionAction } from '../../../../editor/contrib/gotoSymbol/browser/goToCommands.js';
import * as nls from '../../../../nls.js';
import { createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { fillEditorsDragData } from '../../../browser/dnd.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { ExplorerFolderContext } from '../../files/common/files.js';
import { ContentRefData } from '../common/annotations.js';
import { IChatVariablesService } from '../common/chatVariables.js';
import { IChatWidgetService } from './chat.js';

export class InlineAnchorWidget extends Disposable {

	constructor(
		element: HTMLAnchorElement,
		data: ContentRefData,
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
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const contextKeyService = this._register(originalContextKeyService.createScoped(element));
		const anchorId = new Lazy(generateUuid);

		element.classList.add('chat-inline-anchor-widget', 'show-file-icons');

		let iconText: string;
		let iconClasses: string[];

		let location: { readonly uri: URI; readonly range?: IRange };
		let contextMenuId: MenuId;
		let contextMenuArg: URI | { readonly uri: URI; readonly range?: IRange };
		if (data.kind === 'symbol') {
			location = data.symbol.location;
			contextMenuId = MenuId.ChatInlineSymbolAnchorContext;
			contextMenuArg = location;

			iconText = data.symbol.name;
			iconClasses = ['codicon', ...getIconClasses(modelService, languageService, undefined, undefined, SymbolKinds.toIcon(data.symbol.kind))];

			const model = modelService.getModel(location.uri);
			if (model) {
				const hasDefinitionProvider = EditorContextKeys.hasDefinitionProvider.bindTo(contextKeyService);
				const hasReferenceProvider = EditorContextKeys.hasReferenceProvider.bindTo(contextKeyService);
				const updateContents = () => {
					if (model.isDisposed()) {
						return;
					}

					hasDefinitionProvider.set(languageFeaturesService.definitionProvider.has(model));
					hasReferenceProvider.set(languageFeaturesService.definitionProvider.has(model));
				};
				updateContents();
				this._register(languageFeaturesService.definitionProvider.onDidChange(updateContents));
				this._register(languageFeaturesService.referenceProvider.onDidChange(updateContents));
			}

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
			location = data;
			contextMenuId = MenuId.ChatInlineResourceAnchorContext;
			contextMenuArg = location.uri;

			const resourceContextKey = this._register(new ResourceContextKey(contextKeyService, fileService, languageService, modelService));
			resourceContextKey.set(location.uri);

			const label = labelService.getUriBasenameLabel(location.uri);
			iconText = location.range && data.kind !== 'symbol' ?
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

		const iconEl = dom.$('span.icon');
		iconEl.classList.add(...iconClasses);
		element.replaceChildren(iconEl, dom.$('span.icon-label', {}, iconText));

		const fragment = location.range ? `${location.range.startLineNumber}-${location.range.endLineNumber}` : '';
		element.setAttribute('data-href', location.uri.with({ fragment }).toString());

		// Context menu
		this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, domEvent => {
			const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
			dom.EventHelper.stop(domEvent, true);

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
}

//#region Resource context menu

registerAction2(class AddFileToChatAction extends Action2 {

	static readonly id = 'chat.inlineResourceAnchor.addFileToChat';

	constructor() {
		super({
			id: AddFileToChatAction.id,
			title: {
				...nls.localize2('actions.attach.label', "Add File to Chat"),
			},
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
			precondition: EditorContextKeys.hasDefinitionProvider,
			menu: [{
				id: MenuId.ChatInlineSymbolAnchorContext,
				group: 'navigation',
				order: 1.1,
			},]
		});
	}

	override async run(accessor: ServicesAccessor, location: Location): Promise<void> {
		const editorService = accessor.get(ICodeEditorService);

		await editorService.openCodeEditor({
			resource: location.uri, options: {
				selection: {
					startColumn: location.range.startColumn,
					startLineNumber: location.range.startLineNumber,
				}
			}
		}, null);

		const action = new DefinitionAction({ openToSide: false, openInPeek: false, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
		return action.run(accessor);
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
			precondition: EditorContextKeys.hasReferenceProvider,
			menu: [{
				id: MenuId.ChatInlineSymbolAnchorContext,
				group: 'navigation',
				order: 1.1,
			},]
		});
	}

	override async run(accessor: ServicesAccessor, location: Location): Promise<void> {
		const editorService = accessor.get(ICodeEditorService);
		const commandService = accessor.get(ICommandService);

		await editorService.openCodeEditor({
			resource: location.uri, options: {
				selection: {
					startColumn: location.range.startColumn,
					startLineNumber: location.range.startLineNumber,
				}
			}
		}, null);

		await commandService.executeCommand('editor.action.goToReferences');
	}
});

//#endregion
