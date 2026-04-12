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
import { windowOpenNoOpener } from '../../../base/browser/dom.js';
import { Schemas } from '../../../base/common/network.js';
import { AbstractCodeEditorService } from '../../browser/services/abstractCodeEditorService.js';
import { ICodeEditorService } from '../../browser/services/codeEditorService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
let StandaloneCodeEditorService = class StandaloneCodeEditorService extends AbstractCodeEditorService {
    constructor(contextKeyService, themeService) {
        super(themeService);
        this._register(this.onCodeEditorAdd(() => this._checkContextKey()));
        this._register(this.onCodeEditorRemove(() => this._checkContextKey()));
        this._editorIsOpen = contextKeyService.createKey('editorIsOpen', false);
        this._activeCodeEditor = null;
        this._register(this.registerCodeEditorOpenHandler(async (input, source, sideBySide) => {
            if (!source) {
                return null;
            }
            return this.doOpenEditor(source, input);
        }));
    }
    _checkContextKey() {
        let hasCodeEditor = false;
        for (const editor of this.listCodeEditors()) {
            if (!editor.isSimpleWidget) {
                hasCodeEditor = true;
                break;
            }
        }
        this._editorIsOpen.set(hasCodeEditor);
    }
    setActiveCodeEditor(activeCodeEditor) {
        this._activeCodeEditor = activeCodeEditor;
    }
    getActiveCodeEditor() {
        return this._activeCodeEditor;
    }
    doOpenEditor(editor, input) {
        const model = this.findModel(editor, input.resource);
        if (!model) {
            if (input.resource) {
                const schema = input.resource.scheme;
                if (schema === Schemas.http || schema === Schemas.https) {
                    // This is a fully qualified http or https URL
                    windowOpenNoOpener(input.resource.toString());
                    return editor;
                }
            }
            return null;
        }
        const selection = (input.options ? input.options.selection : null);
        if (selection) {
            if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
                editor.setSelection(selection);
                editor.revealRangeInCenter(selection, 1 /* ScrollType.Immediate */);
            }
            else {
                const pos = {
                    lineNumber: selection.startLineNumber,
                    column: selection.startColumn
                };
                editor.setPosition(pos);
                editor.revealPositionInCenter(pos, 1 /* ScrollType.Immediate */);
            }
        }
        return editor;
    }
    findModel(editor, resource) {
        const model = editor.getModel();
        if (model && model.uri.toString() !== resource.toString()) {
            return null;
        }
        return model;
    }
};
StandaloneCodeEditorService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IThemeService)
], StandaloneCodeEditorService);
export { StandaloneCodeEditorService };
registerSingleton(ICodeEditorService, StandaloneCodeEditorService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3N0YW5kYWxvbmUvYnJvd3Nlci9zdGFuZGFsb25lQ29kZUVkaXRvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBSWpGLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXBHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFeEUsSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSx5QkFBeUI7SUFLekUsWUFDcUIsaUJBQXFDLEVBQzFDLFlBQTJCO1FBRTFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNwQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsYUFBYSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxjQUFj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