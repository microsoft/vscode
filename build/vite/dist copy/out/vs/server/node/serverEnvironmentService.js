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
import * as nls from '../../nls.js';
import { NativeEnvironmentService } from '../../platform/environment/node/environmentService.js';
import { OPTIONS } from '../../platform/environment/node/argv.js';
import { refineServiceDecorator } from '../../platform/instantiation/common/instantiation.js';
import { IEnvironmentService } from '../../platform/environment/common/environment.js';
import { memoize } from '../../base/common/decorators.js';
import { URI } from '../../base/common/uri.js';
import { joinPath } from '../../base/common/resources.js';
import { join } from '../../base/common/path.js';
export const serverOptions = {
    /* ----- server setup ----- */
    'host': { type: 'string', cat: 'o', args: 'ip-address', description: nls.localize('host', "The host name or IP address the server should listen to. If not set, defaults to 'localhost'.") },
    'port': { type: 'string', cat: 'o', args: 'port | port range', description: nls.localize('port', "The port the server should listen to. If 0 is passed a random free port is picked. If a range in the format num-num is passed, a free port from the range (end inclusive) is selected.") },
    'socket-path': { type: 'string', cat: 'o', args: 'path', description: nls.localize('socket-path', "The path to a socket file for the server to listen to.") },
    'server-base-path': { type: 'string', cat: 'o', args: 'path', description: nls.localize('server-base-path', "The path under which the web UI and the code server is provided. Defaults to '/'.`") },
    'connection-token': { type: 'string', cat: 'o', args: 'token', deprecates: ['connectionToken'], description: nls.localize('connection-token', "A secret that must be included with all requests.") },
    'connection-token-file': { type: 'string', cat: 'o', args: 'path', deprecates: ['connection-secret', 'connectionTokenFile'], description: nls.localize('connection-token-file', "Path to a file that contains the connection token.") },
    'without-connection-token': { type: 'boolean', cat: 'o', description: nls.localize('without-connection-token', "Run without a connection token. Only use this if the connection is secured by other means.") },
    'disable-websocket-compression': { type: 'boolean' },
    'print-startup-performance': { type: 'boolean' },
    'print-ip-address': { type: 'boolean' },
    'accept-server-license-terms': { type: 'boolean', cat: 'o', description: nls.localize('acceptLicenseTerms', "If set, the user accepts the server license terms and the server will be started without a user prompt.") },
    'server-data-dir': { type: 'string', cat: 'o', description: nls.localize('serverDataDir', "Specifies the directory that server data is kept in.") },
    'telemetry-level': { type: 'string', cat: 'o', args: 'level', description: nls.localize('telemetry-level', "Sets the initial telemetry level. Valid levels are: 'off', 'crash', 'error' and 'all'. If not specified, the server will send telemetry until a client connects, it will then use the clients telemetry setting. Setting this to 'off' is equivalent to --disable-telemetry") },
    /* ----- vs code options ---	-- */
    'user-data-dir': OPTIONS['user-data-dir'],
    'enable-smoke-test-driver': OPTIONS['enable-smoke-test-driver'],
    'disable-telemetry': OPTIONS['disable-telemetry'],
    'disable-experiments': OPTIONS['disable-experiments'],
    'disable-workspace-trust': OPTIONS['disable-workspace-trust'],
    'file-watcher-polling': { type: 'string', deprecates: ['fileWatcherPolling'] },
    'log': OPTIONS['log'],
    'logsPath': OPTIONS['logsPath'],
    'force-disable-user-env': OPTIONS['force-disable-user-env'],
    'enable-proposed-api': OPTIONS['enable-proposed-api'],
    /* ----- vs code web options ----- */
    'folder': { type: 'string', deprecationMessage: 'No longer supported. Folder needs to be provided in the browser URL or with `default-folder`.' },
    'workspace': { type: 'string', deprecationMessage: 'No longer supported. Workspace needs to be provided in the browser URL or with `default-workspace`.' },
    'default-folder': { type: 'string', description: nls.localize('default-folder', 'The workspace folder to open when no input is specified in the browser URL. A relative or absolute path resolved against the current working directory.') },
    'default-workspace': { type: 'string', description: nls.localize('default-workspace', 'The workspace to open when no input is specified in the browser URL. A relative or absolute path resolved against the current working directory.') },
    'enable-sync': { type: 'boolean' },
    'github-auth': { type: 'string' },
    'use-test-resolver': { type: 'boolean' },
    /* ----- extension management ----- */
    'extensions-dir': OPTIONS['extensions-dir'],
    'extensions-download-dir': OPTIONS['extensions-download-dir'],
    'builtin-extensions-dir': OPTIONS['builtin-extensions-dir'],
    'install-extension': OPTIONS['install-extension'],
    'install-builtin-extension': OPTIONS['install-builtin-extension'],
    'update-extensions': OPTIONS['update-extensions'],
    'uninstall-extension': OPTIONS['uninstall-extension'],
    'list-extensions': OPTIONS['list-extensions'],
    'locate-extension': OPTIONS['locate-extension'],
    'show-versions': OPTIONS['show-versions'],
    'category': OPTIONS['category'],
    'force': OPTIONS['force'],
    'do-not-sync': OPTIONS['do-not-sync'],
    'do-not-include-pack-dependencies': OPTIONS['do-not-include-pack-dependencies'],
    'pre-release': OPTIONS['pre-release'],
    'start-server': { type: 'boolean', cat: 'e', description: nls.localize('start-server', "Start the server when installing or uninstalling extensions. To be used in combination with 'install-extension', 'install-builtin-extension' and 'uninstall-extension'.") },
    /* ----- remote development options ----- */
    'enable-remote-auto-shutdown': { type: 'boolean' },
    'remote-auto-shutdown-without-delay': { type: 'boolean' },
    'inspect-ptyhost': { type: 'string', allowEmptyValue: true },
    'agent-host-port': { type: 'string', cat: 'o', args: 'port', description: nls.localize('agent-host-port', "The port the agent host WebSocket server should listen on.") },
    'agent-host-path': { type: 'string', cat: 'o', args: 'path', description: nls.localize('agent-host-path', "The path to a socket file for the agent host WebSocket server to listen on.") },
    'use-host-proxy': { type: 'boolean' },
    'without-browser-env-var': { type: 'boolean' },
    'reconnection-grace-time': { type: 'string', cat: 'o', args: 'seconds', description: nls.localize('reconnection-grace-time', "Override the reconnection grace time window in seconds. Defaults to 10800 (3 hours).") },
    /* ----- server cli ----- */
    'help': OPTIONS['help'],
    'version': OPTIONS['version'],
    'locate-shell-integration-path': OPTIONS['locate-shell-integration-path'],
    'compatibility': { type: 'string' },
    _: OPTIONS['_']
};
export const IServerEnvironmentService = refineServiceDecorator(IEnvironmentService);
export class ServerEnvironmentService extends NativeEnvironmentService {
    get userRoamingDataHome() { return this.appSettingsHome; }
    get machineSettingsResource() { return joinPath(URI.file(join(this.userDataPath, 'Machine')), 'settings.json'); }
    get mcpResource() { return joinPath(URI.file(join(this.userDataPath, 'User')), 'mcp.json'); }
    get args() { return super.args; }
    get reconnectionGraceTime() { return parseGraceTime(this.args['reconnection-grace-time'], 10800000 /* ProtocolConstants.ReconnectionGraceTime */); }
}
__decorate([
    memoize
], ServerEnvironmentService.prototype, "userRoamingDataHome", null);
__decorate([
    memoize
], ServerEnvironmentService.prototype, "machineSettingsResource", null);
__decorate([
    memoize
], ServerEnvironmentService.prototype, "mcpResource", null);
__decorate([
    memoize
], ServerEnvironmentService.prototype, "reconnectionGraceTime", null);
function parseGraceTime(rawValue, fallback) {
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
        console.log(`[reconnection-grace-time] No CLI argument provided, using default: ${fallback}ms (${Math.floor(fallback / 1000)}s)`);
        return fallback;
    }
    const parsedSeconds = Number(rawValue);
    if (!isFinite(parsedSeconds) || parsedSeconds < 0) {
        console.log(`[reconnection-grace-time] Invalid value '${rawValue}', using default: ${fallback}ms (${Math.floor(fallback / 1000)}s)`);
        return fallback;
    }
    const millis = Math.floor(parsedSeconds * 1000);
    if (!isFinite(millis) || millis > Number.MAX_SAFE_INTEGER) {
        console.log(`[reconnection-grace-time] Value too large '${rawValue}', using default: ${fallback}ms (${Math.floor(fallback / 1000)}s)`);
        return fallback;
    }
    console.log(`[reconnection-grace-time] Parsed CLI argument: ${parsedSeconds}s -> ${millis}ms`);
    return millis;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2VydmVyL25vZGUvc2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sY0FBYyxDQUFDO0FBRXBDLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxPQUFPLEVBQXNCLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDOUYsT0FBTyxFQUFFLG1CQUFtQixFQUE2QixNQUFNLGtEQUFrRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0MsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUdqRCxNQUFNLENBQUMsTUFBTSxhQUFhLEdBQW1EO0lBRTVFLDhCQUE4QjtJQUU5QixNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsK0ZBQStGLENBQUMsRUFBRTtJQUM1TCxNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSx3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