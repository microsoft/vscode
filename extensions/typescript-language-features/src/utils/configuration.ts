/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './dispose';

export type UnifiedConfigurationScope = vscode.ConfigurationScope | null | undefined;

export const unifiedConfigSection = 'js/ts';

export interface ReadUnifiedConfigOptions<Scope = UnifiedConfigurationScope> {
	readonly scope?: Scope;
	readonly fallbackSection: string;
	readonly fallbackSubSectionNameOverride?: string;
}

/**
 * Gets a configuration value, checking the unified `js/ts` setting first,
 * then falling back to the language-specific setting.
 */
export function readUnifiedConfig<T>(
	subSectionName: string,
	defaultValue: T,
	options: ReadUnifiedConfigOptions
): T {
	// Check unified setting first
	const unifiedConfig = vscode.workspace.getConfiguration(unifiedConfigSection, options.scope);
	const unifiedInspect = unifiedConfig.inspect<T>(subSectionName);
	if (hasModifiedValue(unifiedInspect)) {
		return unifiedConfig.get<T>(subSectionName, defaultValue);
	}

	// Fall back to language-specific setting
	const languageConfig = vscode.workspace.getConfiguration(options.fallbackSection, options.scope);
	return languageConfig.get<T>(options.fallbackSubSectionNameOverride ?? subSectionName, defaultValue);
}

/**
 * Checks if an inspected configuration value has any user-defined values set.
 */
function hasModifiedValue(inspect: ReturnType<vscode.WorkspaceConfiguration['inspect']>): boolean {
	if (!inspect) {
		return false;
	}

	return (
		typeof inspect.globalValue !== 'undefined'
		|| typeof inspect.workspaceValue !== 'undefined'
		|| typeof inspect.workspaceFolderValue !== 'undefined'
		|| typeof inspect.globalLanguageValue !== 'undefined'
		|| typeof inspect.workspaceLanguageValue !== 'undefined'
		|| typeof inspect.workspaceFolderLanguageValue !== 'undefined'
		|| ((inspect.languageIds?.length ?? 0) > 0)
	);
}

/**
 * Checks if a unified configuration value has been modified from its default value.
 */
export function hasModifiedUnifiedConfig(
	subSectionName: string,
	options: {
		readonly scope?: UnifiedConfigurationScope;
		readonly fallbackSection: string;
	}
): boolean {
	// Check unified setting
	const unifiedConfig = vscode.workspace.getConfiguration(unifiedConfigSection, options.scope);
	if (hasModifiedValue(unifiedConfig.inspect(subSectionName))) {
		return true;
	}

	// Check language-specific setting
	const languageConfig = vscode.workspace.getConfiguration(options.fallbackSection, options.scope);
	return hasModifiedValue(languageConfig.inspect(subSectionName));
}

/**
 * A cached, observable unified configuration value.
 */
export class UnifiedConfigValue<T> extends Disposable {

	private _value: T;

	private readonly _onDidChange = this._register(new vscode.EventEmitter<T>());
	public get onDidChange() { return this._onDidChange.event; }

	constructor(
		private readonly subSectionName: string,
		private readonly defaultValue: T,
		private readonly options: ReadUnifiedConfigOptions<{ languageId: string }>,
	) {
		super();

		this._value = this.read();

		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(`${unifiedConfigSection}.${subSectionName}`, options.scope ?? undefined) ||
				e.affectsConfiguration(`${options.fallbackSection}.${options.fallbackSubSectionNameOverride ?? subSectionName}`, options.scope ?? undefined)
			) {
				const newValue = this.read();
				if (newValue !== this._value) {
					this._value = newValue;
					this._onDidChange.fire(newValue);
				}
			}
		}));
	}

	private read(): T {
		return readUnifiedConfig<T>(this.subSectionName, this.defaultValue, this.options);
	}

	public getValue(): T {
		return this._value;
	}
}

export interface ResourceUnifiedConfigScope {
	readonly uri: vscode.Uri;
	readonly languageId: string;
}

/**
 * A cached, observable unified configuration value that varies per workspace folder.
 *
 * Values are keyed by the workspace folder the resource belongs to, with a separate
 * entry for resources outside any workspace folder.
 */
export class ResourceUnifiedConfigValue<T> extends Disposable {

	private readonly _cache = new Map</* workspace folder */ string, T>();

	private readonly _onDidChange = this._register(new vscode.EventEmitter<void>());
	public readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly subSectionName: string,
		private readonly defaultValue: T,
		private readonly options?: {
			readonly fallbackSubSectionNameOverride?: string;
		},
	) {
		super();

		const fallbackName = options?.fallbackSubSectionNameOverride ?? subSectionName;

		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(`${unifiedConfigSection}.${subSectionName}`) ||
				e.affectsConfiguration(`javascript.${fallbackName}`) ||
				e.affectsConfiguration(`typescript.${fallbackName}`)
			) {
				this._cache.clear();
				this._onDidChange.fire();
			}
		}));

		this._register(vscode.workspace.onDidChangeWorkspaceFolders(() => {
			this._cache.clear();
			this._onDidChange.fire();
		}));
	}

	public getValue(scope: ResourceUnifiedConfigScope): T {
		const key = this.keyFor(scope);
		const cached = this._cache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		const fallbackSection = this.fallbackSectionFor(scope.languageId);
		const value = readUnifiedConfig<T>(this.subSectionName, this.defaultValue, {
			scope: { uri: scope.uri, languageId: scope.languageId },
			fallbackSection,
			fallbackSubSectionNameOverride: this.options?.fallbackSubSectionNameOverride,
		});
		this._cache.set(key, value);
		return value;
	}

	private fallbackSectionFor(languageId: string): string {
		switch (languageId) {
			case 'javascript':
			case 'javascriptreact':
				return 'javascript';
			default:
				return 'typescript';
		}
	}

	private keyFor(scope: ResourceUnifiedConfigScope): string {
		const folder = vscode.workspace.getWorkspaceFolder(scope.uri);
		return folder ? folder.uri.toString() : '';
	}
}
