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
import { isCodeEditor, isDiffEditor, isCompositeEditor, getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { AbstractCodeEditorService } from '../../../../editor/browser/services/abstractCodeEditorService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../common/editorService.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { applyTextEditorOptions } from '../../../common/editor/editorOptions.js';
let CodeEditorService = class CodeEditorService extends AbstractCodeEditorService {
    constructor(editorService, themeService, configurationService) {
        super(themeService);
        this.editorService = editorService;
        this.configurationService = configurationService;
        this._register(this.registerCodeEditorOpenHandler(this.doOpenCodeEditor.bind(this)));
        this._register(this.registerCodeEditorOpenHandler(this.doOpenCodeEditorFromDiff.bind(this)));
    }
    getActiveCodeEditor() {
        const activeTextEditorControl = this.editorService.activeTextEditorControl;
        if (isCodeEditor(activeTextEditorControl)) {
            return activeTextEditorControl;
        }
        if (isDiffEditor(activeTextEditorControl)) {
            return activeTextEditorControl.getModifiedEditor();
        }
        const activeControl = this.editorService.activeEditorPane?.getControl();
        if (isCompositeEditor(activeControl) && isCodeEditor(activeControl.activeCodeEditor)) {
            return activeControl.activeCodeEditor;
        }
        return null;
    }
    async doOpenCodeEditorFromDiff(input, source, sideBySide) {
        // Special case: If the active editor is a diff editor and the request to open originates and
        // targets the modified side of it, we just apply the request there to prevent opening the modified
        // side as separate editor.
        const activeTextEditorControl = this.editorService.activeTextEditorControl;
        if (!sideBySide && // we need the current active group to be the target
            isDiffEditor(activeTextEditorControl) && // we only support this for active text diff editors
            input.options && // we need options to apply
            input.resource && // we need a request resource to compare with
            source === activeTextEditorControl.getModifiedEditor() && // we need the source of this request to be the modified side of the diff editor
            activeTextEditorControl.getModel() && // we need a target model to compare with
            isEqual(input.resource, activeTextEditorControl.getModel()?.modified.uri) // we need the input resources to match with modified side
        ) {
            const targetEditor = activeTextEditorControl.getModifiedEditor();
            applyTextEditorOptions(input.options, targetEditor, 0 /* ScrollType.Smooth */);
            return targetEditor;
        }
        return null;
    }
    // Open using our normal editor service
    async doOpenCodeEditor(input, source, sideBySide) {
        // Special case: we want to detect the request to open an editor that
        // is different from the current one to decide whether the current editor
        // should be pinned or not. This ensures that the source of a navigation
        // is not being replaced by the target. An example is "Goto definition"
        // that otherwise would replace the editor everytime the user navigates.
        const enablePreviewFromCodeNavigation = this.configurationService.getValue().workbench?.editor?.enablePreviewFromCodeNavigation;
        if (!enablePreviewFromCodeNavigation && // we only need to do this if the configuration requires it
            source && // we need to know the origin of the navigation
            !input.options?.pinned && // we only need to look at preview editors that open
            !sideBySide && // we only need to care if editor opens in same group
            !isEqual(source.getModel()?.uri, input.resource) // we only need to do this if the editor is about to change
        ) {
            for (const visiblePane of this.editorService.visibleEditorPanes) {
                if (getCodeEditor(visiblePane.getControl()) === source) {
                    visiblePane.group.pinEditor();
                    break;
                }
            }
        }
        // Open as editor
        const control = await this.editorService.openEditor(input, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
        if (control) {
            const widget = control.getControl();
            if (isCodeEditor(widget)) {
                return widget;
            }
            if (isCompositeEditor(widget) && isCodeEditor(widget.activeCodeEditor)) {
                return widget.activeCodeEditor;
            }
        }
        return null;
    }
};
CodeEditorService = __decorate([
    __param(0, IEditorService),
    __param(1, IThemeService),
    __param(2, IConfigurationService)
], CodeEditorService);
export { CodeEditorService };
registerSingleton(ICodeEditorService, CodeEditorService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUVkaXRvclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2Jyb3dzZXIvY29kZUVkaXRvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFlLFlBQVksRUFBRSxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDeEksT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFHN0csT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFMUUsSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBa0IsU0FBUSx5QkFBeUI7SUFFL0QsWUFDa0MsYUFBNkIsRUFDL0MsWUFBMkIsRUFDRixvQkFBMkM7UUFFbkYsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBSmEsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBRXRCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFJbkYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsSUFBSSxD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