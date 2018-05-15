/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export enum ProtocolType {
	Local,
	HTTP,
	SSH,
	GIT,
	OTHER
}

const gitProtocolRegex = [
	new RegExp('^git@(.+):(.+)/(.+?)(?:/|.git)?$'),
	new RegExp('^git:(.+)/(.+)/(.+?)(?:/|.git)?$')
];
const sshProtocolRegex = [
	new RegExp('^ssh://git@(.+)/(.+)/(.+?)(?:/|.git)?$')
];

export class Protocol {
	public type: ProtocolType = ProtocolType.OTHER;
	public host: string = '';

	public owner: string = '';

	public repositoryName: string = '';

	public get nameWithOwner(): string {
		return this.owner ? `${this.owner}/${this.repositoryName}` : this.repositoryName;
	}

	public isFileUri: boolean;

	public isScpUri: boolean;

	public isValidUri: boolean;

	public readonly url: vscode.Uri;
	constructor(
		uriString: string
	) {
		try {
			this.url = vscode.Uri.parse(uriString);

			if (this.url.scheme === 'file') {
				this.type = ProtocolType.Local;
				this.repositoryName = this.getRepositoryName(this.url.path);
				return;
			}

			if (this.url.scheme === 'https' || this.url.scheme === 'http') {
				this.type = ProtocolType.HTTP;
				this.host = this.url.authority;
				this.repositoryName = this.getRepositoryName(this.url.path);
				this.owner = this.getOwnerName(this.url.path);
				return;
			}
		} catch (e) { }

		try {
			for (const regex of gitProtocolRegex) {
				const result = uriString.match(regex);
				if (!result) {
					continue;
				}

				this.host = result[1];
				this.owner = result[2];
				this.repositoryName = result[3];
				this.type = ProtocolType.GIT;
				return;
			}

			for (const regex of sshProtocolRegex) {
				const result = uriString.match(regex);
				if (!result) {
					continue;
				}

				this.host = result[1];
				this.owner = result[2];
				this.repositoryName = result[3];
				this.type = ProtocolType.SSH;
				return;
			}
		} catch (e) { }
	}

	getRepositoryName(path: string) {
		let normalized = path.replace('\\', '/');
		let lastIndex = normalized.lastIndexOf('/');
		let lastSegment = normalized.substr(lastIndex + 1);
		if (lastSegment === '' || lastSegment === '/') {
			return null;
		}

		return lastSegment.replace(/\/$/, '').replace(/\.git$/, '');
	}

	getOwnerName(path: string) {
		let normalized = path.replace('\\', '/');
		let fragments = normalized.split('/');
		if (fragments.length > 1) {
			return fragments[fragments.length - 2];
		}

		return null;
	}

	normalizeUri(): vscode.Uri {
		if (this.type === ProtocolType.OTHER && !this.url) {
			return null;
		}

		if (this.isFileUri) {
			return this.url;
		}

		let scheme = 'https';
		if (this.url && (this.url.scheme === 'http' || this.url.scheme === 'https')) {
			scheme = this.url.scheme;
		}

		try {
			return vscode.Uri.parse(`${scheme}://${this.host}/${this.nameWithOwner}`);
		} catch (e) {
			return null;
		}
	}

	equals(other: Protocol) {
		return this.normalizeUri().toString().toLocaleLowerCase() === other.normalizeUri().toString().toLocaleLowerCase();
	}
}