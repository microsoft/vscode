/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString, Uri, workspace, l10n } from 'vscode';
import { XHRRequest } from 'request-light';

import type * as cp from 'child_process';
import { dirname } from 'path';
import { fromNow } from './date';

const USER_AGENT = 'Visual Studio Code';

export interface ViewPackageInfo {
	description: string;
	version?: string;
	time?: string;
	homepage?: string;
}

/**
 * Resolves package metadata for npm package names and formats hover content.
 */
export class NpmPackageInfoProvider {

	public constructor(
		private readonly xhr: XHRRequest,
		private readonly npmCommandPath: string | undefined,
	) {
	}

	public isEnabled(): boolean {
		return !!this.npmCommandPath || this.onlineEnabled();
	}

	public getDocumentation(description: string | undefined, version: string | undefined, time: string | undefined, homepage: string | undefined): MarkdownString {
		const str = new MarkdownString();
		if (description) {
			str.appendText(description);
		}
		if (version) {
			str.appendText('\n\n');
			str.appendText(time ? l10n.t("Latest version: {0} published {1}", version, fromNow(Date.parse(time), true, true)) : l10n.t("Latest version: {0}", version));
		}
		if (homepage) {
			str.appendText('\n\n');
			str.appendText(homepage);
		}
		return str;
	}

	public async fetchPackageInfo(pack: string, resource: Uri | undefined): Promise<ViewPackageInfo | undefined> {
		if (!this.isValidNPMName(pack)) {
			return undefined;
		}

		let info: ViewPackageInfo | undefined;
		if (this.npmCommandPath) {
			info = await this.npmView(this.npmCommandPath, pack, resource);
		}
		if (!info && this.onlineEnabled()) {
			info = await this.npmjsView(pack);
		}
		return info;
	}

	private onlineEnabled(): boolean {
		return !!workspace.getConfiguration('npm').get('fetchOnlinePackageInfo');
	}

	private isValidNPMName(name: string): boolean {
		// following rules from https://github.com/npm/validate-npm-package-name,
		// leading slash added as additional security measure
		if (!name || name.length > 214 || name.match(/^[-_.\s]/)) {
			return false;
		}
		const match = name.match(/^(?:@([^/~\s)('!*]+?)[/])?([^/~)('!*\s]+?)$/);
		if (match) {
			const scope = match[1];
			if (scope && encodeURIComponent(scope) !== scope) {
				return false;
			}
			const value = match[2];
			return encodeURIComponent(value) === value;
		}
		return false;
	}

	private async npmView(npmCommandPath: string, pack: string, resource: Uri | undefined): Promise<ViewPackageInfo | undefined> {
		const cp = await import('child_process');
		return new Promise((resolve, _reject) => {
			const args = ['view', '--json', '--', pack, 'description', 'dist-tags.latest', 'homepage', 'version', 'time'];
			const cwd = resource && resource.scheme === 'file' ? dirname(resource.fsPath) : undefined;

			// corepack npm wrapper would automatically update package.json. disable that behavior.
			// COREPACK_ENABLE_AUTO_PIN disables the package.json overwrite, and
			// COREPACK_ENABLE_PROJECT_SPEC makes the npm view command succeed
			//   even if packageManager specified a package manager other than npm.
			const env = { ...process.env, COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_ENABLE_PROJECT_SPEC: '0' };
			let options: cp.ExecFileOptions = { cwd, env };
			let commandPath: string = npmCommandPath;
			if (process.platform === 'win32') {
				options = { cwd, env, shell: true };
				commandPath = `"${npmCommandPath}"`;
			}
			cp.execFile(commandPath, args, options, (error, stdout) => {
				if (!error) {
					try {
						const content = JSON.parse(stdout);
						const version = content['dist-tags.latest'] || content['version'];
						resolve({
							description: content['description'],
							version,
							time: content.time?.[version],
							homepage: content['homepage']
						});
						return;
					} catch (e) {
						// ignore
					}
				}
				resolve(undefined);
			});
		});
	}

	private async npmjsView(pack: string): Promise<ViewPackageInfo | undefined> {
		const queryUrl = 'https://registry.npmjs.org/' + encodeURIComponent(pack);
		try {
			const success = await this.xhr({
				url: queryUrl,
				headers: { agent: USER_AGENT }
			});
			const obj = JSON.parse(success.responseText);
			const version = obj['dist-tags']?.latest || Object.keys(obj.versions).pop() || '';
			return {
				description: obj.description || '',
				version,
				time: obj.time?.[version],
				homepage: obj.homepage || ''
			};
		}
		catch (e) {
			// ignore
		}
		return undefined;
	}
}
