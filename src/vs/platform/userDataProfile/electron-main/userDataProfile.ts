/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { INodeProcess } from '../../../base/common/platform.js';
import { joinPath } from '../../../base/common/resources.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, WillCreateProfileEvent, WillRemoveProfileEvent, IUserDataProfile } from '../common/userDataProfile.js';
import { UserDataProfilesService } from '../node/userDataProfile.js';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IStateService } from '../../state/node/state.js';
import { URI } from '../../../base/common/uri.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { env } from '../../../base/common/process.js';
import { join, resolve } from '../../../base/common/path.js';

export const IUserDataProfilesMainService = refineServiceDecorator<IUserDataProfilesService, IUserDataProfilesMainService>(IUserDataProfilesService);
export interface IUserDataProfilesMainService extends IUserDataProfilesService {
	getProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier): IUserDataProfile | undefined;
	unsetWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, transient?: boolean): void;
	getAssociatedEmptyWindows(): IEmptyWorkspaceIdentifier[];
	readonly onWillCreateProfile: Event<WillCreateProfileEvent>;
	readonly onWillRemoveProfile: Event<WillRemoveProfileEvent>;
}

export class UserDataProfilesMainService extends UserDataProfilesService implements IUserDataProfilesMainService {

	private readonly agentPluginsHome: URI;

	constructor(
		@IStateService stateService: IStateService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@IProductService private readonly productService: IProductService,
	) {
		super(stateService, uriIdentityService, environmentService, fileService, logService);
		this.agentPluginsHome = URI.file(getAgentPluginsPath(environmentService.args, environmentService.userHome, productService.dataFolderName));
	}

	protected override createDefaultProfile(): IUserDataProfile {
		const defaultProfile = {
			...super.createDefaultProfile(),
			agentPluginsHome: this.agentPluginsHome
		};
		if (!(process as INodeProcess).isEmbeddedApp) {
			return defaultProfile;
		}
		const hostUserRoamingDataHome = this.environmentService.hostUserRoamingDataHome;
		if (!hostUserRoamingDataHome) {
			return defaultProfile;
		}
		const hostAgentPluginsHome = getHostAgentPluginsPath(this.nativeEnvironmentService, this.productService);
		return {
			...defaultProfile,
			keybindingsResource: joinPath(hostUserRoamingDataHome, 'keybindings.json'),
			promptsHome: joinPath(hostUserRoamingDataHome, 'prompts'),
			mcpResource: joinPath(hostUserRoamingDataHome, 'mcp.json'),
			agentPluginsHome: hostAgentPluginsHome ? URI.file(hostAgentPluginsHome) : this.agentPluginsHome
		};
	}

	getAssociatedEmptyWindows(): IEmptyWorkspaceIdentifier[] {
		const emptyWindows: IEmptyWorkspaceIdentifier[] = [];
		for (const id of this.profilesObject.emptyWindows.keys()) {
			emptyWindows.push({ id });
		}
		return emptyWindows;
	}
}

function getHostAgentPluginsPath(environmentService: INativeEnvironmentService, productService: IProductService): string | undefined {
	if (!(process as INodeProcess).isEmbeddedApp) {
		return undefined;
	}
	if (!environmentService.isBuilt) {
		return undefined;
	}

	const quality = productService.quality;
	let hostDataFolderName: string;
	if (quality === 'stable') {
		hostDataFolderName = '.vscode';
	} else if (quality === 'insider') {
		hostDataFolderName = '.vscode-insiders';
	} else if (quality === 'exploration') {
		hostDataFolderName = '.vscode-exploration';
	} else {
		return undefined;
	}

	return getAgentPluginsPath(environmentService.args, environmentService.userHome, hostDataFolderName);
}

function getAgentPluginsPath(args: NativeParsedArgs, userHome: URI, dataFolderName: string): string {
	const cliAgentPluginsDir = args['agent-plugins-dir'];
	if (cliAgentPluginsDir) {
		return resolve(cliAgentPluginsDir);
	}

	const vscodeAgentPlugins = env['VSCODE_AGENT_PLUGINS'];
	if (vscodeAgentPlugins) {
		return vscodeAgentPlugins;
	}

	const vscodePortable = env['VSCODE_PORTABLE'];
	if (vscodePortable) {
		return join(vscodePortable, 'agent-plugins');
	}

	return joinPath(userHome, dataFolderName, 'agent-plugins').fsPath;
}
