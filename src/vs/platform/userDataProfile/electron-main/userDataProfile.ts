/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { joinPath } from '../../../base/common/resources.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, WillCreateProfileEvent, WillRemoveProfileEvent, IUserDataProfile, AGENTS_WINDOW_PROFILE_ID } from '../common/userDataProfile.js';
import { UserDataProfilesService } from '../node/userDataProfile.js';
import { IAnyWorkspaceIdentifier, IEmptyWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IStateService } from '../../state/node/state.js';
import { URI } from '../../../base/common/uri.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { env } from '../../../base/common/process.js';
import { join, resolve } from '../../../base/common/path.js';

export const IUserDataProfilesMainService = refineServiceDecorator<IUserDataProfilesService, IUserDataProfilesMainService>(IUserDataProfilesService);
export interface IUserDataProfilesMainService extends IUserDataProfilesService {
	createAgentsWindowProfile(): Promise<IUserDataProfile>;
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
		@IProductService productService: IProductService,
	) {
		super(stateService, uriIdentityService, environmentService, fileService, logService);
		this.agentPluginsHome = URI.file(getAgentPluginsPath(environmentService.args, joinPath(environmentService.userHome, productService.dataFolderName)));
	}

	protected override createDefaultProfile(): IUserDataProfile {
		return {
			...super.createDefaultProfile(),
			agentPluginsHome: this.agentPluginsHome
		};
	}

	async createAgentsWindowProfile(): Promise<IUserDataProfile> {
		const existing = this.profiles.find(p => p.id === AGENTS_WINDOW_PROFILE_ID);
		if (existing) {
			return existing;
		}

		return this.createProfile(AGENTS_WINDOW_PROFILE_ID, 'Agents');
	}

	getAssociatedEmptyWindows(): IEmptyWorkspaceIdentifier[] {
		const emptyWindows: IEmptyWorkspaceIdentifier[] = [];
		for (const id of this.profilesObject.emptyWindows.keys()) {
			emptyWindows.push({ id });
		}
		return emptyWindows;
	}
}

function getAgentPluginsPath(args: NativeParsedArgs, userHome: URI): string {
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

	return joinPath(userHome, 'agent-plugins').fsPath;
}
