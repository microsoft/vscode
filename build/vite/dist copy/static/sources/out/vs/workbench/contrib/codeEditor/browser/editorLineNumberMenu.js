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
import { Separator } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
export class GutterActionsRegistryImpl {
    constructor() {
        this._registeredGutterActionsGenerators = new Set();
    }
    /**
     *
     * This exists solely to allow the debug and test contributions to add actions to the gutter context menu
     * which cannot be trivially expressed using when clauses and therefore cannot be statically registered.
     * If you want an action to show up in the gutter context menu, you should generally use MenuId.EditorLineNumberMenu instead.
     */
    registerGutterActionsGenerator(gutterActionsGenerator) {
        this._registeredGutterActionsGenerators.add(gutterActionsGenerator);
        return {
            dispose: () => {
                this._registeredGutterActionsGenerators.delete(gutterActionsGenerator);
            }
        };
    }
    getGutterActionsGenerators() {
        return Array.from(this._registeredGutterActionsGenerators.values());
    }
}
Registry.add('gutterActionsRegistry', new GutterActionsRegistryImpl());
export const GutterActionsRegistry = Registry.as('gutterActionsRegistry');
let EditorLineNumberContextMenu = class EditorLineNumberContextMenu extends Disposable {
    static { this.ID = 'workbench.contrib.editorLineNumberContextMenu'; }
    constructor(editor, contextMenuService, menuService, contextKeyService, instantiationService) {
        super();
        this.editor = editor;
        this.contextMenuService = contextMenuService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this._register(this.editor.onMouseDown((e) => this.doShow(e, false)));
    }
    show(e) {
        this.doShow(e, true);
    }
    doShow(e, force) {
        const model = this.editor.getModel();
        // on macOS ctrl+click is interpreted as right click
        if (!e.event.rightButton && !(isMacintosh && e.event.leftButton && e.event.ctrlKey) && !force
            || e.target.type !== 3 /* MouseTargetType.GUTTER_LINE_NUMBERS */ && e.target.type !== 2 /* MouseTargetType.GUTTER_GLYPH_MARGIN */
            || !e.target.position || !model) {
            return;
        }
        const lineNumber = e.target.position.lineNumber;
        const contextKeyService = this.contextKeyService.createOverlay([['editorLineNumber', lineNumber]]);
        const menu = this.menuService.createMenu(MenuId.EditorLineNumberContext, contextKeyService);
        const allActions = [];
        this.instantiationService.invokeFunction(accessor => {
            for (const generator of GutterActionsRegistry.getGutterActionsGenerators()) {
                const collectedActions = new Map();
                generator({ lineNumber, editor: this.editor, accessor }, {
                    push: (action, group = 'navigation') => {
                        const actions = (collectedActions.get(group) ?? []);
                        actions.push(action);
                        collectedActions.set(group, actions);
                    }
                });
                for (const [group, actions] of collectedActions.entries()) {
                    allActions.push([group, actions]);
                }
            }
            allActions.sort((a, b) => a[0].localeCompare(b[0]));
            const menuActions = menu.getActions({ arg: { lineNumber, uri: model.uri }, shouldForwardArgs: true });
            allActions.push(...menuActions);
            // if the current editor selections do not contain the target line number,
            // set the selection to the clicked line number
            if (e.target.type === 3 /* MouseTargetType.GUTTER_LINE_NUMBERS */) {
                const currentSelections = this.editor.getSelections();
                const lineRange = {
                    startLineNumber: lineNumber,
                    endLineNumber: lineNumber,
                    startColumn: 1,
                    endColumn: model.getLineLength(lineNumber) + 1
                };
                const containsSelection = currentSelections?.some(selection => !selection.isEmpty() && selection.intersectRanges(lineRange) !== null);
                if (!containsSelection) {
                    this.editor.setSelection(lineRange, "api" /* TextEditorSelectionSource.PROGRAMMATIC */);
                }
            }
            this.contextMenuService.showContextMenu({
                getAnchor: () => e.event,
                getActions: () => Separator.join(...allActions.map((a) => a[1])),
                onHide: () => menu.dispose(),
            });
        });
    }
};
EditorLineNumberContextMenu = __decorate([
    __param(1, IContextMenuService),
    __param(2, IMenuService),
    __param(3, IContextKeyService),
    __param(4, IInstantiationService)
], EditorLineNumberContextMenu);
export { EditorLineNumberContextMenu };
registerEditorContribution(EditorLineNumberContextMenu.ID, EditorLineNumberContextMenu, 1 /* EditorContributionInstantiation.AfterFirstRender */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yTGluZU51bWJlck1lbnUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL2Jyb3dzZXIvZWRpdG9yTGluZU51bWJlck1lbnUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFXLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFbEUsT0FBTyxFQUFFLDBCQUEwQixFQUFtQyxNQUFNLGdEQUFnRCxDQUFDO0FBRTdILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFxQyxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFNNUUsTUFBTSxPQUFPLHlCQUF5QjtJQUF0QztRQUNTLHVDQUFrQyxHQUFpQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBb0J0RixDQUFDO0lBbEJBOzs7OztPQUtHO0lBQ0ksOEJBQThCLENBQUMsc0JBQStDO1FBQ3BGLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNwRSxPQUFPO1lBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixJQUFJLENBQUMsa0NBQWtDLENBQUMsTUFBTSxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFDeEUsQ0FBQztTQUNELENBQUM7SUFDSCxDQUFDO0lBRU0sMEJBQTBCO1FBQ2hDLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNyRSxDQUFDO0NBQ0Q7QUFFRCxRQUFRLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLElBQUkseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZFLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUE4QixRQUFRLENBQUMsRUFBRSxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFFOUYsSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSxVQUFVO2FBQzFDLE9BQUUsR0FBRywrQ0FBK0MsQUFBbEQsQ0FBbUQ7SUFFckUsWUFDa0IsTUFBbUIsRUFDRSxrQkFBdUMsRUFDOUMsV0FBeUIsRUFDbkIsaUJBQXFDLEVBQ2xDLG9CQUEyQztRQUVuRixLQUFLLEVBQUUsQ0FBQztRQU5TLFdBQU0sR0FBTixNQUFNLENBQWE7UUFDRSx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQzlDLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ25CLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDbEMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUluRixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBb0IsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTFGLENBQUM7SUFFTSxJQUFJLENBQUMsQ0FBb0I7UUFDL0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDdEIsQ0FBQztJQUVPLE1BQU0sQ0FBQyxDQUFvQixFQUFFLEtBQWM7UUFDbEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVyQyxvREFBb0Q7UUFDcEQsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUs7ZUFDekYsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLGdEQUF3QyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxnREFBd0M7ZUFDOUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxDQUFDLEtBQUssRUFDOUIsQ0FBQztZQUNGLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO1FBRWhELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRTVGLE1BQU0sVUFBVSxHQUFpRSxFQUFFLENBQUM7UUFFcEYsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUNuRCxLQUFLLE1BQU0sU0FBUyxJQUFJLHFCQUFxQixDQUFDLDBCQUEwQixFQUFFLEVBQUUsQ0FBQztnQkFDNUUsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsRUFBcUIsQ0FBQztnQkFDdEQsU0FBUyxDQUFDLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFO29CQUN4RCxJQUFJLEVBQUUsQ0FBQyxNQUFlLEVBQUUsUUFBZ0IsWUFBWSxFQUFFLEVBQUU7d0JBQ3ZELE1BQU0sT0FBTyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNwRCxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUNyQixnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUN0QyxDQUFDO2lCQUNELENBQUMsQ0FBQztnQkFDSCxLQUFLLE1BQU0sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLElBQUksZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztvQkFDM0QsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNuQyxDQUFDO1lBQ0YsQ0FBQztZQUVELFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsRUFBRSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDdEcsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLFdBQVcsQ0FBQyxDQUFDO1lBRWhDLDBFQUEwRTtZQUMxRSwrQ0FBK0M7WUFDL0MsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksZ0RBQXdDLEVBQUUsQ0FBQztnQkFDM0QsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUN0RCxNQUFNLFNBQVMsR0FBRztvQkFDakIsZUFBZSxFQUFFLFVBQVU7b0JBQzNCLGFBQWEsRUFBRSxVQUFVO29CQUN6QixXQUFXLEVBQUUsQ0FBQztvQkFDZCxTQUFTLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDO2lCQUM5QyxDQUFDO2dCQUNGLE1BQU0saUJBQWlCLEdBQUcsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksU0FBUyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztnQkFDdEksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLFNBQVMscURBQXlDLENBQUM7Z0JBQzdFLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQztnQkFDdkMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLO2dCQUN4QixVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNoRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTthQUM1QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7O0FBaEZXLDJCQUEyQjtJQUtyQyxXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLHFCQUFxQixDQUFBO0dBUlgsMkJBQTJCLENBaUZ2Qzs7QUFFRCwwQkFBMEIsQ0FBQywyQkFBMkIsQ0FBQyxFQUFFLEVBQUUsMkJBQTJCLDJEQUFtRCxDQUFDIn0=