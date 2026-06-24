/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { Location } from '../../../common/languages.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { DefinitionAction, SymbolNavigationAction, SymbolNavigationAnchor } from '../../gotoSymbol/browser/goToCommands.js';
import { ClickLinkMouseEvent } from '../../gotoSymbol/browser/link/clickLinkGesture.js';
import { RenderedInlayHintLabelPart } from './inlayHintsController.js';
import { PeekContext } from '../../peekView/browser/peekView.js';
import { isIMenuItem, MenuId, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

export async function showGoToContextMenu(accessor: ServicesAccessor, editor: ICodeEditor, anchor: HTMLElement, part: RenderedInlayHintLabelPart) {

	const resolverService = accessor.get(ITextModelService);
	const contextMenuService = accessor.get(IContextMenuService);
	const commandService = accessor.get(ICommandService);
	const instaService = accessor.get(IInstantiationService);
	const notificationService = accessor.get(INotificationService);

	await part.item.resolve(CancellationToken.None);

	if (!part.part.location) {
		return;
	}

	const location: Location = part.part.location;
	const menuActions: IAction[] = [];

	// from all registered (not active) context menu actions select those
	// that are a symbol navigation actions
	const filter = new Set(MenuRegistry.getMenuItems(MenuId.EditorContext)
		.map(item => isIMenuItem(item) ? item.command.id : generateUuid()));

	for (const delegate of SymbolNavigationAction.all()) {
		if (filter.has(delegate.desc.id)) {
			menuActions.push(new Action(delegate.desc.id, MenuItemAction.label(delegate.desc, { renderShortTitle: true }), undefined, true, async () => {
				const ref = await resolverService.createModelReference(location.uri);
				try {
					const symbolAnchor = new SymbolNavigationAnchor(ref.object.textEditorModel, Range.getStartPosition(location.range));
					const range = part.item.anchor.range;
					await instaService.invokeFunction(delegate.runEditorCommand.bind(delegate), editor, symbolAnchor, range);
				} finally {
					ref.dispose();

				}
			}));
		}
	}

	if (part.part.command) {
		const { command } = part.part;
		menuActions.push(new Separator());
		menuActions.push(new Action(command.id, command.title, undefined, true, async () => {
			try {
				await commandService.executeCommand(command.id, ...(command.arguments ?? []));
			} catch (err) {
				notificationService.notify({
					severity: Severity.Error,
					source: part.item.provider.displayName,
					message: err
				});
			}
		}));
	}

	// show context menu
	const useShadowDOM = editor.getOption(EditorOption.useShadowDOM);
	contextMenuService.showContextMenu({
		domForShadowRoot: useShadowDOM ? editor.getDomNode() ?? undefined : undefined,
		getAnchor: () => {
			const box = dom.getDomNodePagePosition(anchor);
			return { x: box.left, y: box.top + box.height + 8 };
		},
		getActions: () => menuActions,
		onHide: () => {
			editor.focus();
		},
		autoSelectFirstItem: true,
	});

}

export async function goToDefinitionWithLocation(accessor: ServicesAccessor, event: ClickLinkMouseEvent, editor: IActiveCodeEditor, location: Location) {

	const resolverService = accessor.get(ITextModelService);
	const ref = await resolverService.createModelReference(location.uri);

	await editor.invokeWithinContext(async (accessor) => {

		const openToSide = event.hasSideBySideModifier;
		const contextKeyService = accessor.get(IContextKeyService);

		const isInPeek = PeekContext.inPeekEditor.getValue(contextKeyService);
		const canPeek = !openToSide && editor.getOption(EditorOption.definitionLinkOpensInPeek) && !isInPeek;

		const action = new DefinitionAction({ openToSide, openInPeek: canPeek, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
		return action.run(accessor, new SymbolNavigationAnchor(ref.object.textEditorModel, Range.getStartPosition(location.range)), Range.lift(location.range));
	});

	ref.dispose();
}
