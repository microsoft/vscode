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
import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { assertNever } from '../../../../base/common/assert.js';
import { Throttler } from '../../../../base/common/async.js';
import * as glob from '../../../../base/common/glob.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals as objectsEqual } from '../../../../base/common/objects.js';
import { autorun, autorunDelta, derivedOpts } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IDebugService } from '../../debug/common/debug.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
let McpDevModeServerAttache = class McpDevModeServerAttache extends Disposable {
    constructor(server, fwdRef, registry, fileService, workspaceContextService) {
        super();
        const workspaceFolder = server.readDefinitions().map(({ collection }) => collection?.presentation?.origin &&
            workspaceContextService.getWorkspaceFolder(collection.presentation?.origin)?.uri);
        const restart = async () => {
            const lastDebugged = fwdRef.lastModeDebugged;
            await server.stop();
            await server.start({ debug: lastDebugged });
        };
        // 1. Auto-start the server, restart if entering debug mode
        let didAutoStart = false;
        this._register(autorun(reader => {
            const defs = server.readDefinitions().read(reader);
            if (!defs.collection || !defs.server || !defs.server.devMode) {
                didAutoStart = false;
                return;
            }
            // don't keep trying to start the server unless it's a new server or devmode is newly turned on
            if (didAutoStart) {
                return;
            }
            const delegates = registry.delegates.read(reader);
            if (!delegates.some(d => d.canStart(defs.collection, defs.server))) {
                return;
            }
            server.start();
            didAutoStart = true;
        }));
        const debugMode = server.readDefinitions().map(d => !!d.server?.devMode?.debug);
        this._register(autorunDelta(debugMode, ({ lastValue, newValue }) => {
            if (!!newValue && !objectsEqual(lastValue, newValue)) {
                restart();
            }
        }));
        // 2. Watch for file changes
        const watchObs = derivedOpts({ equalsFn: arraysEqual }, reader => {
            const def = server.readDefinitions().read(reader);
            const watch = def.server?.devMode?.watch;
            return typeof watch === 'string' ? [watch] : watch;
        });
        const restartScheduler = this._register(new Throttler());
        this._register(autorun(reader => {
            const pattern = watchObs.read(reader);
            const wf = workspaceFolder.read(reader);
            if (!pattern || !wf) {
                return;
            }
            const includes = pattern.filter(p => !p.startsWith('!'));
            const excludes = pattern.filter(p => p.startsWith('!')).map(p => p.slice(1));
            reader.store.add(fileService.watch(wf, { includes, excludes, recursive: true }));
            const ignoreCase = !fileService.hasCapability(wf, 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
            const includeParse = includes.map(p => glob.parse({ base: wf.fsPath, pattern: p }, { ignoreCase }));
            const excludeParse = excludes.map(p => glob.parse({ base: wf.fsPath, pattern: p }, { ignoreCase }));
            reader.store.add(fileService.onDidFilesChange(e => {
                for (const change of [e.rawAdded, e.rawDeleted, e.rawUpdated]) {
                    for (const uri of change) {
                        if (includeParse.some(i => i(uri.fsPath)) && !excludeParse.some(e => e(uri.fsPath))) {
                            restartScheduler.queue(restart);
                            break;
                        }
                    }
                }
            }));
        }));
    }
};
McpDevModeServerAttache = __decorate([
    __param(2, IMcpRegistry),
    __param(3, IFileService),
    __param(4, IWorkspaceContextService)
], McpDevModeServerAttache);
export { McpDevModeServerAttache };
export const IMcpDevModeDebugging = createDecorator('mcpDevModeDebugging');
const DEBUG_HOST = '127.0.0.1';
let McpDevModeDebugging = class McpDevModeDebugging {
    constructor(_debugService, _commandService) {
        this._debugService = _debugService;
        this._commandService = _commandService;
    }
    async transform(definition, launch) {
        if (!definition.devMode?.debug || launch.type !== 1 /* McpServerTransportType.Stdio */) {
            return launch;
        }
        const port = await this.getDebugPort();
        const name = `MCP: ${definition.label}`; // for debugging
        const options = { startedByUser: false, suppressDebugView: true };
        const commonConfig = {
            internalConsoleOptions: 'neverOpen',
            suppressMultipleSessionWarning: true,
        };
        switch (definition.devMode.debug.type) {
            case 'node': {
                if (!/node[0-9]*$/.test(launch.command)) {
                    throw new Error(localize('mcp.debug.nodeBinReq', 'MCP server must be launched with the "node" executable to enable debugging, but was launched with "{0}"', launch.command));
                }
                // We intentionally assert types as the DA has additional properties beyong IConfig
                // eslint-disable-next-line local/code-no-dangerous-type-assertions
                this._debugService.startDebugging(undefined, {
                    type: 'pwa-node',
                    request: 'attach',
                    name,
                    port,
                    host: DEBUG_HOST,
                    timeout: 30_000,
                    continueOnAttach: true,
                    ...commonConfig,
                }, options);
                return { ...launch, args: [`--inspect-brk=${DEBUG_HOST}:${port}`, ...launch.args] };
            }
            case 'debugpy': {
                if (!/python[0-9.]*$/.test(launch.command)) {
                    throw new Error(localize('mcp.debug.pythonBinReq', 'MCP server must be launched with the "python" executable to enable debugging, but was launched with "{0}"', launch.command));
                }
                let command;
                let args = ['--wait-for-client', '--connect', `${DEBUG_HOST}:${port}`, ...launch.args];
                if (definition.devMode.debug.debugpyPath) {
                    command = definition.devMode.debug.debugpyPath;
                }
                else {
                    try {
                        // The Python debugger exposes a command to get its bundle debugpy module path.  Use that if it's available.
                        const debugPyPath = await this._commandService.executeCommand('python.getDebugpyPackagePath');
                        if (debugPyPath) {
                            command = launch.command;
                            args = [debugPyPath, ...args];
                        }
                    }
                    catch {
                        // ignored, no Python debugger extension installed or an error therein
                    }
                }
                if (!command) {
                    command = 'debugpy';
                }
                await Promise.race([
                    // eslint-disable-next-line local/code-no-dangerous-type-assertions
                    this._debugService.startDebugging(undefined, {
                        type: 'debugpy',
                        name,
                        request: 'attach',
                        listen: {
                            host: DEBUG_HOST,
                            port
                        },
                        ...commonConfig,
                    }, options),
                    this.ensureListeningOnPort(port)
                ]);
                return { ...launch, command, args };
            }
            default:
                assertNever(definition.devMode.debug, `Unknown debug type ${JSON.stringify(definition.devMode.debug)}`);
        }
    }
    ensureListeningOnPort(port) {
        return Promise.resolve();
    }
    getDebugPort() {
        return Promise.resolve(9230);
    }
};
McpDevModeDebugging = __decorate([
    __param(0, IDebugService),
    __param(1, ICommandService)
], McpDevModeDebugging);
export { McpDevModeDebugging };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwRGV2TW9kZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwRGV2TW9kZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxJQUFJLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE1BQU0sSUFBSSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBa0MsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlGLE9BQU8sRUFBVyxhQUFhLEVBQXdCLE1BQU0sNkJBQTZCLENBQUM7QUFDM0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRzlDLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsVUFBVTtJQUN0RCxZQUNDLE1BQWtCLEVBQ2xCLE1BQXFDLEVBQ3ZCLFFBQXNCLEVBQ3RCLFdBQXlCLEVBQ2IsdUJBQWlEO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBRVIsTUFBTSxlQUFlLEdBQUcsTUFBTSxDQUFDLGVBQWUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTTtZQUN4Ryx1QkFBdUIsQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRW5GLE1BQU0sT0FBTyxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQzFCLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztZQUM3QyxNQUFNLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUM3QyxDQUFDLENBQUM7UUFFRiwyREFBMkQ7UUFDM0QsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQy9CLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDOUQsWUFBWSxHQUFHLEtBQUssQ0FBQztnQkFDckIsT0FBTztZQUNSLENBQUM7WUFFRCwrRkFBK0Y7WUFDL0YsSUFBSSxZQUFZLEVBQUUsQ0FBQztnQkFDbEIsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsRCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVcsRUFBRSxJQUFJLENBQUMsTUFBTyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUN0RSxPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNmLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDckIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRTtZQUNsRSxJQUFJLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RELE9BQU8sRUFBRSxDQUFDO1lBQ1gsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSiw0QkFBNEI7UUFDNUIsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUF1QixFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsRUFBRSxNQUFNLENBQUMsRUFBRTtZQUN0RixNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsZUFBZSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2xELE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQztZQUN6QyxPQUFPLE9BQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ3BELENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztRQUV6RCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMvQixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sRUFBRSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDeEMsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNyQixPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN6RCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RSxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVqRixNQUFNLFVBQVUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsRUFBRSw4REFBbUQsQ0FBQztZQUNwRyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwRyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwRyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ2pELEtBQUssTUFBTSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQy9ELEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxFQUFFLENBQUM7d0JBQzFCLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQzs0QkFDckYsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDOzRCQUNoQyxNQUFNO3dCQUNQLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0QsQ0FBQTtBQXBGWSx1QkFBdUI7SUFJakMsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsd0JBQXdCLENBQUE7R0FOZCx1QkFBdUIsQ0FvRm5DOztBQVFELE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLGVBQWUsQ0FBdUIscUJBQXFCLENBQUMsQ0FBQztBQUVqRyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUM7QUFFeEIsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBbUI7SUFHL0IsWUFDaUMsYUFBNEIsRUFDMUIsZUFBZ0M7UUFEbEMsa0JBQWEsR0FBYixhQUFhLENBQWU7UUFDMUIsb0JBQWUsR0FBZixlQUFlLENBQWlCO0lBQy9ELENBQUM7SUFFRSxLQUFLLENBQUMsU0FBUyxDQUFDLFVBQStCLEVBQUUsTUFBdUI7UUFDOUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQyxJQUFJLHlDQUFpQyxFQUFFLENBQUM7WUFDaEYsT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDO1FBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdkMsTUFBTSxJQUFJLEdBQUcsUUFBUSxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxnQkFBZ0I7UUFDekQsTUFBTSxPQUFPLEdBQXlCLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUN4RixNQUFNLFlBQVksR0FBcUI7WUFDdEMsc0JBQXNCLEVBQUUsV0FBVztZQUNuQyw4QkFBOEIsRUFBRSxJQUFJO1NBQ3BDLENBQUM7UUFFRixRQUFRLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZDLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDYixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDekMsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUseUdBQXlHLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQzlLLENBQUM7Z0JBRUQsbUZBQW1GO2dCQUNuRixtRUFBbUU7Z0JBQ25FLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRTtvQkFDNUMsSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLE9BQU8sRUFBRSxRQUFRO29CQUNqQixJQUFJO29CQUNKLElBQUk7b0JBQ0osSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLE9BQU8sRUFBRSxNQUFNO29CQUNmLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLEdBQUcsWUFBWTtpQkFDSixFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN2QixPQUFPLEVBQUUsR0FBRyxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsaUJBQWlCLFVBQVUsSUFBSSxJQUFJLEVBQUUsRUFBRSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3JGLENBQUM7WUFDRCxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQzVDLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDJHQUEyRyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNsTCxDQUFDO2dCQUVELElBQUksT0FBMkIsQ0FBQztnQkFDaEMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxXQUFXLEVBQUUsR0FBRyxVQUFVLElBQUksSUFBSSxFQUFFLEVBQUUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3ZGLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQzFDLE9BQU8sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUM7Z0JBQ2hELENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLENBQUM7d0JBQ0osNEdBQTRHO3dCQUM1RyxNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFxQiw4QkFBOEIsQ0FBQyxDQUFDO3dCQUNsSCxJQUFJLFdBQVcsRUFBRSxDQUFDOzRCQUNqQixPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQzs0QkFDekIsSUFBSSxHQUFHLENBQUMsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7d0JBQy9CLENBQUM7b0JBQ0YsQ0FBQztvQkFBQyxNQUFNLENBQUM7d0JBQ1Isc0VBQXNFO29CQUN2RSxDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUNkLE9BQU8sR0FBRyxTQUFTLENBQUM7Z0JBQ3JCLENBQUM7Z0JBRUQsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDO29CQUNsQixtRUFBbUU7b0JBQ25FLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRTt3QkFDNUMsSUFBSSxFQUFFLFNBQVM7d0JBQ2YsSUFBSTt3QkFDSixPQUFPLEVBQUUsUUFBUTt3QkFDakIsTUFBTSxFQUFFOzRCQUNQLElBQUksRUFBRSxVQUFVOzRCQUNoQixJQUFJO3lCQUNKO3dCQUNELEdBQUcsWUFBWTtxQkFDSixFQUFFLE9BQU8sQ0FBQztvQkFDdEIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQztpQkFDaEMsQ0FBQyxDQUFDO2dCQUVILE9BQU8sRUFBRSxHQUFHLE1BQU0sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDckMsQ0FBQztZQUNEO2dCQUNDLFdBQVcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxzQkFBc0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMxRyxDQUFDO0lBQ0YsQ0FBQztJQUVTLHFCQUFxQixDQUFDLElBQVk7UUFDM0MsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUIsQ0FBQztJQUVTLFlBQVk7UUFDckIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlCLENBQUM7Q0FDRCxDQUFBO0FBL0ZZLG1CQUFtQjtJQUk3QixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsZUFBZSxDQUFBO0dBTEwsbUJBQW1CLENBK0YvQiJ9