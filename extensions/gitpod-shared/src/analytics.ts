/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export interface BaseGitpodAnalyticsEventPropeties {
	sessionId: string
	workspaceId: string
	instanceId: string
	appName: string
	uiKind: 'web' | 'desktop'
	devMode: boolean
	version: string
	timestamp: number
}


interface GAET<N extends string, P> {
	eventName: N
	properties: Omit<P, keyof BaseGitpodAnalyticsEventPropeties>
}


export type GitpodAnalyticsEvent =
	GAET<'vscode_session', {}> |
	GAET<'vscode_execute_command_gitpod_open_link', {
		url: string
	}> |
	GAET<'vscode_execute_command_gitpod_change_vscode_type', {
		targetUiKind: 'web' | 'desktop',
		targetQualifier?: 'stable' | 'insiders'
	}> |
	GAET<'vscode_execute_command_gitpod_workspace', {
		action: 'share' | 'stop-sharing' | 'stop' | 'snapshot' | 'extend-timeout'
	}> |
	GAET<'vscode_execute_command_gitpod_ports', {
		action: 'private' | 'public' | 'preview' | 'openBrowser'
	}> |
	GAET<'vscode_execute_command_gitpod_config', {
		action: 'remove' | 'add'
	}>;
