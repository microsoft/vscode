/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import API from './api';
import { TypeScriptServiceConfiguration } from './configuration';
import { RelativeWorkspacePathResolver } from './relativePathResolver';

const localize = nls.loadMessageBundle();

export class TypeScriptVersion {
	constructor(
		public readonly path: string,
		private readonly _pathLabel?: string
	) { }

	public get tsServerPath(): string {
		return path.join(this.path, 'tsserver.js');
	}

	public get pathLabel(): string {
		return typeof this._pathLabel === 'undefined' ? this.path : this._pathLabel;
	}

	public get isValid(): boolean {
		return this.apiVersion !== undefined;
	}

	public get apiVersion(): API | undefined {
		const version = this.getTypeScriptVersion(this.tsServerPath);
		if (version) {
			return version;
		}

		// Allow TS developers to provide custom version
		const tsdkVersion = vscode.workspace.getConfiguration().get<string | undefined>('typescript.tsdk_version', undefined);
		if (tsdkVersion) {
			return API.fromVersionString(tsdkVersion);
		}

		return undefined;
	}

	public get versionString(): string {
		const version = this.apiVersion;
		return version ? version.versionString : localize(
			'couldNotLoadTsVersion', 'Could not load the TypeScript version at this path');
	}

	private getTypeScriptVersion(serverPath: string): API | undefined {
		if (!fs.existsSync(serverPath)) {
			return undefined;
		}

		const p = serverPath.split(path.sep);
		if (p.length <= 2) {
			return undefined;
		}
		const p2 = p.slice(0, -2);
		const modulePath = p2.join(path.sep);
		let fileName = path.join(modulePath, 'package.json');
		if (!fs.existsSync(fileName)) {
			// Special case for ts dev versions
			if (path.basename(modulePath) === 'built') {
				fileName = path.join(modulePath, '..', 'package.json');
			}
		}
		if (!fs.existsSync(fileName)) {
			return undefined;
		}

		const contents = fs.readFileSync(fileName).toString();
		let desc: any = null;
		try {
			desc = JSON.parse(contents);
		} catch (err) {
			return undefined;
		}
		if (!desc || !desc.version) {
			return undefined;
		}
		return desc.version ? API.fromVersionString(desc.version) : undefined;
	}
}

export class TypeScriptVersionProvider {

	public constructor(
		private configuration: TypeScriptServiceConfiguration
	) { }

	public updateConfiguration(configuration: TypeScriptServiceConfiguration): void {
		this.configuration = configuration;
	}

	public get defaultVersion(): TypeScriptVersion {
		return this.globalVersion || this.bundledVersion;
	}

	public get globalVersion(): TypeScriptVersion | undefined {
		if (this.configuration.globalTsdk) {
			const globals = this.loadVersionsFromSetting(this.configuration.globalTsdk);
			if (globals && globals.length) {
				return globals[0];
			}
		}
		return this.contributedTsNextVersion;
	}

	public get localVersion(): TypeScriptVersion | undefined {
		const tsdkVersions = this.localTsdkVersions;
		if (tsdkVersions && tsdkVersions.length) {
			return tsdkVersions[0];
		}

		const nodeVersions = this.localNodeModulesVersions;
		if (nodeVersions && nodeVersions.length === 1) {
			return nodeVersions[0];
		}
		return undefined;
	}

	public get localVersions(): TypeScriptVersion[] {
		const allVersions = this.localTsdkVersions.concat(this.localNodeModulesVersions);
		const paths = new Set<string>();
		return allVersions.filter(x => {
			if (paths.has(x.path)) {
				return false;
			}
			paths.add(x.path);
			return true;
		});
	}

	public get bundledVersion(): TypeScriptVersion {
		const version = this.getContributedVersion('vscode.typescript-language-features', ['..', 'node_modules']);
		if (version) {
			return version;
		}

		vscode.window.showErrorMessage(localize(
			'noBundledServerFound',
			'VS Code\'s tsserver was deleted by another application such as a misbehaving virus detection tool. Please reinstall VS Code.'));
		throw new Error('Could not find bundled tsserver.js');
	}

	private get contributedTsNextVersion(): TypeScriptVersion | undefined {
		return this.getContributedVersion('ms-vscode.vscode-typescript-next', ['node_modules']);
	}

	private getContributedVersion(extensionId: string, pathToTs: readonly string[]): TypeScriptVersion | undefined {
		try {
			const extension = vscode.extensions.getExtension(extensionId);
			if (extension) {
				const typescriptPath = path.join(extension.extensionPath, ...pathToTs, 'typescript', 'lib');
				const bundledVersion = new TypeScriptVersion(typescriptPath, '');
				if (bundledVersion.isValid) {
					return bundledVersion;
				}
			}
		} catch {
			// noop
		}
		return undefined;
	}

	private get localTsdkVersions(): TypeScriptVersion[] {
		const localTsdk = this.configuration.localTsdk;
		return localTsdk ? this.loadVersionsFromSetting(localTsdk) : [];
	}

	private loadVersionsFromSetting(tsdkPathSetting: string): TypeScriptVersion[] {
		if (path.isAbsolute(tsdkPathSetting)) {
			return [new TypeScriptVersion(tsdkPathSetting)];
		}

		const workspacePath = RelativeWorkspacePathResolver.asAbsoluteWorkspacePath(tsdkPathSetting);
		if (workspacePath !== undefined) {
			return [new TypeScriptVersion(workspacePath, tsdkPathSetting)];
		}

		return this.loadTypeScriptVersionsFromPath(tsdkPathSetting);
	}

	private get localNodeModulesVersions(): TypeScriptVersion[] {
		return this.loadTypeScriptVersionsFromPath(path.join('node_modules', 'typescript', 'lib'))
			.filter(x => x.isValid);
	}

	private loadTypeScriptVersionsFromPath(relativePath: string): TypeScriptVersion[] {
		if (!vscode.workspace.workspaceFolders) {
			return [];
		}

		const versions: TypeScriptVersion[] = [];
		for (const root of vscode.workspace.workspaceFolders) {
			let label: string = relativePath;
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
				label = path.join(root.name, relativePath);
			}

			versions.push(new TypeScriptVersion(path.join(root.uri.fsPath, relativePath), label));
		}
		return versions;
	}
}
