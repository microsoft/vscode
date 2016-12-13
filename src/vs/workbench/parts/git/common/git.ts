/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

// Model raw interfaces

export interface IRawFileStatus {
	x: string;
	y: string;
	path: string;
	mimetype: string;
	rename?: string;
}

export interface IRemote {
	name: string;
	url: string;
}

export enum RefType {
	Head,
	RemoteHead,
	Tag
}

export interface IRef {
	name: string;
	commit: string;
	type: RefType;
	remote?: string;
}

export interface IBranch extends IRef {
	upstream?: string;
	ahead?: number;
	behind?: number;
}

export interface IRawStatus {
	repositoryRoot: string;
	state?: ServiceState;
	status: IRawFileStatus[];
	HEAD: IBranch;
	refs: IRef[];
	remotes: IRemote[];
}

export interface ICommit {
	hash: string;
	message: string;
}

// Model enums

export enum StatusType {
	INDEX,
	WORKING_TREE,
	MERGE
}

export enum Status {
	INDEX_MODIFIED,
	INDEX_ADDED,
	INDEX_DELETED,
	INDEX_RENAMED,
	INDEX_COPIED,

	MODIFIED,
	DELETED,
	UNTRACKED,
	IGNORED,

	ADDED_BY_US,
	ADDED_BY_THEM,
	DELETED_BY_US,
	DELETED_BY_THEM,
	BOTH_ADDED,
	BOTH_DELETED,
	BOTH_MODIFIED
}

// Model events

export const ModelEvents = {
	MODEL_UPDATED: 'ModelUpdated',
	STATUS_MODEL_UPDATED: 'StatusModelUpdated',
	HEAD_UPDATED: 'HEADUpdated',
	REFS_UPDATED: 'RefsUpdated',
	REMOTES_UPDATED: 'RemotesUpdated'
};

// Model interfaces

export interface IFileStatus {
	getId(): string;
	getType(): StatusType;
	getPath(): string;
	getPathComponents(): string[];
	getMimetype(): string;
	getStatus(): Status;
	getRename(): string;
	clone(): IFileStatus;
	update(other: IFileStatus): void;
}

export interface IStatusGroup extends IEventEmitter {
	getType(): StatusType;
	update(statusList: IFileStatus[]): void;
	all(): IFileStatus[];
	find(path: string): IFileStatus;
}

export interface IStatusSummary {
	hasWorkingTreeChanges: boolean;
	hasIndexChanges: boolean;
	hasMergeChanges: boolean;
}

export interface IStatusModel extends IEventEmitter {
	getSummary(): IStatusSummary;
	update(status: IRawFileStatus[]): void;
	getIndexStatus(): IStatusGroup;
	getWorkingTreeStatus(): IStatusGroup;
	getMergeStatus(): IStatusGroup;
	getGroups(): IStatusGroup[];
	find(path: string, type: StatusType): IFileStatus;
}

export interface IModel extends IEventEmitter {
	getRepositoryRoot(): string;
	getStatus(): IStatusModel;
	getHEAD(): IBranch;
	getRefs(): IRef[];
	getRemotes(): IRemote[];
	update(status: IRawStatus): void;
	getPS1(): string;
}

// Service operations

export interface IGitOperation extends IDisposable {
	id: string;
	run(): TPromise<IRawStatus>;
}

// Service enums

export enum ServiceState {
	NotInitialized,
	NotARepo,
	NotAtRepoRoot,
	OK,
	Huge,
	NoGit,
	Disabled,
	NotAWorkspace
}

export enum RawServiceState {
	OK,
	GitNotFound,
	Disabled
}

export const GitErrorCodes = {
	BadConfigFile: 'BadConfigFile',
	AuthenticationFailed: 'AuthenticationFailed',
	NoUserNameConfigured: 'NoUserNameConfigured',
	NoUserEmailConfigured: 'NoUserEmailConfigured',
	NoRemoteRepositorySpecified: 'NoRemoteRepositorySpecified',
	NotAGitRepository: 'NotAGitRepository',
	NotAtRepositoryRoot: 'NotAtRepositoryRoot',
	Conflict: 'Conflict',
	UnmergedChanges: 'UnmergedChanges',
	PushRejected: 'PushRejected',
	RemoteConnectionError: 'RemoteConnectionError',
	DirtyWorkTree: 'DirtyWorkTree',
	CantOpenResource: 'CantOpenResource',
	GitNotFound: 'GitNotFound',
	CantCreatePipe: 'CantCreatePipe',
	CantAccessRemote: 'CantAccessRemote',
	RepositoryNotFound: 'RepositoryNotFound'
};

export enum AutoFetcherState {
	Disabled,
	Inactive,
	Active,
	Fetching
}

// Service events

export const ServiceEvents = {
	STATE_CHANGED: 'stateChanged',
	REPO_CHANGED: 'repoChanged',
	OPERATION_START: 'operationStart',
	OPERATION_END: 'operationEnd',
	OPERATION: 'operation',
	ERROR: 'error',
	DISPOSE: 'dispose'
};

// Service operations

export const ServiceOperations = {
	STATUS: 'status',
	INIT: 'init',
	ADD: 'add',
	STAGE: 'stage',
	BRANCH: 'branch',
	CHECKOUT: 'checkout',
	CLEAN: 'clean',
	UNDO: 'undo',
	RESET: 'reset',
	REVERT: 'revert',
	COMMIT: 'commit',
	COMMAND: 'command',
	BACKGROUND_FETCH: 'backgroundfetch',
	PULL: 'pull',
	PUSH: 'push',
	SYNC: 'sync'
};

// Service config

export interface IGitConfiguration {
	enabled: boolean;
	path: string;
	autorefresh: boolean;
	autofetch: boolean;
	enableLongCommitWarning: boolean;
	allowLargeRepositories: boolean;
	confirmSync: boolean;
	countBadge: string;
	checkoutType: string;
}

// Service interfaces

export interface IAutoFetcher {
	state: AutoFetcherState;
	activate(): void;
	deactivate(): void;
}

export interface IGitCredentialScope {
	protocol: string;
	host: string;
	path: string;
}

export interface ICredentials {
	username: string;
	password: string;
}

export interface IGitServiceError extends Error {
	gitErrorCode: string;
}

export interface IPushOptions {
	setUpstream?: boolean;
}

export interface IRawGitService {
	onOutput: Event<string>;
	getVersion(): TPromise<string>;
	serviceState(): TPromise<RawServiceState>;
	statusCount(): TPromise<number>;
	status(): TPromise<IRawStatus>;
	init(): TPromise<IRawStatus>;
	add(filesPaths?: string[]): TPromise<IRawStatus>;
	stage(filePath: string, content: string): TPromise<IRawStatus>;
	branch(name: string, checkout?: boolean): TPromise<IRawStatus>;
	checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus>;
	clean(filePaths: string[]): TPromise<IRawStatus>;
	undo(): TPromise<IRawStatus>;
	reset(treeish: string, hard?: boolean): TPromise<IRawStatus>;
	revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus>;
	fetch(): TPromise<IRawStatus>;
	pull(rebase?: boolean): TPromise<IRawStatus>;
	push(remote?: string, name?: string, options?: IPushOptions): TPromise<IRawStatus>;
	sync(): TPromise<IRawStatus>;
	commit(message: string, amend?: boolean, stage?: boolean, signoff?: boolean): TPromise<IRawStatus>;
	detectMimetypes(path: string, treeish?: string): TPromise<string[]>;
	show(path: string, treeish?: string): TPromise<string>;
	clone(url: string, parentPath: string): TPromise<string>;
	getCommitTemplate(): TPromise<string>;
	getCommit(ref: string): TPromise<ICommit>;
}

export const GIT_SERVICE_ID = 'gitService';

export const IGitService = createDecorator<IGitService>(GIT_SERVICE_ID);

export interface IGitService extends IEventEmitter {
	_serviceBrand: any;
	allowHugeRepositories: boolean;
	onOutput: Event<string>;
	status(): TPromise<IModel>;
	init(): TPromise<IModel>;
	add(files?: IFileStatus[]): TPromise<IModel>;
	stage(filePath: string, content: string): TPromise<IModel>;
	branch(name: string, checkout?: boolean): TPromise<IModel>;
	checkout(treeish?: string, files?: IFileStatus[]): TPromise<IModel>;
	clean(files: IFileStatus[]): TPromise<IModel>;
	undo(): TPromise<IModel>;
	reset(treeish: string, hard?: boolean): TPromise<IModel>;
	revertFiles(treeish: string, files?: IFileStatus[]): TPromise<IModel>;
	fetch(): TPromise<IModel>;
	pull(rebase?: boolean): TPromise<IModel>;
	push(remote?: string, name?: string, options?: IPushOptions): TPromise<IModel>;
	sync(): TPromise<IModel>;
	commit(message: string, amend?: boolean, stage?: boolean, signoff?: boolean): TPromise<IModel>;
	detectMimetypes(path: string, treeish?: string): TPromise<string[]>;
	buffer(path: string, treeish?: string): TPromise<string>;
	clone(url: string, parentPath: string): TPromise<string>;

	getState(): ServiceState;
	getModel(): IModel;
	getInput(status: IFileStatus): TPromise<EditorInput>;
	isInitialized(): boolean;
	isIdle(): boolean;
	getRunningOperations(): IGitOperation[];
	getAutoFetcher(): IAutoFetcher;
	getCommitTemplate(): TPromise<string>;
	getCommit(ref: string): TPromise<ICommit>;
}

export interface IAskpassService {
	askpass(id: string, host: string, command: string): TPromise<ICredentials>;
}