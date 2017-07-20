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
			const globals = this.getTypeScriptsFromPaths(this.configuration.globalTsdk);
			if (globals && globals.length) {
				return globals[0];
			}
		}
		return undefined;
	}

	public get localVersion(): TypeScriptVersion | undefined {
		const tsdkVersions = this.localTsdkVersions;
		if (tsdkVersions && tsdkVersions.length) {
			return tsdkVersions[0];
		}

		const nodeVersions = this.localNodeModulesVersions;
		if (nodeVersions && nodeVersions.length) {
			return nodeVersions[0];
		}
		return undefined;
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
		return this.configuration.localTsdk
			? this.getTypeScriptsFromPaths(this.configuration.localTsdk)
			: [];
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
		for (const root of [workspace.workspaceFolders[0]]) {
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
