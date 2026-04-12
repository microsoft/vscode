/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Separator, toAction } from '../../../base/common/actions.js';
import { localize } from '../../../nls.js';
import { IWorkbenchLayoutService } from '../../services/layout/browser/layoutService.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { EventHelper, addDisposableListener, getActiveDocument, getWindow, isHTMLInputElement, isHTMLTextAreaElement } from '../../../base/browser/dom.js';
import { registerWorkbenchContribution2 } from '../../common/contributions.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { Event as BaseEvent } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { ILogService } from '../../../platform/log/common/log.js';
export function createTextInputActions(clipboardService, logService) {
    return [
        toAction({ id: 'undo', label: localize('undo', "Undo"), run: () => getActiveDocument().execCommand('undo') }),
        toAction({ id: 'redo', label: localize('redo', "Redo"), run: () => getActiveDocument().execCommand('redo') }),
        new Separator(),
        toAction({
            id: 'editor.action.clipboardCutAction', label: localize('cut', "Cut"), run: () => {
                logService.trace('TextInputActionsProvider#cut');
                getActiveDocument().execCommand('cut');
            }
        }),
        toAction({
            id: 'editor.action.clipboardCopyAction', label: localize('copy', "Copy"), run: () => {
                logService.trace('TextInputActionsProvider#copy');
                getActiveDocument().execCommand('copy');
            }
        }),
        toAction({
            id: 'editor.action.clipboardPasteAction',
            label: localize('paste', "Paste"),
            run: async (element) => {
                logService.trace('TextInputActionsProvider#paste');
                const clipboardText = await clipboardService.readText();
                if (isHTMLTextAreaElement(element) || isHTMLInputElement(element)) {
                    const selectionStart = element.selectionStart || 0;
                    const selectionEnd = element.selectionEnd || 0;
                    element.value = `${element.value.substring(0, selectionStart)}${clipboardText}${element.value.substring(selectionEnd, element.value.length)}`;
                    element.selectionStart = selectionStart + clipboardText.length;
                    element.selectionEnd = element.selectionStart;
                    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                }
            }
        }),
        new Separator(),
        toAction({ id: 'editor.action.selectAll', label: localize('selectAll', "Select All"), run: () => getActiveDocument().execCommand('selectAll') })
    ];
}
let TextInputActionsProvider = class TextInputActionsProvider extends Disposable {
    static { this.ID = 'workbench.contrib.textInputActionsProvider'; }
    constructor(layoutService, contextMenuService, clipboardService, logService) {
        super();
        this.layoutService = layoutService;
        this.contextMenuService = contextMenuService;
        this.clipboardService = clipboardService;
        this.logService = logService;
        this.textInputActions = new Lazy(() => createTextInputActions(this.clipboardService, this.logService));
        this.registerListeners();
    }
    registerListeners() {
        // Context menu support in input/textarea
        this._register(BaseEvent.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
            disposables.add(addDisposableListener(container, 'contextmenu', e => this.onContextMenu(getWindow(container), e)));
        }, { container: this.layoutService.mainContainer, disposables: this._store }));
    }
    onContextMenu(targetWindow, e) {
        if (e.defaultPrevented) {
            return; // make sure to not show these actions by accident if component indicated to prevent
        }
        const target = e.target;
        if (!isHTMLTextAreaElement(target) && !isHTMLInputElement(target)) {
            return; // only for inputs or textareas
        }
        EventHelper.stop(e, true);
        const event = new StandardMouseEvent(targetWindow, e);
        this.contextMenuService.showContextMenu({
            getAnchor: () => event,
            getActions: () => this.textInputActions.value,
            getActionsContext: () => target,
        });
    }
};
TextInputActionsProvider = __decorate([
    __param(0, IWorkbenchLayoutService),
    __param(1, IContextMenuService),
    __param(2, IClipboardService),
    __param(3, ILogService)
], TextInputActionsProvider);
export { TextInputActionsProvider };
registerWorkbenchContribution2(TextInputActionsProvider.ID, TextInputActionsProvider, 2 /* WorkbenchPhase.BlockRestore */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dElucHV0QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvdGV4dElucHV0QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQVcsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMzSixPQUFPLEVBQTBDLDhCQUE4QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdkgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDM0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekUsT0FBTyxFQUFFLEtBQUssSUFBSSxTQUFTLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRWxFLE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxnQkFBbUMsRUFBRSxVQUF1QjtJQUNsRyxPQUFPO1FBRU4sUUFBUSxDQUFDLEVBQUUsRUFBRSxFQUFFLE1B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