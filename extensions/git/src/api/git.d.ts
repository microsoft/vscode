/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, SourceControlInputBox, Event, CancellationToken } from 'vscode';

export interface Git {
	readonly path: string;
}

export interface InputBox {
	value: string;
}

export const enum RefType {
	Head,
	RemoteHead,
	Tag
}

export interface Ref {
	readonly type: RefType;
	readonly name?: string;
	readonly commit?: string;
	readonly remote?: string;
}

export interface UpstreamRef {
	readonly remote: string;
	readonly name: string;
}

export interface Branch extends Ref {
	readonly upstream?: UpstreamRef;
	readonly ahead?: number;
	readonly behind?: number;
}

export interface Commit {
	readonly hash: string;
	readonly message: string;
	readonly parents: string[];
}

export interface Submodule {
	readonly name: string;
	readonly path: string;
	readonly url: string;
}

export interface Remote {
	readonly name: string;
	readonly fetchUrl?: string;
	readonly pushUrl?: string;
	readonly isReadOnly: boolean;
}

export interface Change {
	// TODO
}

export interface RepositoryState {
	readonly HEAD: Branch | undefined;
	readonly refs: Ref[];
	readonly remotes: Remote[];
	readonly submodules: Submodule[];
	readonly rebaseCommit: Commit | undefined;

	readonly mergeChanges: Change[];
	readonly indexChanges: Change[];
	readonly workingTreeChanges: Change[];

	readonly onDidChange: Event<void>;
}

export interface Repository {

	readonly rootUri: Uri;
	readonly inputBox: InputBox;
	readonly state: RepositoryState;

	getConfigs(): Promise<{ key: string; value: string; }[]>;
	getConfig(key: string): Promise<string>;
	setConfig(key: string, value: string): Promise<string>;

	show(ref: string, path: string): Promise<string>;
	getCommit(ref: string): Promise<Commit>;
	getObjectDetails(treeish: string, path: string): Promise<{ mode: string, object: string, size: number }>;

	diffWithHEAD(path: string): Promise<string>;
	diffWith(ref: string, path: string): Promise<string>;
	diffIndexWithHEAD(path: string): Promise<string>;
	diffIndexWith(ref: string, path: string): Promise<string>;
	diffBlobs(object1: string, object2: string): Promise<string>;
	diffBetween(ref1: string, ref2: string, path: string): Promise<string>;

	hashObject(data: string): Promise<string>;

	createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
	deleteBranch(name: string): Promise<void>;
	getBranch(name: string): Promise<Branch>;
	setBranchUpstream(name: string, upstream: string): Promise<void>;

	getMergeBase(ref1: string, ref2: string): Promise<string>;

	status(): Promise<void>;
	checkout(treeish: string): Promise<void>;

	addRemote(name: string, url: string): Promise<void>;
	removeRemote(name: string): Promise<void>;

	fetch(remote?: string, ref?: string): Promise<void>;
	pull(): Promise<void>;
}

export interface API {
	readonly git: Git;
	readonly repositories: Repository[];
	readonly onDidOpenRepository: Event<Repository>;
	readonly onDidCloseRepository: Event<Repository>;
}

export interface GitExtension {

	/**
	 * Returns a specific API version.
	 *
	 * @param version Version number.
	 * @returns API instance
	 */
	getAPI(version: 1): API;
}

export const enum GitErrorCodes {
	BadConfigFile = 'BadConfigFile',
	AuthenticationFailed = 'AuthenticationFailed',
	NoUserNameConfigured = 'NoUserNameConfigured',
	NoUserEmailConfigured = 'NoUserEmailConfigured',
	NoRemoteRepositorySpecified = 'NoRemoteRepositorySpecified',
	NotAGitRepository = 'NotAGitRepository',
	NotAtRepositoryRoot = 'NotAtRepositoryRoot',
	Conflict = 'Conflict',
	UnmergedChanges = 'UnmergedChanges',
	PushRejected = 'PushRejected',
	RemoteConnectionError = 'RemoteConnectionError',
	DirtyWorkTree = 'DirtyWorkTree',
	CantOpenResource = 'CantOpenResource',
	GitNotFound = 'GitNotFound',
	CantCreatePipe = 'CantCreatePipe',
	CantAccessRemote = 'CantAccessRemote',
	RepositoryNotFound = 'RepositoryNotFound',
	RepositoryIsLocked = 'RepositoryIsLocked',
	BranchNotFullyMerged = 'BranchNotFullyMerged',
	NoRemoteReference = 'NoRemoteReference',
	InvalidBranchName = 'InvalidBranchName',
	BranchAlreadyExists = 'BranchAlreadyExists',
	NoLocalChanges = 'NoLocalChanges',
	NoStashFound = 'NoStashFound',
	LocalChangesOverwritten = 'LocalChangesOverwritten',
	NoUpstreamBranch = 'NoUpstreamBranch',
	IsInSubmodule = 'IsInSubmodule',
	WrongCase = 'WrongCase',
}