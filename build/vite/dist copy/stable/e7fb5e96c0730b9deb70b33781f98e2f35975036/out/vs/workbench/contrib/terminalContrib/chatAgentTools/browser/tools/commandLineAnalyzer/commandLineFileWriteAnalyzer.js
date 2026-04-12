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
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { win32, posix } from '../../../../../../../base/common/path.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { isString } from '../../../../../../../base/common/types.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
const nullDevice = Symbol('null device');
let CommandLineFileWriteAnalyzer = class CommandLineFileWriteAnalyzer extends Disposable {
    constructor(_treeSitterCommandParser, _log, _configurationService, _labelService, _workspaceContextService) {
        super();
        this._treeSitterCommandParser = _treeSitterCommandParser;
        this._log = _log;
        this._configurationService = _configurationService;
        this._labelService = _labelService;
        this._workspaceContextService = _workspaceContextService;
    }
    async analyze(options) {
        let fileWrites;
        try {
            fileWrites = await this._getFileWrites(options);
        }
        catch (e) {
            console.error(e);
            this._log('Failed to get file writes via grammar', options.treeSitterLanguage);
            return {
                isAutoApproveAllowed: false
            };
        }
        return this._getResult(options, fileWrites);
    }
    async _getFileWrites(options) {
        let fileWrites = [];
        // Get file writes from redirections (via tree-sitter grammar)
        const capturedFileWrites = (await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine))
            .map(this._mapNullDevice.bind(this, options));
        // Get file writes from command-specific parsers (e.g., sed -i in-place editing)
        const commandFileWrites = (await this._treeSitterCommandParser.getCommandFileWrites(options.treeSitterLanguage, options.commandLine))
            .map(this._mapNullDevice.bind(this, options));
        const allCapturedFileWrites = [...capturedFileWrites, ...commandFileWrites];
        if (allCapturedFileWrites.length) {
            const cwd = options.cwd;
            if (cwd) {
                this._log('Detected cwd', cwd.toString());
                fileWrites = allCapturedFileWrites.map(e => {
                    if (e === nullDevice) {
                        return e;
                    }
                    // Surrounding quotes where it's difficult to determine whether this is absolute
                    // or relative
                    if (/^['"].*['"]$/.test(e)) {
                        // Strip surrounding quotes to get a more reasonable view of the path. Note
                        // that this may not get the real file in the case of inner quotes, but the
                        // important thing here is the resolving whether it's absolute or not.
                        e = this._stripSurroundingQuotes(e);
                    }
                    // Absolute
                    const isAbsolute = options.os === 1 /* OperatingSystem.Windows */ ? win32.isAbsolute(e) : posix.isAbsolute(e);
                    if (isAbsolute) {
                        // Ensure cwd's scheme and authority is retained
                        return cwd.with({ path: e });
                    }
                    // Relative
                    return URI.joinPath(cwd, e);
                });
            }
            else {
                this._log('Cwd could not be detected');
                fileWrites = allCapturedFileWrites;
            }
        }
        this._log('File writes detected', fileWrites.map(e => e.toString()));
        return fileWrites;
    }
    _stripSurroundingQuotes(text) {
        if ((text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith('\'') && text.endsWith('\''))) {
            return text.slice(1, -1);
        }
        return text;
    }
    _mapNullDevice(options, rawFileWrite) {
        if (options.treeSitterLanguage === "powershell" /* TreeSitterCommandParserLanguage.PowerShell */) {
            return rawFileWrite === '$null'
                ? nullDevice
                : rawFileWrite;
        }
        return rawFileWrite === '/dev/null'
            ? nullDevice
            : rawFileWrite;
    }
    _getResult(options, fileWrites) {
        let isAutoApproveAllowed = true;
        if (fileWrites.length > 0) {
            const blockDetectedFileWrites = this._configurationService.getValue("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */);
            switch (blockDetectedFileWrites) {
                case 'all': {
                    isAutoApproveAllowed = false;
                    this._log('File writes blocked due to "all" setting');
                    break;
                }
                case 'outsideWorkspace': {
                    const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
                    if (workspaceFolders.length > 0) {
                        for (const fileWrite of fileWrites) {
                            if (fileWrite === nullDevice) {
                                this._log('File write to null device allowed', URI.isUri(fileWrite) ? fileWrite.toString() : fileWrite);
                                continue;
                            }
                            if (isString(fileWrite)) {
                                const isAbsolute = options.os === 1 /* OperatingSystem.Windows */ ? win32.isAbsolute(fileWrite) : posix.isAbsolute(fileWrite);
                                if (!isAbsolute) {
                                    isAutoApproveAllowed = false;
                                    this._log('File write blocked due to unknown terminal cwd', fileWrite);
                                    break;
                                }
                            }
                            const fileUri = URI.isUri(fileWrite) ? fileWrite : URI.file(fileWrite);
                            // TODO: Handle command substitutions/complex destinations properly https://github.com/microsoft/vscode/issues/274167
                            // TODO: Handle environment variables properly https://github.com/microsoft/vscode/issues/274166
                            if (fileUri.fsPath.match(/[$\(\){}`]/)) {
                                isAutoApproveAllowed = false;
                                this._log('File write blocked due to likely containing a variable or sub-command', fileUri.toString());
                                break;
                            }
                            const isInsideWorkspace = workspaceFolders.some(folder => folder.uri.scheme === fileUri.scheme &&
                                (fileUri.path.startsWith(folder.uri.path + '/') || fileUri.path === folder.uri.path));
                            if (!isInsideWorkspace) {
                                isAutoApproveAllowed = false;
                                this._log('File write blocked outside workspace', fileUri.toString());
                                break;
                            }
                        }
                    }
                    else {
                        // No workspace folders, allow safe null device paths even without workspace
                        const hasOnlyNullDevices = fileWrites.every(fw => fw === nullDevice);
                        if (!hasOnlyNullDevices) {
                            isAutoApproveAllowed = false;
                            this._log('File writes blocked - no workspace folders');
                        }
                    }
                    break;
                }
                case 'never':
                default: {
                    break;
                }
            }
        }
        const disclaimers = [];
        if (fileWrites.length > 0) {
            const fileWritesList = fileWrites.map(fw => `\`${URI.isUri(fw) ? this._labelService.getUriLabel(fw) : fw === nullDevice ? '/dev/null' : fw.toString()}\``).join(', ');
            if (!isAutoApproveAllowed) {
                disclaimers.push(localize('runInTerminal.fileWriteBlockedDisclaimer', 'File write operations detected that cannot be auto approved: {0}', fileWritesList));
            }
            else {
                disclaimers.push(localize('runInTerminal.fileWriteDisclaimer', 'File write operations detected: {0}', fileWritesList));
            }
        }
        return {
            isAutoApproveAllowed,
            disclaimers,
        };
    }
};
CommandLineFileWriteAnalyzer = __decorate([
    __param(2, IConfigurationService),
    __param(3, ILabelService),
    __param(4, IWorkspaceContextService)
], CommandLineFileWriteAnalyzer);
export { CommandLineFileWriteAnalyzer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVGaWxlV3JpdGVBbmFseXplci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVGaWxlV3JpdGVBbmFseXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBS3ZHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFcEYsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBSWxDLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTtJQUMzRCxZQUNrQix3QkFBaUQsRUFDakQsSUFBbUQsRUFDNUIscUJBQTRDLEVBQ3BELGFBQTRCLEVBQ2pCLHdCQUFrRDtRQUU3RixLQUFLLEVBQUUsQ0FBQztRQU5TLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBeUI7UUFDakQsU0FBSSxHQUFKLElBQUksQ0FBK0M7UUFDNUIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUNwRCxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUNqQiw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTBCO0lBRzlGLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQW9DO1FBQ2pELElBQUksVUFBdUIsQ0FBQztRQUM1QixJQUFJLENBQUM7WUFDSixVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqQixJQUFJLENBQUMsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQy9FLE9BQU87Z0JBQ04sb0JBQW9CLEVBQUUsS0FBSzthQUMzQixDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBb0M7UUFDaEUsSUFBSSxVQUFVLEdBQWdCLEVBQUUsQ0FBQztRQUVqQyw4REFBOEQ7UUFDOUQsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2FBQzdILEdBQUcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUUvQyxnRkFBZ0Y7UUFDaEYsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLHdCQUF3QixDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7YUFDbkksR0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBRS9DLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxHQUFHLGtCQUFrQixFQUFFLEdBQUcsaUJBQWlCLENBQUMsQ0FBQztRQUU1RSxJQUFJLHFCQUFxQixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xDLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDeEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDVCxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDMUMsVUFBVSxHQUFHLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDMUMsSUFBSSxDQUFDLEtBQUssVUFBVSxFQUFFLENBQUM7d0JBQ3RCLE9BQU8sQ0FBQyxDQUFDO29CQUNWLENBQUM7b0JBRUQsZ0ZBQWdGO29CQUNoRixjQUFjO29CQUNkLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO3dCQUM1QiwyRUFBMkU7d0JBQzNFLDJFQUEyRTt3QkFDM0Usc0VBQXNFO3dCQUN0RSxDQUFDLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNyQyxDQUFDO29CQUVELFdBQVc7b0JBQ1gsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEVBQUUsb0NBQTRCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3RHLElBQUksVUFBVSxFQUFFLENBQUM7d0JBQ2hCLGdEQUFnRDt3QkFDaEQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQzlCLENBQUM7b0JBRUQsV0FBVztvQkFDWCxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7Z0JBQ3ZDLFVBQVUsR0FBRyxxQkFBcUIsQ0FBQztZQUNwQyxDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckUsT0FBTyxVQUFVLENBQUM7SUFDbkIsQ0FBQztJQUVPLHVCQUF1QixDQUFDLElBQVk7UUFDM0MsSUFDQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM1QyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUM3QyxDQUFDO1lBQ0YsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTyxjQUFjLENBQUMsT0FBb0MsRUFBRSxZQUFvQjtRQUNoRixJQUFJLE9BQU8sQ0FBQyxrQkFBa0Isa0VBQStDLEVBQUUsQ0FBQztZQUMvRSxPQUFPLFlBQVksS0FBSyxPQUFPO2dCQUM5QixDQUFDLENBQUMsVUFBVTtnQkFDWixDQUFDLENBQUMsWUFBWSxDQUFDO1FBQ2pCLENBQUM7UUFDRCxPQUFPLFlBQVksS0FBSyxXQUFXO1lBQ2xDLENBQUMsQ0FBQyxVQUFVO1lBQ1osQ0FBQyxDQUFDLFlBQVksQ0FBQztJQUNqQixDQUFDO0lBRU8sVUFBVSxDQUFDLE9BQW9DLEVBQUUsVUFBdUI7UUFDL0UsSUFBSSxvQkFBb0IsR0FBRyxJQUFJLENBQUM7UUFDaEMsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzNCLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsNkdBQWlFLENBQUM7WUFDckksUUFBUSx1QkFBdUIsRUFBRSxDQUFDO2dCQUNqQyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1osb0JBQW9CLEdBQUcsS0FBSyxDQUFDO29CQUM3QixJQUFJLENBQUMsSUFBSSxDQUFDLDBDQUEwQyxDQUFDLENBQUM7b0JBQ3RELE1BQU07Z0JBQ1AsQ0FBQztnQkFDRCxLQUFLLGtCQUFrQixDQUFDLENBQUMsQ0FBQztvQkFDekIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsWUFBWSxFQUFFLENBQUMsT0FBTyxDQUFDO29CQUM5RSxJQUFJLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDakMsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQzs0QkFDcEMsSUFBSSxTQUFTLEtBQUssVUFBVSxFQUFFLENBQUM7Z0NBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsbUNBQW1DLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQ0FDeEcsU0FBUzs0QkFDVixDQUFDOzRCQUVELElBQUksUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0NBQ3pCLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxFQUFFLG9DQUE0QixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dDQUN0SCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7b0NBQ2pCLG9CQUFvQixHQUFHLEtBQUssQ0FBQztvQ0FDN0IsSUFBSSxDQUFDLElBQUksQ0FBQyxnREFBZ0QsRUFBRSxTQUFTLENBQUMsQ0FBQztvQ0FDdkUsTUFBTTtnQ0FDUCxDQUFDOzRCQUNGLENBQUM7NEJBQ0QsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDOzRCQUN2RSxxSEFBcUg7NEJBQ3JILGdHQUFnRzs0QkFDaEcsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO2dDQUN4QyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7Z0NBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsdUVBQXVFLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0NBQ3ZHLE1BQU07NEJBQ1AsQ0FBQzs0QkFFRCxNQUFNLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUN4RCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsTUFBTTtnQ0FDcEMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQ3BGLENBQUM7NEJBQ0YsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7Z0NBQ3hCLG9CQUFvQixHQUFHLEtBQUssQ0FBQztnQ0FDN0IsSUFBSSxDQUFDLElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQ0FDdEUsTUFBTTs0QkFDUCxDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLDRFQUE0RTt3QkFDNUUsTUFBTSxrQkFBa0IsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLFVBQVUsQ0FBQyxDQUFDO3dCQUNyRSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQzs0QkFDekIsb0JBQW9CLEdBQUcsS0FBSyxDQUFDOzRCQUM3QixJQUFJLENBQUMsSUFBSSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7d0JBQ3pELENBQUM7b0JBQ0YsQ0FBQztvQkFDRCxNQUFNO2dCQUNQLENBQUM7Z0JBQ0QsS0FBSyxPQUFPLENBQUM7Z0JBQ2IsT0FBTyxDQUFDLENBQUMsQ0FBQztvQkFDVCxNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFhLEVBQUUsQ0FBQztRQUNqQyxJQUFJLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDM0IsTUFBTSxjQUFjLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEtBQUssR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEssSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7Z0JBQzNCLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLDBDQUEwQyxFQUFFLGtFQUFrRSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDNUosQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLHFDQUFxQyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDeEgsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPO1lBQ04sb0JBQW9CO1lBQ3BCLFdBQVc7U0FDWCxDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUE7QUE3S1ksNEJBQTRCO0lBSXRDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLHdCQUF3QixDQUFBO0dBTmQsNEJBQTRCLENBNkt4QyJ9