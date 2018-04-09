/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Remote } from './remote';
import { getHEAD, getBranch, getRefs, getRemotes } from '../operation';

export enum RefType {
	Head,
	RemoteHead,
	Tag
}

export interface Ref {
	type: RefType;
	name?: string;
	commit?: string;
	remote?: string;
}

export interface UpstreamRef {
	remote: string;
	name: string;
}

export interface Branch extends Ref {
	upstream?: UpstreamRef;
	ahead?: number;
	behind?: number;
}

export class Repository {
	public path: string;

	private _onDidRunGitStatus = new vscode.EventEmitter<void>();
	readonly onDidRunGitStatus: vscode.Event<void> = this._onDidRunGitStatus.event;

	private _HEAD: Branch | undefined;
	get HEAD(): Branch | undefined {
		return this._HEAD;
	}

	private _refs: Ref[] = [];
	get refs(): Ref[] {
		return this._refs;
	}

	private _remotes: Remote[] = [];
	get remotes(): Remote[] {
		return this._remotes;
	}

	constructor(path: string, workspaceState: vscode.Memento) {
		this.path = path;
		this.status();
	}

	async status() {
		let HEAD: Branch | undefined;

		try {
			HEAD = await getHEAD(this);

			if (HEAD.name) {
				try {
					HEAD = await getBranch(this, HEAD.name);
				} catch (err) {
					// noop
				}
			}
		} catch (err) {
			// noop
		}

		const [refs, remotes] = await Promise.all([getRefs(this), getRemotes(this)]);
		this._HEAD = HEAD;
		this._refs = refs;
		this._remotes = remotes;

		this._onDidRunGitStatus.fire();
	}
}