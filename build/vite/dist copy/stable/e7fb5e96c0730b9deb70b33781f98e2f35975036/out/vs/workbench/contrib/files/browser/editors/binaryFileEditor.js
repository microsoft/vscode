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
var BinaryFileEditor_1;
import { localize } from '../../../../../nls.js';
import { BaseBinaryResourceEditor } from '../../../../browser/parts/editor/binaryEditor.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { FileEditorInput } from './fileEditorInput.js';
import { BINARY_FILE_EDITOR_ID, BINARY_TEXT_FILE_MODE } from '../../common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorResolution } from '../../../../../platform/editor/common/editor.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { isEditorInputWithOptions } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
/**
 * An implementation of editor for binary files that cannot be displayed.
 */
let BinaryFileEditor = class BinaryFileEditor extends BaseBinaryResourceEditor {
    static { BinaryFileEditor_1 = this; }
    static { this.ID = BINARY_FILE_EDITOR_ID; }
    constructor(group, telemetryService, themeService, editorResolverService, storageService) {
        super(BinaryFileEditor_1.ID, group, {
            openInternal: (input, options) => this.openInternal(input, options)
        }, telemetryService, themeService, storageService);
        this.editorResolverService = editorResolverService;
    }
    async openInternal(input, options) {
        if (input instanceof FileEditorInput && this.group.activeEditor) {
            // We operate on the active editor here to support re-opening
            // diff editors where `input` may just be one side of the
            // diff editor.
            // Since `openInternal` can only ever be selected from the
            // active editor of the group, this is a safe assumption.
            // (https://github.com/microsoft/vscode/issues/124222)
            const activeEditor = this.group.activeEditor;
            const untypedActiveEditor = activeEditor?.toUntyped();
            if (!untypedActiveEditor) {
                return; // we need untyped editor support
            }
            // Try to let the user pick an editor
            let resolvedEditor = await this.editorResolverService.resolveEditor({
                ...untypedActiveEditor,
                options: {
                    ...options,
                    override: EditorResolution.PICK
                }
            }, this.group);
            if (resolvedEditor === 2 /* ResolvedStatus.NONE */) {
                resolvedEditor = undefined;
            }
            else if (resolvedEditor === 1 /* ResolvedStatus.ABORT */) {
                return;
            }
            // If the result if a file editor, the user indicated to open
            // the binary file as text. As such we adjust the input for that.
            if (isEditorInputWithOptions(resolvedEditor)) {
                for (const editor of resolvedEditor.editor instanceof DiffEditorInput ? [resolvedEditor.editor.original, resolvedEditor.editor.modified] : [resolvedEditor.editor]) {
                    if (editor instanceof FileEditorInput) {
                        editor.setForceOpenAsText();
                        editor.setPreferredLanguageId(BINARY_TEXT_FILE_MODE); // https://github.com/microsoft/vscode/issues/131076
                    }
                }
            }
            // Replace the active editor with the picked one
            await this.group.replaceEditors([{
                    editor: activeEditor,
                    replacement: resolvedEditor?.editor ?? input,
                    options: {
                        ...resolvedEditor?.options ?? options
                    }
                }]);
        }
    }
    getTitle() {
        return this.input ? this.input.getName() : localize('binaryFileEditor', "Binary File Viewer");
    }
};
BinaryFileEditor = BinaryFileEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IEditorResolverService),
    __param(4, IStorageService)
], BinaryFileEditor);
export { BinaryFileEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmluYXJ5RmlsZUVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZWRpdG9ycy9iaW5hcnlGaWxlRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGdCQUFnQixFQUFrQixNQUFNLGlEQUFpRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxzQkFBc0IsRUFBa0MsTUFBTSw2REFBNkQsQ0FBQztBQUNySSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFHL0U7O0dBRUc7QUFDSSxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFpQixTQUFRLHdCQUF3Qjs7YUFFN0MsT0FBRSxHQUFHLHFCQUFxQixBQUF4QixDQUF5QjtJQUUzQyxZQUNDLEtBQW1CLEVBQ0EsZ0JBQW1DLEVBQ3ZDLFlBQTJCLEVBQ0QscUJBQTZDLEVBQ3JFLGNBQStCO1FBRWhELEtBQUssQ0FDSixrQkFB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