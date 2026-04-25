/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Stores disabled customization URIs for a harness using VS Code's
 * extension context Memento storage (`globalState` / `workspaceState`).
 *
 * This mirrors the core `promptsServiceImpl` disablement storage but
 * lives in the extension host, giving each external harness (Copilot CLI,
 * Claude) its own independent disabled set.
 *
 * Storage keys follow the pattern: `<prefix>.disabled.<type>` for
 * workspace scope and `<prefix>.disabled.global.<type>` for profile scope.
 */
export class ExtensionDisablementStore {

	constructor(
		private readonly prefix: string,
		private readonly globalState: vscode.Memento,
		private readonly workspaceState: vscode.Memento,
	) { }

	/**
	 * Returns true if the given URI is disabled for the given type
	 * (checking both workspace and global scopes).
	 */
	isDisabled(uri: URI, type: string): boolean {
		return this.getDisabledUris(type).has(uri.toString());
	}

	/**
	 * Returns all disabled URIs for the given type, merging workspace
	 * and global scopes.
	 */
	getDisabledUris(type: string): Set<string> {
		const result = new Set<string>();
		for (const uriStr of this._readList(this._workspaceKey(type), this.workspaceState)) {
			result.add(uriStr);
		}
		for (const uriStr of this._readList(this._globalKey(type), this.globalState)) {
			result.add(uriStr);
		}
		return result;
	}

	/**
	 * Enables or disables a URI for the given type and scope.
	 * When enabling, the URI is removed from both scopes.
	 */
	async setDisabled(uri: URI, type: string, disabled: boolean, scope: 'global' | 'workspace'): Promise<void> {
		const uriStr = uri.toString();
		if (disabled) {
			const key = scope === 'workspace' ? this._workspaceKey(type) : this._globalKey(type);
			const memento = scope === 'workspace' ? this.workspaceState : this.globalState;
			const list = this._readList(key, memento);
			if (!list.includes(uriStr)) {
				await memento.update(key, [...list, uriStr]);
			}
		} else {
			// Remove from both scopes when enabling
			await this._removeFromScope(uriStr, type, this.workspaceState, this._workspaceKey(type));
			await this._removeFromScope(uriStr, type, this.globalState, this._globalKey(type));
		}
	}

	private _readList(key: string, memento: vscode.Memento): string[] {
		const value = memento.get<string[]>(key);
		return Array.isArray(value) ? value.filter(s => typeof s === 'string') : [];
	}

	private async _removeFromScope(uriStr: string, _type: string, memento: vscode.Memento, key: string): Promise<void> {
		const list = this._readList(key, memento);
		const index = list.indexOf(uriStr);
		if (index >= 0) {
			const filtered = list.filter(s => s !== uriStr);
			await memento.update(key, filtered.length > 0 ? filtered : undefined);
		}
	}

	private _workspaceKey(type: string): string {
		return `${this.prefix}.disabled.${type}`;
	}

	private _globalKey(type: string): string {
		return `${this.prefix}.disabled.global.${type}`;
	}
}
