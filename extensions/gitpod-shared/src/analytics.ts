/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import * as vscode from 'vscode';

import { GitpodExtensionContext } from './features';

export interface BaseGitpodAnalyticsEventPropeties {
	sessionId: string;
	workspaceId: string;
	instanceId: string;
	appName: string;
	uiKind: 'web' | 'desktop';
	devMode: boolean;
	version: string;
	timestamp: number;
}

interface GAET<N extends string, P> {
	eventName: N;
	properties: Omit<P, keyof BaseGitpodAnalyticsEventPropeties>;
}

export type GitpodAnalyticsEvent =
	GAET<'vscode_session', {}> |
	GAET<'vscode_execute_command_gitpod_open_link', {
		url: string;
	}> |
	GAET<'vscode_execute_command_gitpod_change_vscode_type', {
		targetUiKind: 'web' | 'desktop';
		targetQualifier?: 'stable' | 'insiders';
	}> |
	GAET<'vscode_execute_command_gitpod_workspace', {
		action: 'share' | 'stop-sharing' | 'stop' | 'snapshot' | 'extend-timeout';
	}> |
	GAET<'vscode_execute_command_gitpod_ports', {
		action: 'private' | 'public' | 'preview' | 'openBrowser';
		isWebview?: boolean;
	}> |
	GAET<'vscode_execute_command_gitpod_config', {
		action: 'remove' | 'add';
	}> |
	GAET<'vscode_active_language', {
		lang: string; ext?: string;
	}> |
	GAET<'ide_close_signal', {
		clientKind: 'vscode';
	}>;

export function registerUsageAnalytics(context: GitpodExtensionContext): void {
	context.fireAnalyticsEvent({ eventName: 'vscode_session', properties: {} });
}

const activeLanguages = new Set<String>();
export function registerActiveLanguageAnalytics(context: GitpodExtensionContext): void {
	const track = () => {
		const e = vscode.window.activeTextEditor;
		if (!e || activeLanguages.has(e.document.languageId)) {
			return;
		}
		const lang = e.document.languageId;
		activeLanguages.add(lang);
		const ext = path.extname(e.document.uri.path) || undefined;
		context.fireAnalyticsEvent({ eventName: 'vscode_active_language', properties: { lang, ext } });
	};
	track();
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => track()));
}
