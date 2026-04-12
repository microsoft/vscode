/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Range } from '../../../common/core/range.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { DefinitionAction, SymbolNavigationAction, SymbolNavigationAnchor } from '../../gotoSymbol/browser/goToCommands.js';
import { PeekContext } from '../../peekView/browser/peekView.js';
import { isIMenuItem, MenuId, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
export async function showGoToContextMenu(accessor, editor, anchor, part) {
    const resolverService = accessor.get(ITextModelService);
    const contextMenuService = accessor.get(IContextMenuService);
    const commandService = accessor.get(ICommandService);
    const instaService = accessor.get(IInstantiationService);
    const notificationService = accessor.get(INotificationService);
    await part.item.resolve(CancellationToken.None);
    if (!part.part.location) {
        return;
    }
    const location = part.part.location;
    const menuActions = [];
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
                }
                finally {
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
            }
            catch (err) {
                notificationService.notify({
                    severity: Severity.Error,
                    source: part.item.provider.displayName,
                    message: err
                });
            }
        }));
    }
    // show context menu
    const useShadowDOM = editor.getOption(144 /* EditorOption.useShadowDOM */);
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
export async function goToDefinitionWithLocation(accessor, event, editor, location) {
    const resolverService = accessor.get(ITextModelService);
    const ref = await resolverService.createModelReference(location.uri);
    await editor.invokeWithinContext(async (accessor) => {
        const openToSide = event.hasSideBySideModifier;
        const contextKeyService = accessor.get(IContextKeyService);
        const isInPeek = PeekContext.inPeekEditor.getValue(contextKeyService);
        const canPeek = !openToSide && editor.getOption(101 /* EditorOption.definitionLinkOpensInPeek */) && !isInPeek;
        const action = new DefinitionAction({ openToSide, openInPeek: canPeek, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
        return action.run(accessor, new SymbolNavigationAnchor(ref.object.textEditorModel, Range.getStartPosition(location.range)), Range.lift(location.range));
    });
    ref.dispose();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5sYXlIaW50c0xvY2F0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGF5SGludHMvYnJvd3Nlci9pbmxheUhpbnRzTG9jYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLE1BQU0sRUFBVyxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFHL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRzVILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFF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