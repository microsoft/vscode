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
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { env } from '../../../../../base/common/process.js';
import { isNumber } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileOperationError, IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
var Constants;
(function (Constants) {
    Constants[Constants["DefaultHistoryLimit"] = 100] = "DefaultHistoryLimit";
})(Constants || (Constants = {}));
var StorageKeys;
(function (StorageKeys) {
    StorageKeys["Entries"] = "terminal.history.entries";
    StorageKeys["Timestamp"] = "terminal.history.timestamp";
})(StorageKeys || (StorageKeys = {}));
let directoryHistory = undefined;
export function getDirectoryHistory(accessor) {
    if (!directoryHistory) {
        directoryHistory = accessor.get(IInstantiationService).createInstance(TerminalPersistedHistory, 'dirs');
    }
    return directoryHistory;
}
let commandHistory = undefined;
export function getCommandHistory(accessor) {
    if (!commandHistory) {
        commandHistory = accessor.get(IInstantiationService).createInstance(TerminalPersistedHistory, 'commands');
    }
    return commandHistory;
}
let TerminalPersistedHistory = class TerminalPersistedHistory extends Disposable {
    get entries() {
        this._ensureUpToDate();
        return this._entries.entries();
    }
    constructor(_storageDataKey, _configurationService, _storageService) {
        super();
        this._storageDataKey = _storageDataKey;
        this._configurationService = _configurationService;
        this._storageService = _storageService;
        this._timestamp = 0;
        this._isReady = false;
        this._isStale = true;
        // Init cache
        this._entries = new LRUCache(this._getHistoryLimit());
        // Listen for config changes to set history limit
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.shellIntegration.history" /* TerminalHistorySettingId.ShellIntegrationCommandHistory */)) {
                this._entries.limit = this._getHistoryLimit();
            }
        }));
        // Listen to cache changes from other windows
        this._register(this._storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, this._getTimestampStorageKey(), this._store)(() => {
            if (!this._isStale) {
                this._isStale = this._storageService.getNumber(this._getTimestampStorageKey(), -1 /* StorageScope.APPLICATION */, 0) !== this._timestamp;
            }
        }));
    }
    add(key, value) {
        this._ensureUpToDate();
        this._entries.set(key, value);
        this._saveState();
    }
    remove(key) {
        this._ensureUpToDate();
        this._entries.delete(key);
        this._saveState();
    }
    clear() {
        this._ensureUpToDate();
        this._entries.clear();
        this._saveState();
    }
    _ensureUpToDate() {
        // Initial load
        if (!this._isReady) {
            this._loadState();
            this._isReady = true;
        }
        // React to stale cache caused by another window
        if (this._isStale) {
            // Since state is saved whenever the entries change, it's a safe assumption that no
            // merging of entries needs to happen, just loading the new state.
            this._entries.clear();
            this._loadState();
            this._isStale = false;
        }
    }
    _loadState() {
        this._timestamp = this._storageService.getNumber(this._getTimestampStorageKey(), -1 /* StorageScope.APPLICATION */, 0);
        // Load global entries plus
        const serialized = this._loadPersistedState();
        if (serialized) {
            for (const entry of serialized.entries) {
                this._entries.set(entry.key, entry.value);
            }
        }
    }
    _loadPersistedState() {
        const raw = this._storageService.get(this._getEntriesStorageKey(), -1 /* StorageScope.APPLICATION */);
        if (raw === undefined || raw.length === 0) {
            return undefined;
        }
        let serialized = undefined;
        try {
            serialized = JSON.parse(raw);
        }
        catch {
            // Invalid data
            return undefined;
        }
        return serialized;
    }
    _saveState() {
        const serialized = { entries: [] };
        this._entries.forEach((value, key) => serialized.entries.push({ key, value }));
        this._storageService.store(this._getEntriesStorageKey(), JSON.stringify(serialized), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        this._timestamp = Date.now();
        this._storageService.store(this._getTimestampStorageKey(), this._timestamp, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    _getHistoryLimit() {
        const historyLimit = this._configurationService.getValue("terminal.integrated.shellIntegration.history" /* TerminalHistorySettingId.ShellIntegrationCommandHistory */);
        return isNumber(historyLimit) ? historyLimit : 100 /* Constants.DefaultHistoryLimit */;
    }
    _getTimestampStorageKey() {
        return `${"terminal.history.timestamp" /* StorageKeys.Timestamp */}.${this._storageDataKey}`;
    }
    _getEntriesStorageKey() {
        return `${"terminal.history.entries" /* StorageKeys.Entries */}.${this._storageDataKey}`;
    }
};
TerminalPersistedHistory = __decorate([
    __param(1, IConfigurationService),
    __param(2, IStorageService)
], TerminalPersistedHistory);
export { TerminalPersistedHistory };
const shellFileHistory = new Map();
export async function getShellFileHistory(accessor, shellType) {
    const cached = shellFileHistory.get(shellType);
    if (cached === null) {
        return undefined;
    }
    if (cached !== undefined) {
        return cached;
    }
    let result;
    switch (shellType) {
        case "bash" /* PosixShellType.Bash */:
            result = await fetchBashHistory(accessor);
            break;
        case "pwsh" /* GeneralShellType.PowerShell */:
            result = await fetchPwshHistory(accessor);
            break;
        case "zsh" /* PosixShellType.Zsh */:
            result = await fetchZshHistory(accessor);
            break;
        case "fish" /* PosixShellType.Fish */:
            result = await fetchFishHistory(accessor);
            break;
        case "python" /* GeneralShellType.Python */:
            result = await fetchPythonHistory(accessor);
            break;
        default: return undefined;
    }
    if (result === undefined) {
        shellFileHistory.set(shellType, null);
        return undefined;
    }
    shellFileHistory.set(shellType, result);
    return result;
}
export function clearShellFileHistory() {
    shellFileHistory.clear();
}
export async function fetchBashHistory(accessor) {
    const fileService = accessor.get(IFileService);
    const remoteAgentService = accessor.get(IRemoteAgentService);
    const remoteEnvironment = await remoteAgentService.getEnvironment();
    if (remoteEnvironment?.os === 1 /* OperatingSystem.Windows */ || !remoteEnvironment && isWindows) {
        return undefined;
    }
    const sourceLabel = '~/.bash_history';
    const home = remoteEnvironment?.userHome?.fsPath ?? env['HOME'];
    const resolvedFile = await fetchFileContents(home, '.bash_history', false, fileService, remoteAgentService);
    if (resolvedFile === undefined) {
        return undefined;
    }
    // .bash_history does not differentiate wrapped commands from multiple commands. Parse
    // the output to get the
    const fileLines = resolvedFile.content.split('\n');
    const result = new Set();
    let currentLine;
    let currentCommand = undefined;
    let wrapChar = undefined;
    for (let i = 0; i < fileLines.length; i++) {
        currentLine = fileLines[i];
        if (currentCommand === undefined) {
            currentCommand = currentLine;
        }
        else {
            currentCommand += `\n${currentLine}`;
        }
        for (let c = 0; c < currentLine.length; c++) {
            if (wrapChar) {
                if (currentLine[c] === wrapChar) {
                    wrapChar = undefined;
                }
            }
            else {
                if (currentLine[c].match(/['"]/)) {
                    wrapChar = currentLine[c];
                }
            }
        }
        if (wrapChar === undefined) {
            if (currentCommand.length > 0) {
                result.add(currentCommand.trim());
            }
            currentCommand = undefined;
        }
    }
    return {
        sourceLabel,
        sourceResource: resolvedFile.resource,
        commands: Array.from(result.values())
    };
}
export async function fetchZshHistory(accessor) {
    const fileService = accessor.get(IFileService);
    const remoteAgentService = accessor.get(IRemoteAgentService);
    const remoteEnvironment = await remoteAgentService.getEnvironment();
    if (remoteEnvironment?.os === 1 /* OperatingSystem.Windows */ || !remoteEnvironment && isWindows) {
        return undefined;
    }
    const sourceLabel = '~/.zsh_history';
    const home = remoteEnvironment?.userHome?.fsPath ?? env['HOME'];
    const resolvedFile = await fetchFileContents(home, '.zsh_history', false, fileService, remoteAgentService);
    if (resolvedFile === undefined) {
        return undefined;
    }
    const isExtendedHistory = /^:\s\d+:\d+;/.test(resolvedFile.content);
    const fileLines = resolvedFile.content.split(isExtendedHistory ? /\:\s\d+\:\d+;/ : /(?<!\\)\n/);
    const result = new Set();
    for (let i = 0; i < fileLines.length; i++) {
        const sanitized = fileLines[i].replace(/\\\n/g, '\n').trim();
        if (sanitized.length > 0) {
            result.add(sanitized);
        }
    }
    return {
        sourceLabel,
        sourceResource: resolvedFile.resource,
        commands: Array.from(result.values())
    };
}
export async function fetchPythonHistory(accessor) {
    const fileService = accessor.get(IFileService);
    const remoteAgentService = accessor.get(IRemoteAgentService);
    const remoteEnvironment = await remoteAgentService.getEnvironment();
    const sourceLabel = '~/.python_history';
    const home = remoteEnvironment?.userHome?.fsPath ?? env['HOME'];
    const resolvedFile = await fetchFileContents(home, '.python_history', false, fileService, remoteAgentService);
    if (resolvedFile === undefined) {
        return undefined;
    }
    // Python history file is a simple text file with one command per line
    const fileLines = resolvedFile.content.split('\n');
    const result = new Set();
    fileLines.forEach(line => {
        if (line.trim().length > 0) {
            result.add(line.trim());
        }
    });
    return {
        sourceLabel,
        sourceResource: resolvedFile.resource,
        commands: Array.from(result.values())
    };
}
export async function fetchPwshHistory(accessor) {
    const fileService = accessor.get(IFileService);
    const remoteAgentService = accessor.get(IRemoteAgentService);
    let folderPrefix;
    let filePath;
    const remoteEnvironment = await remoteAgentService.getEnvironment();
    const isFileWindows = remoteEnvironment?.os === 1 /* OperatingSystem.Windows */ || !remoteEnvironment && isWindows;
    let sourceLabel;
    if (isFileWindows) {
        folderPrefix = env['APPDATA'];
        filePath = 'Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt';
        sourceLabel = `$APPDATA\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt`;
    }
    else {
        folderPrefix = remoteEnvironment?.userHome?.fsPath ?? env['HOME'];
        filePath = '.local/share/powershell/PSReadline/ConsoleHost_history.txt';
        sourceLabel = `~/${filePath}`;
    }
    const resolvedFile = await fetchFileContents(folderPrefix, filePath, isFileWindows, fileService, remoteAgentService);
    if (resolvedFile === undefined) {
        return undefined;
    }
    const fileLines = resolvedFile.content.split('\n');
    const result = new Set();
    let currentLine;
    let currentCommand = undefined;
    let wrapChar = undefined;
    for (let i = 0; i < fileLines.length; i++) {
        currentLine = fileLines[i];
        if (currentCommand === undefined) {
            currentCommand = currentLine;
        }
        else {
            currentCommand += `\n${currentLine}`;
        }
        if (!currentLine.endsWith('`')) {
            const sanitized = currentCommand.trim();
            if (sanitized.length > 0) {
                result.add(sanitized);
            }
            currentCommand = undefined;
            continue;
        }
        // If the line ends with `, the line may be wrapped. Need to also test the case where ` is
        // the last character in the line
        for (let c = 0; c < currentLine.length; c++) {
            if (wrapChar) {
                if (currentLine[c] === wrapChar) {
                    wrapChar = undefined;
                }
            }
            else {
                if (currentLine[c].match(/`/)) {
                    wrapChar = currentLine[c];
                }
            }
        }
        // Having an even number of backticks means the line is terminated
        // TODO: This doesn't cover more complicated cases where ` is within quotes
        if (!wrapChar) {
            const sanitized = currentCommand.trim();
            if (sanitized.length > 0) {
                result.add(sanitized);
            }
            currentCommand = undefined;
        }
        else {
            // Remove trailing backtick
            currentCommand = currentCommand.replace(/`$/, '');
            wrapChar = undefined;
        }
    }
    return {
        sourceLabel,
        sourceResource: resolvedFile.resource,
        commands: Array.from(result.values())
    };
}
export async function fetchFishHistory(accessor) {
    const fileService = accessor.get(IFileService);
    const remoteAgentService = accessor.get(IRemoteAgentService);
    const remoteEnvironment = await remoteAgentService.getEnvironment();
    if (remoteEnvironment?.os === 1 /* OperatingSystem.Windows */ || !remoteEnvironment && isWindows) {
        return undefined;
    }
    /**
     * From `fish` docs:
     * > The command history is stored in the file ~/.local/share/fish/fish_history
     *   (or $XDG_DATA_HOME/fish/fish_history if that variable is set) by default.
     *
     * (https://fishshell.com/docs/current/interactive.html#history-search)
     */
    const overridenDataHome = env['XDG_DATA_HOME'];
    // TODO: Unchecked fish behavior:
    // What if XDG_DATA_HOME was defined but somehow $XDG_DATA_HOME/fish/fish_history
    // was not exist. Does fish fall back to ~/.local/share/fish/fish_history?
    let folderPrefix;
    let filePath;
    let sourceLabel;
    if (overridenDataHome) {
        sourceLabel = '$XDG_DATA_HOME/fish/fish_history';
        folderPrefix = env['XDG_DATA_HOME'];
        filePath = 'fish/fish_history';
    }
    else {
        sourceLabel = '~/.local/share/fish/fish_history';
        folderPrefix = remoteEnvironment?.userHome?.fsPath ?? env['HOME'];
        filePath = '.local/share/fish/fish_history';
    }
    const resolvedFile = await fetchFileContents(folderPrefix, filePath, false, fileService, remoteAgentService);
    if (resolvedFile === undefined) {
        return undefined;
    }
    /**
     * These apply to `fish` v3.5.1:
     * - It looks like YAML but it's not. It's, quoting, *"a broken psuedo-YAML"*.
     *   See these discussions for more details:
     *   - https://github.com/fish-shell/fish-shell/pull/6493
     *   - https://github.com/fish-shell/fish-shell/issues/3341
     * - Every record should exactly start with `- cmd:` (the whitespace between `-` and `cmd` cannot be replaced with tab)
     * - Both `- cmd: echo 1` and `- cmd:echo 1` are valid entries.
     * - Backslashes are esacped as `\\`.
     * - Multiline commands are joined with a `\n` sequence, hence they're read as single line commands.
     * - Property `when` is optional.
     * - History navigation respects the records order and ignore the actual `when` property values (chronological order).
     * - If `cmd` value is multiline , it just takes the first line. Also YAML operators like `>-` or `|-` are not supported.
     */
    const result = new Set();
    const cmds = resolvedFile.content.split('\n')
        .filter(x => x.startsWith('- cmd:'))
        .map(x => x.substring(6).trimStart());
    for (let i = 0; i < cmds.length; i++) {
        const sanitized = sanitizeFishHistoryCmd(cmds[i]).trim();
        if (sanitized.length > 0) {
            result.add(sanitized);
        }
    }
    return {
        sourceLabel,
        sourceResource: resolvedFile.resource,
        commands: Array.from(result.values())
    };
}
export function sanitizeFishHistoryCmd(cmd) {
    /**
     * NOTE
     * This repeatedReplace() call can be eliminated by using look-ahead
     * caluses in the original RegExp pattern:
     *
     * >>> ```ts
     * >>> cmds[i].replace(/(?<=^|[^\\])((?:\\\\)*)(\\n)/g, '$1\n')
     * >>> ```
     *
     * But since not all browsers support look aheads we opted to a simple
     * pattern and repeatedly calling replace method.
     */
    return repeatedReplace(/(^|[^\\])((?:\\\\)*)(\\n)/g, cmd, '$1$2\n');
}
function repeatedReplace(pattern, value, replaceValue) {
    let last;
    let current = value;
    while (true) {
        last = current;
        current = current.replace(pattern, replaceValue);
        if (current === last) {
            return current;
        }
    }
}
async function fetchFileContents(folderPrefix, filePath, isFileWindows, fileService, remoteAgentService) {
    if (!folderPrefix) {
        return undefined;
    }
    const connection = remoteAgentService.getConnection();
    const isRemote = !!connection?.remoteAuthority;
    const resource = URI.from({
        scheme: isRemote ? Schemas.vscodeRemote : Schemas.file,
        authority: isRemote ? connection.remoteAuthority : undefined,
        path: URI.file(join(folderPrefix, filePath)).path
    });
    let content;
    try {
        content = await fileService.readFile(resource);
    }
    catch (e) {
        // Handle file not found only
        if (e instanceof FileOperationError && e.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
            return undefined;
        }
        throw e;
    }
    if (content === undefined) {
        return undefined;
    }
    return {
        resource,
        content: content.value.toString()
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGlzdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsU0FBUyxFQUFtQixNQUFNLHdDQUF3QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBcUMsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDcEksT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFFakgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUE2Qi9GLElBQVcsU0FFVjtBQUZELFdBQVcsU0FBUztJQUNuQix5RUFBeUIsQ0FBQTtBQUMxQixDQUFDLEVBRlUsU0FBUyxLQUFULFNBQVMsUUFFbkI7QUFFRCxJQUFXLFdBR1Y7QUFIRCxX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