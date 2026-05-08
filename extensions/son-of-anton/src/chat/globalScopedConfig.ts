/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

/**
 * Returns a WorkspaceConfiguration-shaped wrapper for `section` that:
 * - Always re-fetches a fresh snapshot via `vscode.workspace.getConfiguration(section)`
 *   on every read/write, so callers see the latest values even if the wrapper
 *   was constructed at activation time.
 * - Routes `update` to User (Global) settings. Several `sota.*` keys are declared
 *   with `scope: "machine"` in package.json, which VS Code rejects when writing
 *   to Workspace settings (the default target when a workspace is open).
 */
export function globalScopedConfig(section: string): vscode.WorkspaceConfiguration {
	const fresh = () => vscode.workspace.getConfiguration(section);
	const wrapper = {
		get: <T>(key: string, defaultValue?: T) => {
			const inner = fresh();
			return defaultValue === undefined ? inner.get<T>(key) : inner.get<T>(key, defaultValue);
		},
		has: (key: string) => fresh().has(key),
		inspect: <T>(key: string) => fresh().inspect<T>(key),
		update: (key: string, value: unknown, _target?: vscode.ConfigurationTarget | boolean | null, overrideInLanguage?: boolean) =>
			fresh().update(key, value, vscode.ConfigurationTarget.Global, overrideInLanguage),
	};
	return wrapper as unknown as vscode.WorkspaceConfiguration;
}

/**
 * Returns a WorkspaceConfiguration-shaped wrapper that re-fetches a fresh
 * snapshot on every read/write but does NOT force a particular target on
 * `update` (the caller's chosen target is honored).
 *
 * Use this for long-lived consumers like `LlmClient` where settings may change
 * after construction.
 */
export function liveConfig(section: string): vscode.WorkspaceConfiguration {
	const fresh = () => vscode.workspace.getConfiguration(section);
	const wrapper = {
		get: <T>(key: string, defaultValue?: T) => {
			const inner = fresh();
			return defaultValue === undefined ? inner.get<T>(key) : inner.get<T>(key, defaultValue);
		},
		has: (key: string) => fresh().has(key),
		inspect: <T>(key: string) => fresh().inspect<T>(key),
		update: (key: string, value: unknown, target?: vscode.ConfigurationTarget | boolean | null, overrideInLanguage?: boolean) =>
			fresh().update(key, value, target, overrideInLanguage),
	};
	return wrapper as unknown as vscode.WorkspaceConfiguration;
}
