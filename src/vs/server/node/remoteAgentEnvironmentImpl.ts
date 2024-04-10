/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import * as performance from 'vs/base/common/performance';
import { URI } from 'vs/base/common/uri';
import { createURITransformer } from 'vs/workbench/api/node/uriTransformer';
import { IRemoteAgentEnvironmentDTO, IGetEnvironmentDataArguments, IGetExtensionHostExitInfoArguments } from 'vs/workbench/services/remote/common/remoteAgentEnvironmentChannel';
import { IServerEnvironmentService } from 'vs/server/node/serverEnvironmentService';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { transformOutgoingURIs } from 'vs/base/common/uriIpc';
import { listProcesses } from 'vs/base/node/ps';
import { getMachineInfo, collectWorkspaceStats } from 'vs/platform/diagnostics/node/diagnosticsService';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { basename } from 'vs/base/common/path';
import { ProcessItem } from 'vs/base/common/processes';
import { ServerConnectionToken, ServerConnectionTokenType } from 'vs/server/node/serverConnectionToken';
import { IExtensionHostStatusService } from 'vs/server/node/extensionHostStatusService';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { joinPath } from 'vs/base/common/resources';

export class RemoteAgentEnvironmentChannel implements IServerChannel {

	private static _namePool = 1;

	constructor(
		private readonly _connectionToken: ServerConnectionToken,
		private readonly _environmentService: IServerEnvironmentService,
		private readonly _userDataProfilesService: IUserDataProfilesService,
		private readonly _extensionHostStatusService: IExtensionHostStatusService,
	) {
	}

	async call(_: any, command: string, arg?: any): Promise<any> {
		switch (command) {

			case 'getEnvironmentData': {
				const args = <IGetEnvironmentDataArguments>arg;
				const uriTransformer = createURITransformer(args.remoteAuthority);

				let environmentData = await this._getEnvironmentData(args.profile);
				environmentData = transformOutgoingURIs(environmentData, uriTransformer);

				return environmentData;
			}

			case 'getExtensionHostExitInfo': {
				const args = <IGetExtensionHostExitInfoArguments>arg;
				return this._extensionHostStatusService.getExitInfo(args.reconnectionToken);
			}

			case 'getDiagnosticInfo': {
				const options = <IDiagnosticInfoOptions>arg;
				const diagnosticInfo: IDiagnosticInfo = {
					machineInfo: getMachineInfo()
				};

				const processesPromise: Promise<ProcessItem | void> = options.includeProcesses ? listProcesses(process.pid) : Promise.resolve();

				let workspaceMetadataPromises: Promise<void>[] = [];
				const workspaceMetadata: { [key: string]: any } = {};
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

	listen(_: any, event: string, arg: any): Event<any> {
		throw new Error('Not supported');
	}

	private async _getEnvironmentData(profile?: string): Promise<IRemoteAgentEnvironmentDTO> {
		if (profile && !this._userDataProfilesService.profiles.some(p => p.id === profile)) {
			await this._userDataProfilesService.createProfile(profile, profile);
		}
		type ProcessWithGlibc = NodeJS.Process & {
			glibcVersion?: string;
		};
		let isUnsupportedGlibc = false;
		if (process.platform === 'linux') {
			const glibcVersion = (process as ProcessWithGlibc).glibcVersion;
			const minorVersion = glibcVersion ? parseInt(glibcVersion.split('.')[1]) : 28;
			isUnsupportedGlibc = (minorVersion <= 27);
		}
		return {
			pid: process.pid,
			connectionToken: (this._connectionToken.type !== ServerConnectionTokenType.None ? this._connectionToken.value : ''),
			appRoot: URI.file(this._environmentService.appRoot),
			settingsPath: this._environmentService.machineSettingsResource,
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
			isUnsupportedGlibc
		};
	}

}
