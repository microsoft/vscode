/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as platform from '../../base/common/platform.js';
import * as performance from '../../base/common/performance.js';
import { URI } from '../../base/common/uri.js';
import { createURITransformer } from '../../base/common/uriTransformer.js';
import { transformOutgoingURIs } from '../../base/common/uriIpc.js';
import { listProcesses } from '../../base/node/ps.js';
import { getMachineInfo, collectWorkspaceStats } from '../../platform/diagnostics/node/diagnosticsService.js';
import { basename } from '../../base/common/path.js';
import { joinPath } from '../../base/common/resources.js';
export class RemoteAgentEnvironmentChannel {
    static { this._namePool = 1; }
    constructor(_connectionToken, _environmentService, _userDataProfilesService, _extensionHostStatusService, _logService) {
        this._connectionToken = _connectionToken;
        this._environmentService = _environmentService;
        this._userDataProfilesService = _userDataProfilesService;
        this._extensionHostStatusService = _extensionHostStatusService;
        this._logService = _logService;
    }
    async call(_, command, arg) {
        switch (command) {
            case 'getEnvironmentData': {
                const args = arg;
                const uriTransformer = createURITransformer(args.remoteAuthority);
                let environmentData = await this._getEnvironmentData(args.profile);
                environmentData = transformOutgoingURIs(environmentData, uriTransformer);
                return environmentData;
            }
            case 'getExtensionHostExitInfo': {
                const args = arg;
                return this._extensionHostStatusService.getExitInfo(args.reconnectionToken);
            }
            case 'getDiagnosticInfo': {
                const options = arg;
                const diagnosticInfo = {
                    machineInfo: getMachineInfo()
                };
                const processesPromise = options.includeProcesses ? listProcesses(process.pid) : Promise.resolve();
                let workspaceMetadataPromises = [];
                const workspaceMetadata = {};
                if (options.folders) {
                    // only incoming paths are transformed, so remote authority is unneeded.
                    const uriTransformer = createURITransformer('');
                    const folderPaths = options.folders
                        .map(folder => URI.revive(uriTransformer.transformIncoming(folder)))
                        .filter(uri => uri.scheme === 'file');
                    workspaceMetadataPromises = folderPaths.map(folder => {
                        return collectWorkspaceStats(folder.fsPath, ['node_modules', '.git'])
                            .then(stats => {
                            workspaceMetadata[basename(folder.fsPath)] = stats;
                        });
                    });
                }
                return Promise.all([processesPromise, ...workspaceMetadataPromises]).then(([processes, _]) => {
                    diagnosticInfo.processes = processes || undefined;
                    diagnosticInfo.workspaceMetadata = options.folders ? workspaceMetadata : undefined;
                    return diagnosticInfo;
                });
            }
        }
        throw new Error(`IPC Command ${command} not found`);
    }
    listen(_, event, arg) {
        throw new Error('Not supported');
    }
    async _getEnvironmentData(profile) {
        if (profile && !this._userDataProfilesService.profiles.some(p => p.id === profile)) {
            await this._userDataProfilesService.createProfile(profile, profile);
        }
        let isUnsupportedGlibc = false;
        if (process.platform === 'linux') {
            const glibcVersion = process.glibcVersion;
            const minorVersion = glibcVersion ? parseInt(glibcVersion.split('.')[1]) : 28;
            isUnsupportedGlibc = (minorVersion <= 27) || !!process.env['VSCODE_SERVER_CUSTOM_GLIBC_LINKER'];
        }
        this._logService.trace(`[reconnection-grace-time] Server sending grace time to client: ${this._environmentService.reconnectionGraceTime}ms (${Math.floor(this._environmentService.reconnectionGraceTime / 1000)}s)`);
        return {
            pid: process.pid,
            connectionToken: (this._connectionToken.type !== 0 /* ServerConnectionTokenType.None */ ? this._connectionToken.value : ''),
            appRoot: URI.file(this._environmentService.appRoot),
            execPath: process.execPath,
            tmpDir: this._environmentService.tmpDir,
            settingsPath: this._environmentService.machineSettingsResource,
            mcpResource: this._environmentService.mcpResource,
            logsPath: this._environmentService.logsHome,
            extensionHostLogsPath: joinPath(this._environmentService.logsHome, `exthost${RemoteAgentEnvironmentChannel._namePool++}`),
            globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
            workspaceStorageHome: this._environmentService.workspaceStorageHome,
            localHistoryHome: this._environmentService.localHistoryHome,
            userHome: this._environmentService.userHome,
            os: platform.OS,
            arch: process.arch,
            marks: performance.getMarks(),
            useHostProxy: !!this._environmentService.args['use-host-proxy'],
            profiles: {
                home: this._userDataProfilesService.profilesHome,
                all: [...this._userDataProfilesService.profiles].map(profile => ({ ...profile }))
            },
            isUnsupportedGlibc,
            reconnectionGraceTime: this._environmentService.reconnectionGraceTime
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRFbnZpcm9ubWVudEltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXJ2ZXIvbm9kZS9yZW1vdGVBZ2VudEVudmlyb25tZW50SW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEtBQUssUUFBUSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sS0FBSyxXQUFXLE1BQU0sa0NBQWtDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBSTNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsY0FBYyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFOUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBS3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUcxRCxNQUFNLE9BQU8sNkJBQTZCO2FBRTFCLGNBQVMsR0FBRyxDQUFDLENBQUM7SUFFN0IsWUFDa0IsZ0JBQXVDLEVBQ3ZDLG1CQUE4QyxFQUM5Qyx3QkFBa0QsRUFDbEQsMkJBQXdELEVBQ3hELFdBQXdCO1FBSnhCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBdUI7UUFDdkMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUEyQjtRQUM5Qyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTBCO1FBQ2xELGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBNkI7UUFDeEQsZ0JBQVcsR0FBWCxXQUFXLENBQWE7SUFFMUMsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJ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