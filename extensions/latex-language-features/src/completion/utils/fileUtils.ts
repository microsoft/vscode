/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * File system utilities that work in both Node.js and Web environments
 */
export class FileSystemUtils {
	/**
	 * Check if a file exists
	 */
	static async exists(uri: vscode.Uri): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(uri);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Read a file as text
	 */
	static async readFile(uri: vscode.Uri): Promise<string> {
		try {
			const data = await vscode.workspace.fs.readFile(uri);
			const content = new TextDecoder('utf-8').decode(data);
			return content;
		} catch (error) {
			throw new Error(`Failed to read file ${uri.toString()}: ${error}`);
		}
	}

	/**
	 * Read a file synchronously (Node.js only, falls back to async in web)
	 * @deprecated Use readFile instead for web compatibility
	 */
	static readFileSync(_uri: vscode.Uri): string | null {
		// In web, we can't do sync reads, so return null
		// Callers should use readFile instead
		return null;
	}

	/**
	 * Read directory contents
	 */
	static async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		try {
			return await vscode.workspace.fs.readDirectory(uri);
		} catch (error) {
			throw new Error(`Failed to read directory ${uri.toString()}: ${error}`);
		}
	}

	/**
	 * Join path segments using vscode.Uri
	 */
	static joinUri(base: vscode.Uri, ...segments: string[]): vscode.Uri {
		return vscode.Uri.joinPath(base, ...segments);
	}

	/**
	 * Convert a file system path to URI
	 */
	static pathToUri(path: string): vscode.Uri {
		return vscode.Uri.file(path);
	}

	/**
	 * Get file name from URI
	 */
	static basename(uri: vscode.Uri): string {
		const parts = uri.path.split('/');
		return parts[parts.length - 1] || '';
	}

	/**
	 * Get directory name from URI
	 */
	static dirname(uri: vscode.Uri): vscode.Uri {
		const parts = uri.path.split('/').filter(p => p);
		if (parts.length === 0) {
			return uri;
		}
		parts.pop();
		return uri.with({ path: '/' + parts.join('/') });
	}
}

