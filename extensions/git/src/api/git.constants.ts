/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as git from './git';

export type ForcePushMode = git.ForcePushMode;
export type RefType = git.RefType;
export type Status = git.Status;
export type GitErrorCodes = git.GitErrorCodes;

export const ForcePushMode = Object.freeze({
	Force: 0,
	ForceWithLease: 1,
	ForceWithLeaseIfIncludes: 2,
}) satisfies typeof git.ForcePushMode;

export const RefType = Object.freeze({
	Head: 0,
	RemoteHead: 1,
	Tag: 2,
}) satisfies typeof git.RefType;

export const Status = Object.freeze({
	INDEX_MODIFIED: 0,
	INDEX_ADDED: 1,
	INDEX_DELETED: 2,
	INDEX_RENAMED: 3,
	INDEX_COPIED: 4,

	MODIFIED: 5,
	DELETED: 6,
	UNTRACKED: 7,
	IGNORED: 8,
	INTENT_TO_ADD: 9,
	INTENT_TO_RENAME: 10,
	TYPE_CHANGED: 11,

	ADDED_BY_US: 12,
	ADDED_BY_THEM: 13,
	DELETED_BY_US: 14,
	DELETED_BY_THEM: 15,
	BOTH_ADDED: 16,
	BOTH_DELETED: 17,
	BOTH_MODIFIED: 18,
}) satisfies typeof git.Status;

export const GitErrorCodes = Object.freeze({
	BadConfigFile: 'BadConfigFile',
	BadRevision: 'BadRevision',
	AuthenticationFailed: 'AuthenticationFailed',
	NoUserNameConfigured: 'NoUserNameConfigured',
	NoUserEmailConfigured: 'NoUserEmailConfigured',
	NoRemoteRepositorySpecified: 'NoRemoteRepositorySpecified',
	NotAGitRepository: 'NotAGitRepository',
	NotASafeGitRepository: 'NotASafeGitRepository',
	NotAtRepositoryRoot: 'NotAtRepositoryRoot',
	Conflict: 'Conflict',
	StashConflict: 'StashConflict',
	UnmergedChanges: 'UnmergedChanges',
	PushRejected: 'PushRejected',
	ForcePushWithLeaseRejected: 'ForcePushWithLeaseRejected',
	ForcePushWithLeaseIfIncludesRejected: 'ForcePushWithLeaseIfIncludesRejected',
	RemoteConnectionError: 'RemoteConnectionError',
	DirtyWorkTree: 'DirtyWorkTree',
	CantOpenResource: 'CantOpenResource',
	GitNotFound: 'GitNotFound',
	CantCreatePipe: 'CantCreatePipe',
	PermissionDenied: 'PermissionDenied',
	CantAccessRemote: 'CantAccessRemote',
	RepositoryNotFound: 'RepositoryNotFound',
	RepositoryIsLocked: 'RepositoryIsLocked',
	BranchNotFullyMerged: 'BranchNotFullyMerged',
	NoRemoteReference: 'NoRemoteReference',
	InvalidBranchName: 'InvalidBranchName',
	BranchAlreadyExists: 'BranchAlreadyExists',
	NoLocalChanges: 'NoLocalChanges',
	NoStashFound: 'NoStashFound',
	LocalChangesOverwritten: 'LocalChangesOverwritten',
	NoUpstreamBranch: 'NoUpstreamBranch',
	IsInSubmodule: 'IsInSubmodule',
	WrongCase: 'WrongCase',
	CantLockRef: 'CantLockRef',
	CantRebaseMultipleBranches: 'CantRebaseMultipleBranches',
	PatchDoesNotApply: 'PatchDoesNotApply',
	NoPathFound: 'NoPathFound',
	UnknownPath: 'UnknownPath',
	EmptyCommitMessage: 'EmptyCommitMessage',
	BranchFastForwardRejected: 'BranchFastForwardRejected',
	BranchNotYetBorn: 'BranchNotYetBorn',
	TagConflict: 'TagConflict',
	CherryPickEmpty: 'CherryPickEmpty',
	CherryPickConflict: 'CherryPickConflict',
	WorktreeContainsChanges: 'WorktreeContainsChanges',
	WorktreeAlreadyExists: 'WorktreeAlreadyExists',
	WorktreeBranchAlreadyUsed: 'WorktreeBranchAlreadyUsed',
}) satisfies Record<keyof typeof git.GitErrorCodes, string>;
