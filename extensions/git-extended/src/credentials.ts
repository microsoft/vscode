/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Configuration } from './configuration';
import { Remote } from './common/models/remote';
import { fill } from 'git-credential-node';
const Octokit = require('@octokit/rest');

export class CredentialStore {
	private octokits: { [key: string]: any };
	private configuration: Configuration;
	constructor(configuration: Configuration) {
		this.configuration = configuration;
		this.octokits = [];
	}

	async getOctokit(remote: Remote) {
		if (this.octokits[remote.url]) {
			return this.octokits[remote.url];
		}

		if (this.configuration.host === remote.hostname && this.configuration.accessToken) {
			this.octokits[remote.url] = Octokit({});
			this.octokits[remote.url].authenticate({
				type: 'token',
				token: this.configuration.accessToken
			});
			return this.octokits[remote.url];
		} else {
			const data = await fill(remote.url);
			if (!data) {
				return null;
			}
			this.octokits[remote.url] = Octokit({});
			this.octokits[remote.url].authenticate({
				type: 'basic',
				username: data.username,
				password: data.password
			});

			return this.octokits[remote.url];
		}
	}
}
