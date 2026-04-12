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
import { localize, localize2 } from '../../../../../nls.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { AbstractGotoLineQuickAccessProvider } from '../../../../../editor/contrib/quickAccess/browser/gotoLineQuickAccess.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as QuickAccessExtensions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
let GotoLineQuickAccessProvider = class GotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {
    constructor(editorService, configurationService, storageService) {
        super();
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.storageService = storageService;
        this.onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;
    }
    get configuration() {
        const editorConfig = this.configurationService.getValue().workbench?.editor;
        return {
            openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview
        };
    }
    get activeTextEditorControl() {
        return this.editorService.activeTextEditorControl;
    }
    gotoLocation(context, options) {
        // Check for sideBySide use
        if ((options.keyMods.alt || (this.configuration.openEditorPinned && options.keyMods.ctrlCmd) || options.forceSideBySide) && this.editorService.activeEditor) {
            context.restoreViewState?.(); // since we open to the side, restore view state in this editor
            const editorOptions = {
                selection: options.range,
                pinned: options.keyMods.ctrlCmd || this.configuration.openEditorPinned,
                preserveFocus: options.preserveFocus
            };
            this.editorService.openEditor(this.editorService.activeEditor, editorOptions, SIDE_GROUP);
        }
        // Otherwise let parent handle it
        else {
            super.gotoLocation(context, options);
        }
    }
};
GotoLineQuickAccessProvider = __decorate([
    __param(0, IEditorService),
    __param(1, IConfigurationService),
    __param(2, IStorageService)
], GotoLineQuickAccessProvider);
export { GotoLineQuickAccessProvider };
class GotoLineAction extends Action2 {
    static { this.ID = 'workbench.action.gotoLine'; }
    constructor() {
        super({
            id: GotoLineAction.ID,
            title: localize2('gotoLine', 'Go to Line/Column...'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: null,
                primary: 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 37 /* KeyCode.KeyG */ }
            }
        });
    }
    async run(accessor) {
        accessor.get(IQuickInputService).quickAccess.show(GotoLineQuickAccessProvider.GO_TO_LINE_PREFIX);
    }
}
registerAction2(GotoLineAction);
Registry.as(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
    ctor: GotoLineQuickAccessProvider,
    prefix: AbstractGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX,
    placeholder: localize('gotoLineQuickAccessPlaceholder', "Type the line number and optional column to go to (e.g. :42:5 for line 42, column 5). Type :: to go to a character offset (e.g. ::1024 for character 1024 from the start of the file). Use negative values to navigate backwards."),
    helpEntries: [{ description: localize('gotoLineQuickAccess', "Go to Line/Column"), commandId: GotoLineAction.ID }]
});
class GotoOffsetAction extends Action2 {
    static { this.ID = 'workbench.action.gotoOffset'; }
    constructor() {
        super({
            id: GotoOffsetAction.ID,
            title: localize2('gotoOffset', 'Go to Offset...'),
            f1: true
        });
    }
    async run(accessor) {
        accessor.get(IQuickInputService).quickAccess.show(GotoLineQuickAccessProvider.GO_TO_OFFSET_PREFIX);
    }
}
registerAction2(GotoOffsetAction);
Registry.as(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
    ctor: GotoLineQuickAccessProvider,
    prefix: GotoLineQuickAccessProvider.GO_TO_OFFSET_PREFIX,
    placeholder: localize('gotoLineQuickAccessPlaceholder', "Type the line number and optional column to go to (e.g. :42:5 for line 42, column 5). Type :: to go to a character offset (e.g. ::1024 for character 1024 from the start of the file). Use negative values to navigate backwards."),
    helpEntries: [{ description: localize('gotoOffsetQuickAccess', "Go to Offset"), commandId: GotoOffsetAction.ID }]
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ290b0xpbmVRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9xdWlja2FjY2Vzcy9nb3RvTGluZVF1aWNrQWNjZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFZLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDdkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUVqRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUMvSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUF3QixVQUFVLElBQUkscUJBQXFCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNySSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBTTdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUU3RSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLG1DQUFtQztJQUluRixZQUNrQyxhQUE2QixFQUN0QixvQkFBMkMsRUFDdEMsY0FBK0I7UUFFNUUsS0FBSyxFQUFFLENBQUM7UUFKeUIsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQ3RCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDdEMsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBRzVFLElBQUksQ0FBQyxrQ0FBa0MsR0FBRyxJ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