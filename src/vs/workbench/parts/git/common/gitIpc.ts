/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import Event from 'vs/base/common/event';
import {
	IRawGitService, RawServiceState, IRawStatus, IPushOptions, IAskpassService, ICredentials,
	ServiceState, IRawFileStatus, IBranch, RefType, IRef, IRemote, ICommit
} from './git';

type ISerializer<A, B> = { to(a: A): B; from(b: B): A; };

export type IPCRawFileStatus = [string, string, string, string, string];
const RawFileStatusSerializer: ISerializer<IRawFileStatus, IPCRawFileStatus> = {
	to: a => [a.x, a.y, a.path, a.mimetype, a.rename],
	from: b => ({ x: b[0], y: b[1], path: b[2], mimetype: b[3], rename: b[4] })
};

export type IPCBranch = [string, string, RefType, string, string, number, number];
const BranchSerializer: ISerializer<IBranch, IPCBranch> = {
	to: a => [a.name, a.commit, a.type, a.remote, a.upstream, a.ahead, a.behind],
	from: b => ({ name: b[0], commit: b[1], type: b[2], remote: b[3], upstream: b[4], ahead: b[5], behind: b[6] })
};

export type IPCRef = [string, string, RefType, string];
const RefSerializer: ISerializer<IRef, IPCRef> = {
	to: a => [a.name, a.commit, a.type, a.remote],
	from: b => ({ name: b[0], commit: b[1], type: b[2], remote: b[3] })
};

export type IPCRemote = [string, string];
const RemoteSerializer: ISerializer<IRemote, IPCRemote> = {
	to: a => [a.name, a.url],
	from: b => ({ name: b[0], url: b[1] })
};

export type IPCRawStatus = [
	string,
	ServiceState,
	IPCRawFileStatus[],
	IPCBranch,
	IPCRef[],
	IPCRemote[]
];

const RawStatusSerializer: ISerializer<IRawStatus, IPCRawStatus> = {
	to: a => !a ? null : [
		a.repositoryRoot,
		a.state,
		a.status.map(RawFileStatusSerializer.to),
		BranchSerializer.to(a.HEAD),
		a.refs.map(RefSerializer.to),
		a.remotes.map(RemoteSerializer.to)
	],
	from: b => !b ? null : {
		repositoryRoot: b[0],
		state: b[1],
		status: b[2].map(RawFileStatusSerializer.from),
		HEAD: BranchSerializer.from(b[3]),
		refs: b[4].map(RefSerializer.from),
		remotes: b[5].map(RemoteSerializer.from)
	}
};

export interface IGitChannel extends IChannel {
	call(command: 'getVersion'): TPromise<string>;
	call(command: 'serviceState'): TPromise<RawServiceState>;
	call(command: 'statusCount'): TPromise<number>;
	call(command: 'status'): TPromise<IPCRawStatus>;
	call(command: 'init'): TPromise<IPCRawStatus>;
	call(command: 'add', filesPaths?: string[]): TPromise<IPCRawStatus>;
	call(command: 'stage', args: [string, string]): TPromise<IPCRawStatus>;
	call(command: 'branch', args: [string, boolean]): TPromise<IPCRawStatus>;
	call(command: 'checkout', args: [string, string[]]): TPromise<IPCRawStatus>;
	call(command: 'clean', filePaths: string[]): TPromise<IPCRawStatus>;
	call(command: 'undo'): TPromise<IPCRawStatus>;
	call(command: 'reset', args: [string, boolean]): TPromise<IPCRawStatus>;
	call(command: 'revertFiles', args: [string, string[]]): TPromise<IPCRawStatus>;
	call(command: 'fetch'): TPromise<IPCRawStatus>;
	call(command: 'pull', rebase?: boolean): TPromise<IPCRawStatus>;
	call(command: 'push', args: [string, string, IPushOptions]): TPromise<IPCRawStatus>;
	call(command: 'sync'): TPromise<IPCRawStatus>;
	call(command: 'commit', args: [string, boolean, boolean, boolean]): TPromise<IPCRawStatus>;
	call(command: 'detectMimetypes', args: [string, string]): TPromise<string[]>;
	call(command: 'show', args: [string, string]): TPromise<string>;
	call(command: 'clone', args: [string, string]): TPromise<string>;
	call(command: 'onOutput'): TPromise<void>;
	call(command: 'getCommitTemplate'): TPromise<string>;
	call(command: 'getCommit', ref: string): TPromise<ICommit>;
	call(command: string, args?: any): TPromise<any>;
}

export class GitChannel implements IGitChannel {

	constructor(private service: TPromise<IRawGitService>) { }

	call(command: string, args?: any): TPromise<any> {
		switch (command) {
			case 'getVersion': return this.service.then(s => s.getVersion());
			case 'serviceState': return this.service.then(s => s.serviceState());
			case 'statusCount': return this.service.then(s => s.statusCount());
			case 'status': return this.service.then(s => s.status()).then(RawStatusSerializer.to);
			case 'init': return this.service.then(s => s.init()).then(RawStatusSerializer.to);
			case 'add': return this.service.then(s => s.add(args)).then(RawStatusSerializer.to);
			case 'stage': return this.service.then(s => s.stage(args[0], args[1])).then(RawStatusSerializer.to);
			case 'branch': return this.service.then(s => s.branch(args[0], args[1])).then(RawStatusSerializer.to);
			case 'checkout': return this.service.then(s => s.checkout(args[0], args[1])).then(RawStatusSerializer.to);
			case 'clean': return this.service.then(s => s.clean(args)).then(RawStatusSerializer.to);
			case 'undo': return this.service.then(s => s.undo()).then(RawStatusSerializer.to);
			case 'reset': return this.service.then(s => s.reset(args[0], args[1])).then(RawStatusSerializer.to);
			case 'revertFiles': return this.service.then(s => s.revertFiles(args[0], args[1])).then(RawStatusSerializer.to);
			case 'fetch': return this.service.then(s => s.fetch()).then(RawStatusSerializer.to);
			case 'pull': return this.service.then(s => s.pull(args)).then(RawStatusSerializer.to);
			case 'push': return this.service.then(s => s.push(args[0], args[1], args[2])).then(RawStatusSerializer.to);
			case 'sync': return this.service.then(s => s.sync()).then(RawStatusSerializer.to);
			case 'commit': return this.service.then(s => s.commit(args[0], args[1], args[2], args[3])).then(RawStatusSerializer.to);
			case 'detectMimetypes': return this.service.then(s => s.detectMimetypes(args[0], args[1]));
			case 'show': return this.service.then(s => s.show(args[0], args[1]));
			case 'clone': return this.service.then(s => s.clone(args[0], args[1]));
			case 'onOutput': return this.service.then(s => eventToCall(s.onOutput));
			case 'getCommitTemplate': return this.service.then(s => s.getCommitTemplate());
			case 'getCommit': return this.service.then(s => s.getCommit(args));
		}
		return undefined;
	}
}

export class UnavailableGitChannel implements IGitChannel {

	call(command: string): TPromise<any> {
		switch (command) {
			case 'serviceState': return TPromise.as(RawServiceState.GitNotFound);
			default: return TPromise.as(null);
		}
	}
}

export class GitChannelClient implements IRawGitService {

	constructor(private channel: IGitChannel) { }

	private _onOutput = eventFromCall(this.channel, 'onOutput');
	get onOutput(): Event<string> { return this._onOutput; }

	getVersion(): TPromise<string> {
		return this.channel.call('getVersion');
	}

	serviceState(): TPromise<RawServiceState> {
		return this.channel.call('serviceState');
	}

	statusCount(): TPromise<number> {
		return this.channel.call('statusCount');
	}

	status(): TPromise<IRawStatus> {
		return this.channel.call('status').then(RawStatusSerializer.from);
	}

	init(): TPromise<IRawStatus> {
		return this.channel.call('init').then(RawStatusSerializer.from);
	}

	add(filesPaths?: string[]): TPromise<IRawStatus> {
		return this.channel.call('add', filesPaths).then(RawStatusSerializer.from);
	}

	stage(filePath: string, content: string): TPromise<IRawStatus> {
		return this.channel.call('stage', [filePath, content]).then(RawStatusSerializer.from);
	}

	branch(name: string, checkout?: boolean): TPromise<IRawStatus> {
		return this.channel.call('branch', [name, checkout]).then(RawStatusSerializer.from);
	}

	checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.channel.call('checkout', [treeish, filePaths]).then(RawStatusSerializer.from);
	}

	clean(filePaths: string[]): TPromise<IRawStatus> {
		return this.channel.call('clean', filePaths).then(RawStatusSerializer.from);
	}

	undo(): TPromise<IRawStatus> {
		return this.channel.call('undo').then(RawStatusSerializer.from);
	}

	reset(treeish: string, hard?: boolean): TPromise<IRawStatus> {
		return this.channel.call('reset', [treeish, hard]).then(RawStatusSerializer.from);
	}

	revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.channel.call('revertFiles', [treeish, filePaths]).then(RawStatusSerializer.from);
	}

	fetch(): TPromise<IRawStatus> {
		return this.channel.call('fetch').then(RawStatusSerializer.from);
	}

	pull(rebase?: boolean): TPromise<IRawStatus> {
		return this.channel.call('pull', rebase).then(RawStatusSerializer.from);
	}

	push(remote?: string, name?: string, options?: IPushOptions): TPromise<IRawStatus> {
		return this.channel.call('push', [remote, name, options]).then(RawStatusSerializer.from);
	}

	sync(): TPromise<IRawStatus> {
		return this.channel.call('sync').then(RawStatusSerializer.from);
	}

	commit(message: string, amend?: boolean, stage?: boolean, signoff?: boolean): TPromise<IRawStatus> {
		return this.channel.call('commit', [message, amend, stage, signoff]).then(RawStatusSerializer.from);
	}

	detectMimetypes(path: string, treeish?: string): TPromise<string[]> {
		return this.channel.call('detectMimetypes', [path, treeish]);
	}

	show(path: string, treeish?: string): TPromise<string> {
		return this.channel.call('show', [path, treeish]);
	}

	clone(url: string, parentPath: string): TPromise<string> {
		return this.channel.call('clone', [url, parentPath]);
	}

	getCommitTemplate(): TPromise<string> {
		return this.channel.call('getCommitTemplate');
	}

	getCommit(ref: string): TPromise<ICommit> {
		return this.channel.call('getCommit', ref);
	}
}

export interface IAskpassChannel extends IChannel {
	call(command: 'askpass', args: [string, string, string]): TPromise<ICredentials>;
	call(command: string, args: any[]): TPromise<any>;
}

export class AskpassChannel implements IAskpassChannel {

	constructor(private service: IAskpassService) { }

	call(command: string, args: [string, string, string]): TPromise<any> {
		switch (command) {
			case 'askpass': return this.service.askpass(args[0], args[1], args[2]);
		}
		return undefined;
	}
}

export class AskpassChannelClient implements IAskpassService {

	constructor(private channel: IAskpassChannel) { }

	askpass(id: string, host: string, command: string): TPromise<ICredentials> {
		return this.channel.call('askpass', [id, host, command]);
	}
}