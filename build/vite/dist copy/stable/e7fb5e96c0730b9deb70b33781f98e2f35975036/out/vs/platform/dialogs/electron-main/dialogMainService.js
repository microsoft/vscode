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
import electron from 'electron';
import { Queue } from '../../../base/common/async.js';
import { hash } from '../../../base/common/hash.js';
import { mnemonicButtonLabel } from '../../../base/common/labels.js';
import { Disposable, dispose, toDisposable } from '../../../base/common/lifecycle.js';
import { normalizeNFC } from '../../../base/common/normalization.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { Promises } from '../../../base/node/pfs.js';
import { localize } from '../../../nls.js';
import { massageMessageBoxOptions } from '../common/dialogs.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { WORKSPACE_FILTER } from '../../workspace/common/workspace.js';
export const IDialogMainService = createDecorator('dialogMainService');
let DialogMainService = class DialogMainService {
    constructor(logService, productService) {
        this.logService = logService;
        this.productService = productService;
        this.windowFileDialogLocks = new Map();
        this.windowDialogQueues = new Map();
        this.noWindowDialogueQueue = new Queue();
    }
    pickFileFolder(options, window) {
        return this.doPick({ ...options, pickFolders: true, pickFiles: true, title: localize('open', "Open") }, window);
    }
    pickFolder(options, window) {
        let optionsInternal = {
            ...options,
            pickFolders: true,
            title: localize('openFolder', "Open Folder")
        };
        if (isWindows) {
            // Due to Windows/Electron issue the labels on Open Folder dialog have no hot keys.
            // We can fix this here for the button label, but some other labels remain inaccessible.
            // See https://github.com/electron/electron/issues/48631 for more info.
            optionsInternal = {
                ...optionsInternal,
                buttonLabel: mnemonicButtonLabel(localize({ key: 'selectFolder', comment: ['&& denotes a mnemonic'] }, "&&Select folder")).withMnemonic
            };
        }
        return this.doPick(optionsInternal, window);
    }
    pickFile(options, window) {
        return this.doPick({ ...options, pickFiles: true, title: localize('openFile', "Open File") }, window);
    }
    pickWorkspace(options, window) {
        const title = localize('openWorkspaceTitle', "Open Workspace from File");
        const buttonLabel = mnemonicButtonLabel(localize({ key: 'openWorkspace', comment: ['&& denotes a mnemonic'] }, "&&Open")).withMnemonic;
        const filters = WORKSPACE_FILTER;
        return this.doPick({ ...options, pickFiles: true, title, filters, buttonLabel }, window);
    }
    async doPick(options, window) {
        // Ensure dialog options
        const dialogOptions = {
            title: options.title,
            buttonLabel: options.buttonLabel,
            filters: options.filters,
            defaultPath: options.defaultPath
        };
        // Ensure properties
        if (typeof options.pickFiles === 'boolean' || typeof options.pickFolders === 'boolean') {
            dialogOptions.properties = undefined; // let it override based on the booleans
            if (options.pickFiles && options.pickFolders) {
                dialogOptions.properties = ['multiSelections', 'openDirectory', 'openFile', 'createDirectory'];
            }
        }
        if (!dialogOptions.properties) {
            dialogOptions.properties = ['multiSelections', options.pickFolders ? 'openDirectory' : 'openFile', 'createDirectory'];
        }
        if (isMacintosh) {
            dialogOptions.properties.push('treatPackageAsDirectory'); // always drill into .app files
        }
        // Show Dialog
        const result = await this.showOpenDialog(dialogOptions, (window || electron.BrowserWindow.getFocusedWindow()) ?? undefined);
        if (result?.filePaths && result.filePaths.length > 0) {
            return result.filePaths;
        }
        return undefined;
    }
    getWindowDialogQueue(window) {
        // Queue message box requests per window so that one can show
        // after the other.
        if (window) {
            let windowDialogQueue = this.windowDialogQueues.get(window.id);
            if (!windowDialogQueue) {
                windowDialogQueue = new Queue();
                this.windowDialogQueues.set(window.id, windowDialogQueue);
            }
            return windowDialogQueue;
        }
        else {
            return this.noWindowDialogueQueue;
        }
    }
    showMessageBox(rawOptions, window) {
        return this.getWindowDialogQueue(window).queue(async () => {
            const { options, buttonIndeces } = massageMessageBoxOptions(rawOptions, this.productService);
            let result = undefined;
            if (window) {
                result = await electron.dialog.showMessageBox(window, options);
            }
            else {
                result = await electron.dialog.showMessageBox(options);
            }
            return {
                response: buttonIndeces[result.response],
                checkboxChecked: result.checkboxChecked
            };
        });
    }
    async showSaveDialog(options, window) {
        // Prevent duplicates of the same dialog queueing at the same time
        const fileDialogLock = this.acquireFileDialogLock(options, window);
        if (!fileDialogLock) {
            this.logService.error('[DialogMainService]: file save dialog is already or will be showing for the window with the same configuration');
            return { canceled: true, filePath: '' };
        }
        try {
            return await this.getWindowDialogQueue(window).queue(async () => {
                let result;
                if (window) {
                    result = await electron.dialog.showSaveDialog(window, options);
                }
                else {
                    result = await electron.dialog.showSaveDialog(options);
                }
                result.filePath = this.normalizePath(result.filePath);
                return result;
            });
        }
        finally {
            dispose(fileDialogLock);
        }
    }
    normalizePath(path) {
        if (path && isMacintosh) {
            path = normalizeNFC(path); // macOS only: normalize paths to NFC form
        }
        return path;
    }
    normalizePaths(paths) {
        return paths.map(path => this.normalizePath(path));
    }
    async showOpenDialog(options, window) {
        // Ensure the path exists (if provided)
        if (options.defaultPath) {
            const pathExists = await Promises.exists(options.defaultPath);
            if (!pathExists) {
                options.defaultPath = undefined;
            }
        }
        // Prevent duplicates of the same dialog queueing at the same time
        const fileDialogLock = this.acquireFileDialogLock(options, window);
        if (!fileDialogLock) {
            this.logService.error('[DialogMainService]: file open dialog is already or will be showing for the window with the same configuration');
            return { canceled: true, filePaths: [] };
        }
        try {
            return await this.getWindowDialogQueue(window).queue(async () => {
                let result;
                if (window) {
                    result = await electron.dialog.showOpenDialog(window, options);
                }
                else {
                    result = await electron.dialog.showOpenDialog(options);
                }
                result.filePaths = this.normalizePaths(result.filePaths);
                return result;
            });
        }
        finally {
            dispose(fileDialogLock);
        }
    }
    acquireFileDialogLock(options, window) {
        // If no window is provided, allow as many dialogs as
        // needed since we consider them not modal per window
        if (!window) {
            return Disposable.None;
        }
        // If a window is provided, only allow a single dialog
        // at the same time because dialogs are modal and we
        // do not want to open one dialog after the other
        // (https://github.com/microsoft/vscode/issues/114432)
        // we figure this out by `hashing` the configuration
        // options for the dialog to prevent duplicates
        this.logService.trace('[DialogMainService]: request to acquire file dialog lock', options);
        let windowFileDialogLocks = this.windowFileDialogLocks.get(window.id);
        if (!windowFileDialogLocks) {
            windowFileDialogLocks = new Set();
            this.windowFileDialogLocks.set(window.id, windowFileDialogLocks);
        }
        const optionsHash = hash(options);
        if (windowFileDialogLocks.has(optionsHash)) {
            return undefined; // prevent duplicates, return
        }
        this.logService.trace('[DialogMainService]: new file dialog lock created', options);
        windowFileDialogLocks.add(optionsHash);
        return toDisposable(() => {
            this.logService.trace('[DialogMainService]: file dialog lock disposed', options);
            windowFileDialogLocks?.delete(optionsHash);
            // If the window has no more dialog locks, delete it from the set of locks
            if (windowFileDialogLocks?.size === 0) {
                this.windowFileDialogLocks.delete(window.id);
            }
        });
    }
};
DialogMainService = __decorate([
    __param(0, ILogService),
    __param(1, IProductService)
], DialogMainService);
export { DialogMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9nTWFpblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9kaWFsb2dzL2VsZWN0cm9uLW1haW4vZGlhbG9nTWFpblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxRQUFRLE1BQU0sVUFBVSxDQUFDO0FBQ2hDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQTRCLHdCQUF3QixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFdkUsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFxQixtQkFBbUIsQ0FBQyxDQUFD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