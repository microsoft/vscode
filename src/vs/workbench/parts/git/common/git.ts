/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import EventEmitter = require('vs/base/common/eventEmitter');
import Lifecycle = require('vs/base/common/lifecycle');
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

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
}

export interface IHead {
	name?: string;
	commit?: string;
}

export interface IBranch extends IHead {
	upstream?: string;
	ahead?: number;
	behind?: number;
}

export interface ITag {
	name: string;
	commit: string;
}

export interface IRawStatus {
	repositoryRoot: string;
	state?: ServiceState;
	status: IRawFileStatus[];
	HEAD: IBranch;
	heads: IBranch[];
	tags: ITag[];
	remotes: IRemote[];
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

export var ModelEvents = {
	MODEL_UPDATED: 'ModelUpdated',
	STATUS_MODEL_UPDATED: 'StatusModelUpdated',
	HEAD_UPDATED: 'HEADUpdated',
	HEADS_UPDATED: 'HEADSUpdated',
	TAGS_UPDATED: 'TagsUpdated',
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
	getRename():string;
	clone(): IFileStatus;
	update(other: IFileStatus): void;
}

export interface IStatusGroup extends EventEmitter.IEventEmitter {
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

export interface IStatusModel extends EventEmitter.IEventEmitter {
	getSummary(): IStatusSummary;
	update(status: IRawFileStatus[]): void;
	getIndexStatus(): IStatusGroup;
	getWorkingTreeStatus(): IStatusGroup;
	getMergeStatus(): IStatusGroup;
	getGroups(): IStatusGroup[];
	find(path: string, type: StatusType): IFileStatus;
}

export interface IModel extends EventEmitter.IEventEmitter {
	getRepositoryRoot(): string;
	getStatus(): IStatusModel;
	getHEAD(): IBranch;
	getHeads(): IBranch[];
	getTags(): ITag[];
	getRemotes(): IRemote[];
	update(status: IRawStatus): void;
	getPS1(): string;
}

// Service operations

export interface IGitOperation extends Lifecycle.IDisposable {
	id: string;
	run(): WinJS.Promise;
}

// Service enums

export enum ServiceState {
	NotInitialized,
	NotARepo,
	NotAtRepoRoot,
	OK,
	NoGit,
	Disabled,
	NotAWorkspace
}

export enum RawServiceState {
	OK,
	GitNotFound,
	Disabled
}

export var GitErrorCodes = {
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

export var ServiceEvents = {
	STATE_CHANGED: 'stateChanged',
	REPO_CHANGED: 'repoChanged',
	OPERATION_START: 'operationStart',
	OPERATION_END: 'operationEnd',
	OPERATION: 'operation',
	ERROR: 'error',
	DISPOSE: 'dispose'
};

// Service operations

export var ServiceOperations = {
	STATUS: 'status',
	INIT: 'init',
	ADD: 'add',
	STAGE: 'stage',
	BRANCH: 'branch',
	CHECKOUT: 'checkout',
	CLEAN: 'clean',
	UNDO: 'undo',
	RESET: 'reset',
	COMMIT: 'commit',
	COMMAND: 'command',
	BACKGROUND_FETCH: 'backgroundfetch',
	PULL: 'pull',
	PUSH: 'push',
	SYNC: 'sync'
};

// Service config

export interface IGitConfiguration {
	path: string;
	autofetch: boolean;
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

export interface IGitCredentials {
	username: string;
	password: string;
	store: boolean;
}

export interface IGitServiceError extends Error {
	gitErrorCode: string;
}

export interface IPushOptions {
	setUpstream?: boolean;
}

export interface IRawGitService {
	getVersion(): WinJS.TPromise<string>;
	serviceState(): WinJS.TPromise<RawServiceState>;
	status(): WinJS.TPromise<IRawStatus>;
	init(): WinJS.TPromise<IRawStatus>;
	add(filesPaths?: string[]): WinJS.TPromise<IRawStatus>;
	stage(filePath: string, content: string): WinJS.TPromise<IRawStatus>;
	branch(name: string, checkout?: boolean): WinJS.TPromise<IRawStatus>;
	checkout(treeish?: string, filePaths?: string[]): WinJS.TPromise<IRawStatus>;
	clean(filePaths: string[]): WinJS.TPromise<IRawStatus>;
	undo(): WinJS.TPromise<IRawStatus>;
	reset(treeish:string, hard?: boolean): WinJS.TPromise<IRawStatus>;
	revertFiles(treeish:string, filePaths?: string[]): WinJS.TPromise<IRawStatus>;
	fetch(): WinJS.TPromise<IRawStatus>;
	pull(rebase?: boolean): WinJS.TPromise<IRawStatus>;
	push(remote?: string, name?: string, options?:IPushOptions): WinJS.TPromise<IRawStatus>;
	sync(): WinJS.TPromise<IRawStatus>;
	commit(message:string, amend?: boolean, stage?: boolean): WinJS.TPromise<IRawStatus>;
	detectMimetypes(path: string, treeish?: string): WinJS.TPromise<string[]>;
	show(path: string, treeish?: string): WinJS.TPromise<string>;
	onOutput(): WinJS.Promise;
}

export var GIT_SERVICE_ID = 'gitService';

export var IGitService = createDecorator<IGitService>(GIT_SERVICE_ID);

export interface IGitService extends EventEmitter.IEventEmitter {
	serviceId: ServiceIdentifier<any>;
	status(): WinJS.TPromise<IModel>;
	init(): WinJS.TPromise<IModel>;
	add(files?: IFileStatus[]): WinJS.TPromise<IModel>;
	stage(filePath: string, content: string): WinJS.TPromise<IModel>;
	branch(name: string, checkout?: boolean): WinJS.TPromise<IModel>;
	checkout(treeish?: string, files?: IFileStatus[]): WinJS.TPromise<IModel>;
	clean(files: IFileStatus[]): WinJS.TPromise<IModel>;
	undo(): WinJS.TPromise<IModel>;
	reset(treeish:string, hard?: boolean): WinJS.TPromise<IModel>;
	revertFiles(treeish:string, files?: IFileStatus[]): WinJS.TPromise<IModel>;
	fetch(): WinJS.TPromise<IModel>;
	pull(rebase?: boolean): WinJS.TPromise<IModel>;
	push(remote?: string, name?: string, options?:IPushOptions): WinJS.TPromise<IModel>;
	sync(): WinJS.TPromise<IModel>;
	commit(message:string, amend?: boolean, stage?: boolean): WinJS.TPromise<IModel>;
	detectMimetypes(path: string, treeish?: string): WinJS.Promise;
	buffer(path: string, treeish?: string): WinJS.TPromise<string>;

	getState(): ServiceState;
	getModel(): IModel;
	show(path: string, status: IFileStatus, treeish?: string, mimetype?: string): WinJS.Promise;
	getInput(status: IFileStatus): WinJS.TPromise<WorkbenchEditorCommon.EditorInput>;
	isInitialized(): boolean;
	isIdle(): boolean;
	getRunningOperations(): IGitOperation[];
	getAutoFetcher(): IAutoFetcher;

	onOutput(): WinJS.Promise;
}

// Utils

export function isValidBranchName(value: string): boolean {
	return !/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$/.test(value);
}
