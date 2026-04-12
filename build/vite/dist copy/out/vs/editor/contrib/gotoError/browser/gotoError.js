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
var MarkerController_1;
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { IMarkerNavigationService } from './markerNavigationService.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { MarkerNavigationWidget } from './gotoErrorWidget.js';
let MarkerController = class MarkerController {
    static { MarkerController_1 = this; }
    static { this.ID = 'editor.contrib.markerController'; }
    static get(editor) {
        return editor.getContribution(MarkerController_1.ID);
    }
    constructor(editor, _markerNavigationService, _contextKeyService, _editorService, _instantiationService) {
        this._markerNavigationService = _markerNavigationService;
        this._contextKeyService = _contextKeyService;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._sessionDispoables = new DisposableStore();
        this._editor = editor;
        this._widgetVisible = CONTEXT_MARKERS_NAVIGATION_VISIBLE.bindTo(this._contextKeyService);
    }
    dispose() {
        this._cleanUp();
        this._sessionDispoables.dispose();
    }
    _cleanUp() {
        this._widgetVisible.reset();
        this._sessionDispoables.clear();
        this._widget = undefined;
        this._model = undefined;
    }
    _getOrCreateModel(uri) {
        if (this._model && this._model.matches(uri)) {
            return this._model;
        }
        let reusePosition = false;
        if (this._model) {
            reusePosition = true;
            this._cleanUp();
        }
        this._model = this._markerNavigationService.getMarkerList(uri);
        if (reusePosition) {
            this._model.move(true, this._editor.getModel(), this._editor.getPosition());
        }
        this._widget = this._instantiationService.createInstance(MarkerNavigationWidget, this._editor);
        this._widget.onDidClose(() => this.close(), this, this._sessionDispoables);
        this._widgetVisible.set(true);
        this._sessionDispoables.add(this._model);
        this._sessionDispoables.add(this._widget);
        // follow cursor
        this._sessionDispoables.add(this._editor.onDidChangeCursorPosition(e => {
            if (!this._model?.selected || !Range.containsPosition(this._model?.selected.marker, e.position)) {
                this._model?.resetIndex();
            }
        }));
        // update markers
        this._sessionDispoables.add(this._model.onDidChange(() => {
            if (!this._widget || !this._widget.position || !this._model) {
                return;
            }
            const info = this._model.find(this._editor.getModel().uri, this._widget.position);
            if (info) {
                this._widget.updateMarker(info.marker);
            }
            else {
                this._widget.showStale();
            }
        }));
        // open related
        this._sessionDispoables.add(this._widget.onDidSelectRelatedInformation(related => {
            this._editorService.openCodeEditor({
                resource: related.resource,
                options: { pinned: true, revealIfOpened: true, selection: Range.lift(related).collapseToStart() }
            }, this._editor);
            this.close(false);
        }));
        this._sessionDispoables.add(this._editor.onDidChangeModel(() => this._cleanUp()));
        return this._model;
    }
    close(focusEditor = true) {
        this._cleanUp();
        if (focusEditor) {
            this._editor.focus();
        }
    }
    showAtMarker(marker) {
        if (!this._editor.hasModel()) {
            return;
        }
        const textModel = this._editor.getModel();
        const model = this._getOrCreateModel(textModel.uri);
        model.resetIndex();
        model.move(true, textModel, new Position(marker.startLineNumber, marker.startColumn));
        if (model.selected) {
            this._widget.showAtMarker(model.selected.marker, model.selected.index, model.selected.total);
        }
    }
    async navigate(next, multiFile) {
        if (!this._editor.hasModel()) {
            return;
        }
        const textModel = this._editor.getModel();
        const model = this._getOrCreateModel(multiFile ? undefined : textModel.uri);
        model.move(next, textModel, this._editor.getPosition());
        if (!model.selected) {
            return;
        }
        if (model.selected.marker.resource.toString() !== textModel.uri.toString()) {
            // show in different editor
            this._cleanUp();
            const otherEditor = await this._editorService.openCodeEditor({
                resource: model.selected.marker.resource,
                options: { pinned: false, revealIfOpened: true, selectionRevealType: 2 /* TextEditorSelectionRevealType.NearTop */, selection: model.selected.marker }
            }, this._editor);
            if (otherEditor) {
                MarkerController_1.get(otherEditor)?.close();
                MarkerController_1.get(otherEditor)?.navigate(next, multiFile);
            }
        }
        else {
            // show in this editor
            this._widget.showAtMarker(model.selected.marker, model.selected.index, model.selected.total);
        }
    }
};
MarkerController = MarkerController_1 = __decorate([
    __param(1, IMarkerNavigationService),
    __param(2, IContextKeyService),
    __param(3, ICodeEditorService),
    __param(4, IInstantiationService)
], MarkerController);
export { MarkerController };
class MarkerNavigationAction extends EditorAction {
    constructor(_next, _multiFile, opts) {
        super(opts);
        this._next = _next;
        this._multiFile = _multiFile;
    }
    async run(_accessor, editor) {
        if (editor.hasModel()) {
            await MarkerController.get(editor)?.navigate(this._next, this._multiFile);
        }
    }
}
export class NextMarkerAction extends MarkerNavigationAction {
    static { this.ID = 'editor.action.marker.next'; }
    static { this.LABEL = nls.localize2('markerAction.next.label', "Go to Next Problem (Error, Warning, Info)"); }
    constructor() {
        super(true, false, {
            id: NextMarkerAction.ID,
            label: NextMarkerAction.LABEL,
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 512 /* KeyMod.Alt */ | 66 /* KeyCode.F8 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MarkerNavigationWidget.TitleMenu,
                title: NextMarkerAction.LABEL.value,
                icon: registerIcon('marker-navigation-next', Codicon.arrowDown, nls.localize('nextMarkerIcon', 'Icon for goto next marker.')),
                group: 'navigation',
                order: 1
            }
        });
    }
}
export class PrevMarkerAction extends MarkerNavigationAction {
    static { this.ID = 'editor.action.marker.prev'; }
    static { this.LABEL = nls.localize2('markerAction.previous.label', "Go to Previous Problem (Error, Warning, Info)"); }
    constructor() {
        super(false, false, {
            id: PrevMarkerAction.ID,
            label: PrevMarkerAction.LABEL,
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 66 /* KeyCode.F8 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MarkerNavigationWidget.TitleMenu,
                title: PrevMarkerAction.LABEL.value,
                icon: registerIcon('marker-navigation-previous', Codicon.arrowUp, nls.localize('previousMarkerIcon', 'Icon for goto previous marker.')),
                group: 'navigation',
                order: 2
            }
        });
    }
}
export class NextMarkerInFilesAction extends MarkerNavigationAction {
    static { this.ID = 'editor.action.marker.nextInFiles'; }
    constructor() {
        super(true, true, {
            id: NextMarkerInFilesAction.ID,
            label: nls.localize2('markerAction.nextInFiles.label', "Go to Next Problem in Files (Error, Warning, Info)"),
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 66 /* KeyCode.F8 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MenuId.MenubarGoMenu,
                title: nls.localize({ key: 'miGotoNextProblem', comment: ['&& denotes a mnemonic'] }, "Next &&Problem"),
                group: '6_problem_nav',
                order: 1
            }
        });
    }
}
export class PrevMarkerInFilesAction extends MarkerNavigationAction {
    static { this.ID = 'editor.action.marker.prevInFiles'; }
    constructor() {
        super(false, true, {
            id: PrevMarkerInFilesAction.ID,
            label: nls.localize2('markerAction.previousInFiles.label', "Go to Previous Problem in Files (Error, Warning, Info)"),
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 1024 /* KeyMod.Shift */ | 66 /* KeyCode.F8 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MenuId.MenubarGoMenu,
                title: nls.localize({ key: 'miGotoPreviousProblem', comment: ['&& denotes a mnemonic'] }, "Previous &&Problem"),
                group: '6_problem_nav',
                order: 2
            }
        });
    }
}
registerEditorContribution(MarkerController.ID, MarkerController, 4 /* EditorContributionInstantiation.Lazy */);
registerEditorAction(NextMarkerAction);
registerEditorAction(PrevMarkerAction);
registerEditorAction(NextMarkerInFilesAction);
registerEditorAction(PrevMarkerInFilesAction);
const CONTEXT_MARKERS_NAVIGATION_VISIBLE = new RawContextKey('markersNavigationVisible', false);
const MarkerCommand = EditorCommand.bindToContribution(MarkerController.get);
registerEditorCommand(new MarkerCommand({
    id: 'closeMarkersNavigation',
    precondition: CONTEXT_MARKERS_NAVIGATION_VISIBLE,
    handler: x => x.close(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 50,
        kbExpr: EditorContextKeys.focus,
        primary: 9 /* KeyCode.Escape */,
        secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */]
    }
}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ290b0Vycm9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZ290b0Vycm9yL2Jyb3dzZXIvZ290b0Vycm9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR3ZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFtRCxvQkFBb0IsRUFBRSxxQkFBcUIsRUFBRSwwQkFBMEIsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvTixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx3QkFBd0IsRUFBYyxNQUFNLDhCQUE4QixDQUFDO0FBQ3BGLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3hFLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV0SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUduRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFdkQsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFB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