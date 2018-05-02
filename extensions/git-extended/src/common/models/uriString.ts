/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const sshRegex = /^.+@(([.*?]|[a-z0-9-.]+?))(:(.*?))?(\/(.*)(.git)?)?$/i;
export class UriString {
	public host: string;

	public owner: string;

	public repositoryName: string;

	public nameWithOwner: string;

	public isFileUri: boolean;

	public isScpUri: boolean;

	public isValidUri: boolean;

	public readonly url: vscode.Uri;
	constructor(
		uriString: string
	) {
		let parseUriSuccess = false;
		try {
			this.url = vscode.Uri.parse(uriString);

			parseUriSuccess = true;
			if (this.url.scheme === 'file') {
				this.setFilePath(this.url);
			} else {
				this.setUri(this.url);
			}
		} catch (e) { }

		if (!parseUriSuccess) {
			try {
				let matches = sshRegex.exec(uriString);

				if (matches) {
					this.host = matches[1];
					this.owner = matches[4];
					this.repositoryName = this.getRepositoryName(matches[6]);
					this.isScpUri = true;
				} else {
					this.setFilePath2(uriString);
				}
			} catch(e) {}
		}

		if (this.repositoryName) {
			this.nameWithOwner = this.owner ? `${this.owner}/${this.repositoryName}` : this.repositoryName;
		}
	}

	setUri(uri: vscode.Uri) {
		this.host = uri.authority;
		this.repositoryName = this.getRepositoryName(uri.path);
		this.owner = this.getOwnerName(uri.path);
	}

	setFilePath(uri: vscode.Uri) {
		this.host = '';
		this.owner = '';
		this.repositoryName = this.getRepositoryName(uri.path);
		this.isFileUri = true;
	}

	setFilePath2(path: string) {
		this.host = '';
		this.owner = '';
		this.repositoryName = this.getRepositoryName(path);
		this.isFileUri = true;
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

	toRepositoryUrl(owner: string = null): vscode.Uri {
		if (!this.isScpUri && (this.url === null || this.isFileUri)) {
			return this.url;
		}

		let scheme = 'https';
		if (this.url !== null && (this.url.scheme === 'http' || this.url.scheme === 'https')) {
			scheme = this.url.scheme;
		}

		let nameWithOwner = this.owner ? `${this.owner}/${this.repositoryName}` : this.repositoryName;

		try {
			return vscode.Uri.parse(`${scheme}://${this.host}/${nameWithOwner}`);
		} catch (e) {
			return null;
		}
	}

	equals(other: UriString) {
		return this.toRepositoryUrl().toString().toLocaleLowerCase() === other.toRepositoryUrl().toString().toLocaleLowerCase();
	}
}