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
import { fork } from 'child_process';
import { Limiter } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
let ExtensionsLifecycle = class ExtensionsLifecycle extends Disposable {
    constructor(userDataProfilesService, logService) {
        super();
        this.userDataProfilesService = userDataProfilesService;
        this.logService = logService;
        this.processesLimiter = new Limiter(5); // Run max 5 processes in parallel
    }
    async postUninstall(extension) {
        const script = this.parseScript(extension, 'uninstall');
        if (script) {
            this.logService.info(extension.identifier.id, extension.manifest.version, `Running post uninstall script`);
            await this.processesLimiter.queue(async () => {
                try {
                    await this.runLifecycleHook(script.script, 'uninstall', script.args, true, extension);
                    this.logService.info(`Finished running post uninstall script`, extension.identifier.id, extension.manifest.version);
                }
                catch (error) {
                    this.logService.error('Failed to run post uninstall script', extension.identifier.id, extension.manifest.version);
                    this.logService.error(error);
                }
            });
        }
        try {
            await Promises.rm(this.getExtensionStoragePath(extension));
        }
        catch (error) {
            this.logService.error('Error while removing extension storage path', extension.identifier.id);
            this.logService.error(error);
        }
    }
    parseScript(extension, type) {
        const scriptKey = `vscode:${type}`;
        if (extension.location.scheme === Schemas.file && extension.manifest && extension.manifest['scripts'] && typeof extension.manifest['scripts'][scriptKey] === 'string') {
            const script = (extension.manifest['scripts'][scriptKey]).split(' ');
            if (script.length < 2 || script[0] !== 'node' || !script[1]) {
                this.logService.warn(extension.identifier.id, extension.manifest.version, `${scriptKey} should be a node script`);
                return null;
            }
            return { script: join(extension.location.fsPath, script[1]), args: script.slice(2) || [] };
        }
        return null;
    }
    runLifecycleHook(lifecycleHook, lifecycleType, args, timeout, extension) {
        return new Promise((c, e) => {
            const extensionLifecycleProcess = this.start(lifecycleHook, lifecycleType, args, extension);
            let timeoutHandler;
            const onexit = (error) => {
                if (timeoutHandler) {
                    clearTimeout(timeoutHandler);
                    timeoutHandler = null;
                }
                if (error) {
                    e(error);
                }
                else {
                    c(undefined);
                }
            };
            // on error
            extensionLifecycleProcess.on('error', (err) => {
                onexit(toErrorMessage(err) || 'Unknown');
            });
            // on exit
            extensionLifecycleProcess.on('exit', (code, signal) => {
                onexit(code ? `post-${lifecycleType} process exited with code ${code}` : undefined);
            });
            if (timeout) {
                // timeout: kill process after waiting for 5s
                timeoutHandler = setTimeout(() => {
                    timeoutHandler = null;
                    extensionLifecycleProcess.kill();
                    e('timed out');
                }, 5000);
            }
        });
    }
    start(uninstallHook, lifecycleType, args, extension) {
        const opts = {
            silent: true,
            execArgv: undefined
        };
        const extensionUninstallProcess = fork(uninstallHook, [`--type=extension-post-${lifecycleType}`, ...args], opts);
        extensionUninstallProcess.stdout.setEncoding('utf8');
        extensionUninstallProcess.stderr.setEncoding('utf8');
        const onStdout = Event.fromNodeEventEmitter(extensionUninstallProcess.stdout, 'data');
        const onStderr = Event.fromNodeEventEmitter(extensionUninstallProcess.stderr, 'data');
        // Log output
        this._register(onStdout(data => this.logService.info(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));
        this._register(onStderr(data => this.logService.error(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));
        const onOutput = Event.any(Event.map(onStdout, o => ({ data: `%c${o}`, format: [''] }), this._store), Event.map(onStderr, o => ({ data: `%c${o}`, format: ['color: red'] }), this._store));
        // Debounce all output, so we can render it in the Chrome console as a group
        const onDebouncedOutput = Event.debounce(onOutput, (r, o) => {
            return r
                ? { data: r.data + o.data, format: [...r.format, ...o.format] }
                : { data: o.data, format: o.format };
        }, 100, undefined, undefined, undefined, this._store);
        // Print out output
        onDebouncedOutput(data => {
            console.group(extension.identifier.id);
            console.log(data.data, ...data.format);
            console.groupEnd();
        });
        return extensionUninstallProcess;
    }
    getExtensionStoragePath(extension) {
        return join(this.userDataProfilesService.defaultProfile.globalStorageHome.fsPath, extension.identifier.id.toLowerCase());
    }
};
ExtensionsLifecycle = __decorate([
    __param(0, IUserDataProfilesService),
    __param(1, ILogService)
], ExtensionsLifecycle);
export { ExtensionsLifecycle };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTGlmZWN5Y2xlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9ub2RlL2V4dGVuc2lvbkxpZmVjeWNsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQWdCLElBQUksRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNuRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFckQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXBGLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQUlsRCxZQUMyQix1QkFBeUQsRUFDdEUsVUFBd0M7UUFFckQsS0FBSyxFQUFFLENBQUM7UUFIMEIsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUNyRCxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBSjlDLHFCQUFnQixHQUFrQixJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGtDQUFrQztJQU81RixDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FB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