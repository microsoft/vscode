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
var KeybindingsExportContribution_1;
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { join } from '../../../../base/common/path.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { MacLinuxKeyboardMapper } from '../../../services/keybinding/common/macLinuxKeyboardMapper.js';
import { WindowsKeyboardMapper } from '../../../services/keybinding/common/windowsKeyboardMapper.js';
import { KeymapInfo } from '../../../services/keybinding/common/keymapInfo.js';
import { EN_US_WIN_LAYOUT } from '../../../services/keybinding/browser/keyboardLayouts/en.win.js';
import { EN_US_DARWIN_LAYOUT } from '../../../services/keybinding/browser/keyboardLayouts/en.darwin.js';
import { EN_US_LINUX_LAYOUT } from '../../../services/keybinding/browser/keyboardLayouts/en.linux.js';
import { KeybindingIO, OutputBuilder } from '../../../services/keybinding/common/keybindingIO.js';
import { getAllUnboundCommands } from '../../../services/keybinding/browser/unboundCommands.js';
let KeybindingsExportContribution = class KeybindingsExportContribution extends Disposable {
    static { KeybindingsExportContribution_1 = this; }
    static { this.ID = 'workbench.contrib.keybindingsExport'; }
    constructor(nativeEnvironmentService, fileService, nativeHostService, productService, logService) {
        super();
        this.nativeEnvironmentService = nativeEnvironmentService;
        this.fileService = fileService;
        this.nativeHostService = nativeHostService;
        this.productService = productService;
        this.logService = logService;
        if (this.productService.quality === 'stable') {
            return;
        }
        const outputPath = this.nativeEnvironmentService.exportDefaultKeybindings;
        if (outputPath !== undefined) {
            const defaultPath = join(this.nativeEnvironmentService.appRoot, 'doc');
            void this.exportDefaultKeybindingsAndQuit(outputPath || defaultPath);
        }
    }
    async exportDefaultKeybindingsAndQuit(outputPath) {
        try {
            const platforms = [
                { os: 1 /* OperatingSystem.Windows */, filename: 'doc.keybindings.win.json' },
                { os: 2 /* OperatingSystem.Macintosh */, filename: 'doc.keybindings.osx.json' },
                { os: 3 /* OperatingSystem.Linux */, filename: 'doc.keybindings.linux.json' },
            ];
            for (const { os, filename } of platforms) {
                const content = KeybindingsExportContribution_1._getDefaultKeybindingsContentForOS(os);
                const filePath = join(outputPath, filename);
                await this.fileService.writeFile(URI.file(filePath), VSBuffer.fromString(content));
                this.logService.info(`[${KeybindingsExportContribution_1.ID}] Wrote ${filePath}`);
            }
            await this.nativeHostService.exit(0);
        }
        catch (error) {
            this.logService.error(`[${KeybindingsExportContribution_1.ID}] Failed to generate default keybindings`, error);
            await this.nativeHostService.exit(1);
        }
    }
    static _getDefaultKeybindingsContentForOS(os) {
        const items = KeybindingsRegistry.getDefaultKeybindingsForOS(os);
        const mapper = KeybindingsExportContribution_1._createKeyboardMapperForOS(os);
        const resolved = KeybindingsExportContribution_1._resolveKeybindingItemsWithMapper(items, mapper);
        const resolver = new KeybindingResolver(resolved, [], () => { });
        const defaultKeybindings = resolver.getDefaultKeybindings();
        const boundCommands = resolver.getDefaultBoundCommands();
        return (KeybindingsExportContribution_1._formatDefaultKeybindings(defaultKeybindings)
            + '\n\n'
            + KeybindingsExportContribution_1._formatAllCommandsAsComment(boundCommands));
    }
    static _createKeyboardMapperForOS(os) {
        const layoutMap = {
            [1 /* OperatingSystem.Windows */]: EN_US_WIN_LAYOUT,
            [2 /* OperatingSystem.Macintosh */]: EN_US_DARWIN_LAYOUT,
            [3 /* OperatingSystem.Linux */]: EN_US_LINUX_LAYOUT,
        };
        const layout = layoutMap[os];
        const keymapInfo = new KeymapInfo(layout.layout, layout.secondaryLayouts, layout.mapping);
        switch (os) {
            case 1 /* OperatingSystem.Windows */:
                return new WindowsKeyboardMapper(true, keymapInfo.mapping, false);
            case 2 /* OperatingSystem.Macintosh */:
                return new MacLinuxKeyboardMapper(true, keymapInfo.mapping, false, 2 /* OperatingSystem.Macintosh */);
            case 3 /* OperatingSystem.Linux */:
                return new MacLinuxKeyboardMapper(true, keymapInfo.mapping, false, 3 /* OperatingSystem.Linux */);
        }
    }
    static _resolveKeybindingItemsWithMapper(items, mapper) {
        const result = [];
        for (const item of items) {
            const when = item.when || undefined;
            const keybinding = item.keybinding;
            if (!keybinding) {
                result.push(new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, true, item.extensionId, item.isBuiltinExtension));
            }
            else {
                const resolvedKeybindings = mapper.resolveKeybinding(keybinding);
                for (let i = resolvedKeybindings.length - 1; i >= 0; i--) {
                    result.push(new ResolvedKeybindingItem(resolvedKeybindings[i], item.command, item.commandArgs, when, true, item.extensionId, item.isBuiltinExtension));
                }
            }
        }
        return result;
    }
    static _formatDefaultKeybindings(defaultKeybindings) {
        const out = new OutputBuilder();
        out.writeLine('[');
        const lastIndex = defaultKeybindings.length - 1;
        defaultKeybindings.forEach((k, index) => {
            KeybindingIO.writeKeybindingItem(out, k);
            if (index !== lastIndex) {
                out.writeLine(',');
            }
            else {
                out.writeLine();
            }
        });
        out.writeLine(']');
        return out.toString();
    }
    static _formatAllCommandsAsComment(boundCommands) {
        const unboundCommands = getAllUnboundCommands(boundCommands);
        const pretty = unboundCommands.sort().join('\n// - ');
        return '// Here are other available commands: ' + '\n// - ' + pretty;
    }
};
KeybindingsExportContribution = KeybindingsExportContribution_1 = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, IFileService),
    __param(2, INativeHostService),
    __param(3, IProductService),
    __param(4, ILogService)
], KeybindingsExportContribution);
export { KeybindingsExportContribution };
registerWorkbenchContribution2(KeybindingsExportContribution.ID, KeybindingsExportContribution, 4 /* WorkbenchPhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3NFeHBvcnQuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIva2V5YmluZGluZ3NFeHBvcnQvZWxlY3Ryb24tYnJvd3Nlci9rZXliaW5kaW5nc0V4cG9ydC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0sa0NBQWtDLENBQUM7QUFDMUgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFdkQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBbUIsbUJBQW1CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNySCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUcxRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUscUJB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