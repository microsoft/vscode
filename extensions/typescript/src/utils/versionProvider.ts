/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import * as path from 'path';
import * as fs from 'fs';

import { workspace, window } from "vscode";

import { TypeScriptServiceConfiguration } from "./configuration";
import API from './api';


export interface TypeScriptVersion {
	label?: string;
	version: API;
	path: string;
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
		return undefined;
	}

	public get localTsdkVersion(): TypeScriptVersion | undefined {
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
		const versions: TypeScriptVersion[] = [];
		const tsdkVersions = this.localTsdkVersions;
		if (tsdkVersions && tsdkVersions.length) {
			versions.push(tsdkVersions[0]);
		}

		const paths = new Set<string>();
		return versions.concat(this.localNodeModulesVersions).filter(x => {
			if (paths.has(x.path)) {
				return false;
			}
			paths.add(x.path);
			return true;
		});
	}

	public get bundledVersion(): TypeScriptVersion {
		try {
			const bundledVersion = this.loadFromPath(require.resolve('typescript/lib/tsserver.js'));
			if (bundledVersion) {
				return bundledVersion;
			}
		} catch (e) {
			// noop
		}
		window.showErrorMessage(localize(
			'noBundledServerFound',
			'VSCode\'s tsserver was deleted by another application such as a misbehaving virus detection tool. Please reinstall VS Code.'));
		throw new Error('Could not find bundled tsserver.js');
	}

	private get localTsdkVersions(): TypeScriptVersion[] {
		const localTsdk = this.configuration.localTsdk;
		return localTsdk ? this.loadVersionsFromSetting(localTsdk) : [];
	}

	private loadVersionsFromSetting(tsdkPathSetting: string): TypeScriptVersion[] {
		if (path.isAbsolute(tsdkPathSetting)) {
			return this.getTypeScriptsFromPaths(tsdkPathSetting);
		}

		for (const root of workspace.workspaceFolders || []) {
			const rootPrefixes = [`./${root.name}/`, `${root.name}/`, `.\\${root.name}\\`, `${root.name}\\`];
			for (const rootPrefix of rootPrefixes) {
				if (tsdkPathSetting.startsWith(rootPrefix)) {
					const workspacePath = path.join(root.uri.fsPath, tsdkPathSetting.replace(rootPrefix, ''));
					const version = this.loadFromPath(path.join(workspacePath, 'tsserver.js'));
					if (version) {
						version.label = tsdkPathSetting;
						return [version];
					}
					return [];
				}
			}
		}

		return this.getTypeScriptsFromPaths(tsdkPathSetting);
	}

	private get localNodeModulesVersions(): TypeScriptVersion[] {
		return this.getTypeScriptsFromPaths(path.join('node_modules', 'typescript', 'lib'));
	}

	private getTypeScriptsFromPaths(typeScriptPath: string): TypeScriptVersion[] {
		if (path.isAbsolute(typeScriptPath)) {
			const version = this.loadFromPath(path.join(typeScriptPath, 'tsserver.js'));
			return version ? [version] : [];
		}

		if (!workspace.workspaceFolders) {
			return [];
		}

		const versions: TypeScriptVersion[] = [];
		for (const root of workspace.workspaceFolders) {
			const p = path.join(root.uri.fsPath, typeScriptPath, 'tsserver.js');

			let label: string | undefined = undefined;
			if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
				label = path.join(root.name, typeScriptPath);
			}

			const version = this.loadFromPath(p, label);
			if (version) {
				versions.push(version);
			}
		}
		return versions;
	}

	public loadFromPath(tsServerPath: string, label?: string): TypeScriptVersion | undefined {
		if (!fs.existsSync(tsServerPath)) {
			return undefined;
		}

		const version = this.getTypeScriptVersion(tsServerPath);
		if (version) {
			return { path: tsServerPath, version, label };
		}

		// Allow TS developers to provide custom version
		const tsdkVersion = workspace.getConfiguration().get<string | undefined>('typescript.tsdk_version', undefined);
		if (tsdkVersion) {
			return { path: tsServerPath, version: new API(tsdkVersion), label };
		}

		return undefined;
	}

	private getTypeScriptVersion(serverPath: string): API | undefined {
		if (!fs.existsSync(serverPath)) {
			return undefined;
		}

		let p = serverPath.split(path.sep);
		if (p.length <= 2) {
			return undefined;
		}
		let p2 = p.slice(0, -2);
		let modulePath = p2.join(path.sep);
		let fileName = path.join(modulePath, 'package.json');
		if (!fs.existsSync(fileName)) {
			return undefined;
		}
		let contents = fs.readFileSync(fileName).toString();
		let desc: any = null;
		try {
			desc = JSON.parse(contents);
		} catch (err) {
			return undefined;
		}
		if (!desc || !desc.version) {
			return undefined;
		}
		return desc.version ? new API(desc.version) : undefined;
	}
}
