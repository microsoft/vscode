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
import { timeout } from '../../../base/common/async.js';
import { debounce } from '../../../base/common/decorators.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isWindows, platform } from '../../../base/common/platform.js';
const SHELL_EXECUTABLES = [
    'cmd.exe',
    'powershell.exe',
    'pwsh.exe',
    'bash.exe',
    'git-cmd.exe',
    'wsl.exe',
    'ubuntu.exe',
    'ubuntu1804.exe',
    'kali.exe',
    'debian.exe',
    'opensuse-42.exe',
    'sles-12.exe',
    'julia.exe',
    'nu.exe',
    'node.exe',
    'xonsh.exe',
];
const SHELL_EXECUTABLE_REGEXES = [
    /^python(\d(\.\d{0,2})?)?\.exe$/,
];
let windowsProcessTree;
export class WindowsShellHelper extends Disposable {
    get shellType() { return this._shellType; }
    get shellTitle() { return this._shellTitle; }
    get onShellNameChanged() { return this._onShellNameChanged.event; }
    get onShellTypeChanged() { return this._onShellTypeChanged.event; }
    constructor(_rootProcessId) {
        super();
        this._rootProcessId = _rootProcessId;
        this._shellTitle = '';
        this._onShellNameChanged = this._register(new Emitter());
        this._onShellTypeChanged = this._register(new Emitter());
        if (!isWindows) {
            throw new Error(`WindowsShellHelper cannot be instantiated on ${platform}`);
        }
        this._startMonitoringShell();
    }
    async _startMonitoringShell() {
        if (this._store.isDisposed) {
            return;
        }
        this.checkShell();
    }
    async checkShell() {
        if (isWindows) {
            // Wait to give the shell some time to actually launch a process, this
            // could lead to a race condition but it would be recovered from when
            // data stops and should cover the majority of cases
            await timeout(300);
            this.getShellName().then(title => {
                const type = this.getShellType(title);
                if (type !== this._shellType) {
                    this._onShellTypeChanged.fire(type);
                    this._onShellNameChanged.fire(title);
                    this._shellType = type;
                    this._shellTitle = title;
                }
            });
        }
    }
    traverseTree(tree) {
        if (!tree) {
            return '';
        }
        if (SHELL_EXECUTABLES.indexOf(tree.name) === -1) {
            return tree.name;
        }
        for (const regex of SHELL_EXECUTABLE_REGEXES) {
            if (tree.name.match(regex)) {
                return tree.name;
            }
        }
        if (!tree.children || tree.children.length === 0) {
            return tree.name;
        }
        let favouriteChild = 0;
        for (; favouriteChild < tree.children.length; favouriteChild++) {
            const child = tree.children[favouriteChild];
            if (!child.children || child.children.length === 0) {
                break;
            }
            if (child.children[0].name !== 'conhost.exe') {
                break;
            }
        }
        if (favouriteChild >= tree.children.length) {
            return tree.name;
        }
        return this.traverseTree(tree.children[favouriteChild]);
    }
    /**
     * Returns the innermost shell executable running in the terminal
     */
    async getShellName() {
        if (this._store.isDisposed) {
            return Promise.resolve('');
        }
        // Prevent multiple requests at once, instead return current request
        if (this._currentRequest) {
            return this._currentRequest;
        }
        if (!windowsProcessTree) {
            windowsProcessTree = await import('@vscode/windows-process-tree');
        }
        this._currentRequest = new Promise(resolve => {
            windowsProcessTree.getProcessTree(this._rootProcessId, tree => {
                const name = this.traverseTree(tree);
                this._currentRequest = undefined;
                resolve(name);
            });
        });
        return this._currentRequest;
    }
    getShellType(executable) {
        switch (executable.toLowerCase()) {
            case 'cmd.exe':
                return "cmd" /* WindowsShellType.CommandPrompt */;
            case 'powershell.exe':
            case 'pwsh.exe':
                return "pwsh" /* GeneralShellType.PowerShell */;
            case 'bash.exe':
            case 'git-cmd.exe':
                return "gitbash" /* WindowsShellType.GitBash */;
            case 'julia.exe':
                return "julia" /* GeneralShellType.Julia */;
            case 'node.exe':
                return "node" /* GeneralShellType.Node */;
            case 'nu.exe':
                return "nu" /* GeneralShellType.NuShell */;
            case 'xonsh.exe':
                return "xonsh" /* GeneralShellType.Xonsh */;
            case 'wsl.exe':
            case 'ubuntu.exe':
            case 'ubuntu1804.exe':
            case 'kali.exe':
            case 'debian.exe':
            case 'opensuse-42.exe':
            case 'sles-12.exe':
                return "wsl" /* WindowsShellType.Wsl */;
            default:
                if (executable.match(/python(\d(\.\d{0,2})?)?\.exe/)) {
                    return "python" /* GeneralShellType.Python */;
                }
                return undefined;
        }
    }
}
__decorate([
    debounce(500)
], WindowsShellHelper.prototype, "checkShell", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c1NoZWxsSGVscGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvbm9kZS93aW5kb3dzU2hlbGxIZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFXdkUsTUFBTSxpQkFBaUIsR0FBRztJQUN6QixTQUFTO0lBQ1QsZ0JBQWdCO0lBQ2hCLFVBQVU7SUFDVixVQUFVO0lBQ1YsYUFBYTtJQUNiLFNBQVM7SUFDVCxZQUFZO0lBQ1osZ0JBQWdCO0lBQ2hCLFVBQVU7SUFDVixZQUFZO0lBQ1osaUJBQWlCO0lBQ2pCLGFBQWE7SUFDYixXQUFXO0lBQ1gsUUFBUTtJQUNSLFVBQVU7SUFDVixXQUFXO0NBQ1gsQ0FBQztBQUVGLE1BQU0sd0JBQXdCLEdBQUc7SUFDaEMsZ0NBQWdDO0NBQ2hDLENBQUM7QUFFRixJQUFJLGtCQUFpRCxDQUFDO0FBRXRELE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxVQUFVO0lBR2pELElBQUksU0FBUyxLQUFvQyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBRTFFLElBQUksVUFBVSxLQUFhLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7SUFFckQsSUFBSSxrQkFBa0IsS0FBb0IsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FB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