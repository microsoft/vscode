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
import * as nls from '../../../../nls.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { parseKeyboardLayoutDescription, areKeyboardLayoutsEqual, getKeyboardLayoutId, IKeyboardLayoutService } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { KEYBOARD_LAYOUT_OPEN_PICKER } from '../common/preferences.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
let KeyboardLayoutPickerContribution = class KeyboardLayoutPickerContribution extends Disposable {
    static { this.ID = 'workbench.contrib.keyboardLayoutPicker'; }
    constructor(keyboardLayoutService, statusbarService) {
        super();
        this.keyboardLayoutService = keyboardLayoutService;
        this.statusbarService = statusbarService;
        this.pickerElement = this._register(new MutableDisposable());
        const name = nls.localize('status.workbench.keyboardLayout', "Keyboard Layout");
        const layout = this.keyboardLayoutService.getCurrentKeyboardLayout();
        if (layout) {
            const layoutInfo = parseKeyboardLayoutDescription(layout);
            const text = nls.localize('keyboardLayout', "Layout: {0}", layoutInfo.label);
            this.pickerElement.value = this.statusbarService.addEntry({
                name,
                text,
                ariaLabel: text,
                command: KEYBOARD_LAYOUT_OPEN_PICKER
            }, 'status.workbench.keyboardLayout', 1 /* StatusbarAlignment.RIGHT */);
        }
        this._register(this.keyboardLayoutService.onDidChangeKeyboardLayout(() => {
            const layout = this.keyboardLayoutService.getCurrentKeyboardLayout();
            const layoutInfo = parseKeyboardLayoutDescription(layout);
            if (this.pickerElement.value) {
                const text = nls.localize('keyboardLayout', "Layout: {0}", layoutInfo.label);
                this.pickerElement.value.update({
                    name,
                    text,
                    ariaLabel: text,
                    command: KEYBOARD_LAYOUT_OPEN_PICKER
                });
            }
            else {
                const text = nls.localize('keyboardLayout', "Layout: {0}", layoutInfo.label);
                this.pickerElement.value = this.statusbarService.addEntry({
                    name,
                    text,
                    ariaLabel: text,
                    command: KEYBOARD_LAYOUT_OPEN_PICKER
                }, 'status.workbench.keyboardLayout', 1 /* StatusbarAlignment.RIGHT */);
            }
        }));
    }
};
KeyboardLayoutPickerContribution = __decorate([
    __param(0, IKeyboardLayoutService),
    __param(1, IStatusbarService)
], KeyboardLayoutPickerContribution);
export { KeyboardLayoutPickerContribution };
registerWorkbenchContribution2(KeyboardLayoutPickerContribution.ID, KeyboardLayoutPickerContribution, 1 /* WorkbenchPhase.BlockStartup */);
const DEFAULT_CONTENT = [
    `// ${nls.localize('displayLanguage', 'Defines the keyboard layout used in VS Code in the browser environment.')}`,
    `// ${nls.localize('doc', 'Open VS Code and run "Developer: Inspect Key Mappings (JSON)" from Command Palette.')}`,
    ``,
    `// Once you have the keyboard layout info, please paste it below.`,
    '\n'
].join('\n');
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: KEYBOARD_LAYOUT_OPEN_PICKER,
            title: nls.localize2('keyboard.chooseLayout', "Change Keyboard Layout"),
            f1: true
        });
    }
    async run(accessor) {
        const keyboardLayoutService = accessor.get(IKeyboardLayoutService);
        const quickInputService = accessor.get(IQuickInputService);
        const configurationService = accessor.get(IConfigurationService);
        const environmentService = accessor.get(IEnvironmentService);
        const editorService = accessor.get(IEditorService);
        const fileService = accessor.get(IFileService);
        const layouts = keyboardLayoutService.getAllKeyboardLayouts();
        const currentLayout = keyboardLayoutService.getCurrentKeyboardLayout();
        const layoutConfig = configurationService.getValue('keyboard.layout');
        const isAutoDetect = layoutConfig === 'autodetect';
        const picks = layouts.map(layout => {
            const picked = !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout);
            const layoutInfo = parseKeyboardLayoutDescription(layout);
            return {
                layout: layout,
                label: [layoutInfo.label, (layout && layout.isUserKeyboardLayout) ? '(User configured layout)' : ''].join(' '),
                id: layout.text || layout.lang || layout.layout,
                description: layoutInfo.description + (picked ? ' (Current layout)' : ''),
                picked: !isAutoDetect && areKeyboardLayoutsEqual(currentLayout, layout)
            };
        }).sort((a, b) => {
            return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
        });
        if (picks.length > 0) {
            const platform = isMacintosh ? 'Mac' : isWindows ? 'Win' : 'Linux';
            picks.unshift({ type: 'separator', label: nls.localize('layoutPicks', "Keyboard Layouts ({0})", platform) });
        }
        const configureKeyboardLayout = { label: nls.localize('configureKeyboardLayout', "Configure Keyboard Layout") };
        picks.unshift(configureKeyboardLayout);
        // Offer to "Auto Detect"
        const autoDetectMode = {
            label: nls.localize('autoDetect', "Auto Detect"),
            description: isAutoDetect ? `Current: ${parseKeyboardLayoutDescription(currentLayout).label}` : undefined,
            picked: isAutoDetect ? true : undefined
        };
        picks.unshift(autoDetectMode);
        const pick = await quickInputService.pick(picks, { placeHolder: nls.localize('pickKeyboardLayout', "Select Keyboard Layout"), matchOnDescription: true });
        if (!pick) {
            return;
        }
        if (pick === autoDetectMode) {
            // set keymap service to auto mode
            configurationService.updateValue('keyboard.layout', 'autodetect');
            return;
        }
        if (pick === configureKeyboardLayout) {
            const file = environmentService.keyboardLayoutResource;
            await fileService.stat(file).then(undefined, () => {
                return fileService.createFile(file, VSBuffer.fromString(DEFAULT_CONTENT));
            }).then((stat) => {
                if (!stat) {
                    return undefined;
                }
                return editorService.openEditor({
                    resource: stat.resource,
                    languageId: 'jsonc',
                    options: { pinned: true }
                });
            }, (error) => {
                throw new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", file.toString(), error));
            });
            return Promise.resolve();
        }
        configurationService.updateValue('keyboard.layout', getKeyboardLayoutId(pick.layout));
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5Ym9hcmRMYXlvdXRQaWNrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9icm93c2VyL2tleWJvYXJkTGF5b3V0UGlja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFzQixpQkFBaUIsRUFBMkIsTUFBTSxrREFBa0QsQ0FBQztBQUNsSSxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLDhCQUE4QixFQUFFLHVCQUF1QixFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUF1QixNQUFNLDhEQUE4RCxDQUFDO0FBQ3pNLE9BQU8sRUFBMEMsOEJBQThCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxSCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN2RSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdFLE9BQU8sRUFBa0Isa0JBQWtCLEVBQWtCLE1BQU0sc0RBQXNELENBQUM7QUFDMUgsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxt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