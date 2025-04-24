/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { homedir } from 'os';
import { platform } from '../../../base/common/platform.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { INativeMcpDiscoveryData, INativeMcpDiscoveryHelperService } from '../common/nativeMcpDiscoveryHelper.js';

export class NativeMcpDiscoveryHelperService implements INativeMcpDiscoveryHelperService {
	declare readonly _serviceBrand: undefined;

	constructor() { }

	load(): Promise<INativeMcpDiscoveryData> {
		return Promise.resolve({
			platform,
			homedir: URI.file(homedir()),
			winAppData: this.uriFromEnvVariable('APPDATA'),
			xdgHome: this.uriFromEnvVariable('XDG_CONFIG_HOME'),
		});
	}

	getWmcp(args: string[]): Promise<{ id: string; label: string; uri: UriComponents }[]> {
		return new Promise<{ id: string; label: string; uri: UriComponents }[]>((resolve, reject) => {
			const child = spawn(args[0], args.slice(1), { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '' } });
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			child.stdout.on('data', data => stdout.push(data));
			child.stderr.on('data', data => stderr.push(data));

			child.on('error', reject);

			child.on('close', code => {
				if (code !== 0) {
					reject(new Error(`Process exited with code ${code}\n${Buffer.concat(stderr)}${Buffer.concat(stdout)}`));
					return;
				}

				try {
					const result: Record<string, { Description: string; Id: string; Name: string }> = JSON.parse(Buffer.concat(stdout).toString());
					const entries = Object.entries(result).map(([url, obj]) => {
						return { id: obj.Id, label: obj.Name, uri: URI.parse(url) };
					});

					resolve(entries);
				} catch (e) {
					reject(new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}\n${stderr}${stdout}`));
				}
			});

			child.stdin.write(JSON.stringify({ message: 'initialize' }) + '\r\n');
			child.stdin.end();
		});
	}

	private uriFromEnvVariable(varName: string) {
		const envVar = process.env[varName];
		if (!envVar) {
			return undefined;
		}
		return URI.file(envVar);
	}
}

