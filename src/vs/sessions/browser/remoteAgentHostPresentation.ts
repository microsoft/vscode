/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';

export type LocalAgentHostRegistration = 'devTunnel' | 'githubEnvironment';

export function getLocalAgentHostRouteLabel(registration: LocalAgentHostRegistration): string {
	return registration === 'devTunnel'
		? localize('localAgentHost.devTunnel', "Dev Tunnel")
		: localize('localAgentHost.githubEnvironment', "GitHub Environment");
}

export function getLocalAgentHostConnectionDescription(registration: LocalAgentHostRegistration, connection: string): string {
	return localize(
		'localAgentHost.connectionDescription',
		"This computer via {0}. Connection: {1}",
		getLocalAgentHostRouteLabel(registration),
		connection,
	);
}

export function getLocalAgentHostHover(registration: LocalAgentHostRegistration): string {
	return registration === 'devTunnel'
		? localize(
			'localAgentHost.devTunnelHover',
			"This is a remote route to this computer through Dev Tunnels. Supported VS Code and browser clients can work with agents and folders here. Remote Tunnels can also open the full editor. Sharing does not move code or provision compute.",
		)
		: localize(
			'localAgentHost.githubEnvironmentHover',
			"This is a remote route to this computer through GitHub Environments. Agents can continue across supported VS Code, browser, GitHub, and Copilot clients and work in folders here. Sharing does not move code or provision compute.",
		);
}

export function getThisComputerHover(): string {
	return localize(
		'localAgentHost.thisComputerHover',
		"Run this session directly on this computer",
	);
}
