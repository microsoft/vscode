/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Action / command IDs of the remote agent host actions. */
export const RemoteAgentHostCommandIds = {
	addRemoteAgentHost: 'sessions.remoteAgentHost.add',
	connectViaSSH: 'workbench.action.sessions.connectViaSSH',
	addNewSSHHost: 'workbench.action.sessions.addNewSSHHost',
	configureSSHHosts: 'workbench.action.sessions.configureSSHHosts',
	connectViaTunnel: 'workbench.action.sessions.connectViaTunnel',
	connectViaMissionControl: 'workbench.action.sessions.connectViaMissionControl',
	connectViaWSL: 'workbench.action.sessions.connectViaWSL',
	updateRemoteAgentHost: 'workbench.action.sessions.updateRemoteAgentHost',
} as const;
