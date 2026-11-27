/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Action / command IDs of the remote agent host actions. */
export const RemoteAgentHostCommandIds = {
	addRemoteAgentHost: 'sessions.remoteAgentHost.add',
	connectViaSSH: 'workbench.action.sessions.connectViaSSH',
	/** Connects to a new `user@host` without opening a session, for Remote Environments. */
	addSSHHost: 'workbench.action.sessions.addSSHHost',
	/** Adds a Host entry to the SSH configuration file. */
	addNewSSHHost: 'workbench.action.sessions.addNewSSHHost',
	configureSSHHosts: 'workbench.action.sessions.configureSSHHosts',
	connectViaTunnel: 'workbench.action.sessions.connectViaTunnel',
	connectViaMissionControl: 'workbench.action.sessions.connectViaMissionControl',
	connectViaWSL: 'workbench.action.sessions.connectViaWSL',
	updateRemoteAgentHost: 'workbench.action.sessions.updateRemoteAgentHost',
} as const;
