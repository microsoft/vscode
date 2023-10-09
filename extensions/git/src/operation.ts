/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogOutputChannel } from 'vscode';

export const enum OperationKind {
	Add = 'Add',
	AddNoProgress = 'AddNoProgress',
	Apply = 'Apply',
	Blame = 'Blame',
	Branch = 'Branch',
	CheckIgnore = 'CheckIgnore',
	Checkout = 'Checkout',
	CheckoutTracking = 'CheckoutTracking',
	CherryPick = 'CherryPick',
	Clean = 'Clean',
	CleanNoProgress = 'CleanNoProgress',
	Commit = 'Commit',
	Config = 'Config',
	DeleteBranch = 'DeleteBranch',
	DeleteRef = 'DeleteRef',
	DeleteRemoteTag = 'DeleteRemoteTag',
	DeleteTag = 'DeleteTag',
	Diff = 'Diff',
	Fetch = 'Fetch',
	FetchNoProgress = 'FetchNoProgress',
	FindTrackingBranches = 'GetTracking',
	GetBranch = 'GetBranch',
	GetBranches = 'GetBranches',
	GetCommitTemplate = 'GetCommitTemplate',
	GetObjectDetails = 'GetObjectDetails',
	GetRefs = 'GetRefs',
	GetRemoteRefs = 'GetRemoteRefs',
	HashObject = 'HashObject',
	Ignore = 'Ignore',
	Log = 'Log',
	LogFile = 'LogFile',
	Merge = 'Merge',
	MergeAbort = 'MergeAbort',
	MergeBase = 'MergeBase',
	Move = 'Move',
	PostCommitCommand = 'PostCommitCommand',
	Pull = 'Pull',
	Push = 'Push',
	Remote = 'Remote',
	RenameBranch = 'RenameBranch',
	Remove = 'Remove',
	Reset = 'Reset',
	Rebase = 'Rebase',
	RebaseAbort = 'RebaseAbort',
	RebaseContinue = 'RebaseContinue',
	RevertFiles = 'RevertFiles',
	RevertFilesNoProgress = 'RevertFilesNoProgress',
	RevList = 'RevList',
	RevParse = 'RevParse',
	SetBranchUpstream = 'SetBranchUpstream',
	Show = 'Show',
	Stage = 'Stage',
	Status = 'Status',
	Stash = 'Stash',
	SubmoduleUpdate = 'SubmoduleUpdate',
	Sync = 'Sync',
	Tag = 'Tag',
}

export type Operation = AddOperation | ApplyOperation | BlameOperation | BranchOperation | CheckIgnoreOperation | CherryPickOperation |
	CheckoutOperation | CheckoutTrackingOperation | CleanOperation | CommitOperation | ConfigOperation | DeleteBranchOperation |
	DeleteRefOperation | DeleteRemoteTagOperation | DeleteTagOperation | DiffOperation | FetchOperation | FindTrackingBranchesOperation |
	GetBranchOperation | GetBranchesOperation | GetCommitTemplateOperation | GetObjectDetailsOperation | GetRefsOperation | GetRemoteRefsOperation |
	HashObjectOperation | IgnoreOperation | LogOperation | LogFileOperation | MergeOperation | MergeAbortOperation | MergeBaseOperation |
	MoveOperation | PostCommitCommandOperation | PullOperation | PushOperation | RemoteOperation | RenameBranchOperation | RemoveOperation |
	ResetOperation | RebaseOperation | RebaseAbortOperation | RebaseContinueOperation | RevertFilesOperation | RevListOperation | RevParseOperation |
	SetBranchUpstreamOperation | ShowOperation | StageOperation | StatusOperation | StashOperation | SubmoduleUpdateOperation | SyncOperation |
	TagOperation;

type BaseOperation = { kind: OperationKind; blocking: boolean; readOnly: boolean; remote: boolean; retry: boolean; showProgress: boolean };
export type AddOperation = BaseOperation & { kind: OperationKind.Add };
export type ApplyOperation = BaseOperation & { kind: OperationKind.Apply };
export type BlameOperation = BaseOperation & { kind: OperationKind.Blame };
export type BranchOperation = BaseOperation & { kind: OperationKind.Branch };
export type CheckIgnoreOperation = BaseOperation & { kind: OperationKind.CheckIgnore };
export type CherryPickOperation = BaseOperation & { kind: OperationKind.CherryPick };
export type CheckoutOperation = BaseOperation & { kind: OperationKind.Checkout; refLabel: string };
export type CheckoutTrackingOperation = BaseOperation & { kind: OperationKind.CheckoutTracking; refLabel: string };
export type CleanOperation = BaseOperation & { kind: OperationKind.Clean };
export type CommitOperation = BaseOperation & { kind: OperationKind.Commit };
export type ConfigOperation = BaseOperation & { kind: OperationKind.Config };
export type DeleteBranchOperation = BaseOperation & { kind: OperationKind.DeleteBranch };
export type DeleteRefOperation = BaseOperation & { kind: OperationKind.DeleteRef };
export type DeleteRemoteTagOperation = BaseOperation & { kind: OperationKind.DeleteRemoteTag };
export type DeleteTagOperation = BaseOperation & { kind: OperationKind.DeleteTag };
export type DiffOperation = BaseOperation & { kind: OperationKind.Diff };
export type FetchOperation = BaseOperation & { kind: OperationKind.Fetch };
export type FindTrackingBranchesOperation = BaseOperation & { kind: OperationKind.FindTrackingBranches };
export type GetBranchOperation = BaseOperation & { kind: OperationKind.GetBranch };
export type GetBranchesOperation = BaseOperation & { kind: OperationKind.GetBranches };
export type GetCommitTemplateOperation = BaseOperation & { kind: OperationKind.GetCommitTemplate };
export type GetObjectDetailsOperation = BaseOperation & { kind: OperationKind.GetObjectDetails };
export type GetRefsOperation = BaseOperation & { kind: OperationKind.GetRefs };
export type GetRemoteRefsOperation = BaseOperation & { kind: OperationKind.GetRemoteRefs };
export type HashObjectOperation = BaseOperation & { kind: OperationKind.HashObject };
export type IgnoreOperation = BaseOperation & { kind: OperationKind.Ignore };
export type LogOperation = BaseOperation & { kind: OperationKind.Log };
export type LogFileOperation = BaseOperation & { kind: OperationKind.LogFile };
export type MergeOperation = BaseOperation & { kind: OperationKind.Merge };
export type MergeAbortOperation = BaseOperation & { kind: OperationKind.MergeAbort };
export type MergeBaseOperation = BaseOperation & { kind: OperationKind.MergeBase };
export type MoveOperation = BaseOperation & { kind: OperationKind.Move };
export type PostCommitCommandOperation = BaseOperation & { kind: OperationKind.PostCommitCommand };
export type PullOperation = BaseOperation & { kind: OperationKind.Pull };
export type PushOperation = BaseOperation & { kind: OperationKind.Push };
export type RemoteOperation = BaseOperation & { kind: OperationKind.Remote };
export type RenameBranchOperation = BaseOperation & { kind: OperationKind.RenameBranch };
export type RemoveOperation = BaseOperation & { kind: OperationKind.Remove };
export type ResetOperation = BaseOperation & { kind: OperationKind.Reset };
export type RebaseOperation = BaseOperation & { kind: OperationKind.Rebase };
export type RebaseAbortOperation = BaseOperation & { kind: OperationKind.RebaseAbort };
export type RebaseContinueOperation = BaseOperation & { kind: OperationKind.RebaseContinue };
export type RevertFilesOperation = BaseOperation & { kind: OperationKind.RevertFiles };
export type RevListOperation = BaseOperation & { kind: OperationKind.RevList };
export type RevParseOperation = BaseOperation & { kind: OperationKind.RevParse };
export type SetBranchUpstreamOperation = BaseOperation & { kind: OperationKind.SetBranchUpstream };
export type ShowOperation = BaseOperation & { kind: OperationKind.Show };
export type StageOperation = BaseOperation & { kind: OperationKind.Stage };
export type StatusOperation = BaseOperation & { kind: OperationKind.Status };
export type StashOperation = BaseOperation & { kind: OperationKind.Stash };
export type SubmoduleUpdateOperation = BaseOperation & { kind: OperationKind.SubmoduleUpdate };
export type SyncOperation = BaseOperation & { kind: OperationKind.Sync };
export type TagOperation = BaseOperation & { kind: OperationKind.Tag };

export const Operation = {
	Add: (showProgress: boolean) => ({ kind: OperationKind.Add, blocking: false, readOnly: false, remote: false, retry: false, showProgress } as AddOperation),
	Apply: { kind: OperationKind.Apply, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as ApplyOperation,
	Blame: { kind: OperationKind.Blame, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as BlameOperation,
	Branch: { kind: OperationKind.Branch, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as BranchOperation,
	CheckIgnore: { kind: OperationKind.CheckIgnore, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false } as CheckIgnoreOperation,
	CherryPick: { kind: OperationKind.CherryPick, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as CherryPickOperation,
	Checkout: (refLabel: string) => ({ kind: OperationKind.Checkout, blocking: true, readOnly: false, remote: false, retry: false, showProgress: true, refLabel } as CheckoutOperation),
	CheckoutTracking: (refLabel: string) => ({ kind: OperationKind.CheckoutTracking, blocking: true, readOnly: false, remote: false, retry: false, showProgress: true, refLabel } as CheckoutTrackingOperation),
	Clean: (showProgress: boolean) => ({ kind: OperationKind.Clean, blocking: false, readOnly: false, remote: false, retry: false, showProgress } as CleanOperation),
	Commit: { kind: OperationKind.Commit, blocking: true, readOnly: false, remote: false, retry: false, showProgress: true } as CommitOperation,
	Config: { kind: OperationKind.Config, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as ConfigOperation,
	DeleteBranch: { kind: OperationKind.DeleteBranch, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as DeleteBranchOperation,
	DeleteRef: { kind: OperationKind.DeleteRef, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as DeleteRefOperation,
	DeleteRemoteTag: { kind: OperationKind.DeleteRemoteTag, blocking: false, readOnly: false, remote: true, retry: false, showProgress: true } as DeleteRemoteTagOperation,
	DeleteTag: { kind: OperationKind.DeleteTag, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as DeleteTagOperation,
	Diff: { kind: OperationKind.Diff, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as DiffOperation,
	Fetch: (showProgress: boolean) => ({ kind: OperationKind.Fetch, blocking: false, readOnly: false, remote: true, retry: true, showProgress } as FetchOperation),
	FindTrackingBranches: { kind: OperationKind.FindTrackingBranches, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as FindTrackingBranchesOperation,
	GetBranch: { kind: OperationKind.GetBranch, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as GetBranchOperation,
	GetBranches: { kind: OperationKind.GetBranches, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as GetBranchesOperation,
	GetCommitTemplate: { kind: OperationKind.GetCommitTemplate, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as GetCommitTemplateOperation,
	GetObjectDetails: { kind: OperationKind.GetObjectDetails, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false } as GetObjectDetailsOperation,
	GetRefs: { kind: OperationKind.GetRefs, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false } as GetRefsOperation,
	GetRemoteRefs: { kind: OperationKind.GetRemoteRefs, blocking: false, readOnly: true, remote: true, retry: false, showProgress: false } as GetRemoteRefsOperation,
	HashObject: { kind: OperationKind.HashObject, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as HashObjectOperation,
	Ignore: { kind: OperationKind.Ignore, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as IgnoreOperation,
	Log: { kind: OperationKind.Log, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as LogOperation,
	LogFile: { kind: OperationKind.LogFile, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false } as LogFileOperation,
	Merge: { kind: OperationKind.Merge, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as MergeOperation,
	MergeAbort: { kind: OperationKind.MergeAbort, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as MergeAbortOperation,
	MergeBase: { kind: OperationKind.MergeBase, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true } as MergeBaseOperation,
	Move: { kind: OperationKind.Move, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as MoveOperation,
	PostCommitCommand: { kind: OperationKind.PostCommitCommand, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as PostCommitCommandOperation,
	Pull: { kind: OperationKind.Pull, blocking: true, readOnly: false, remote: true, retry: true, showProgress: true } as PullOperation,
	Push: { kind: OperationKind.Push, blocking: true, readOnly: false, remote: true, retry: false, showProgress: true } as PushOperation,
	Remote: { kind: OperationKind.Remote, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as RemoteOperation,
	RenameBranch: { kind: OperationKind.RenameBranch, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as RenameBranchOperation,
	Remove: { kind: OperationKind.Remove, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as RemoveOperation,
	Reset: { kind: OperationKind.Reset, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as ResetOperation,
	Rebase: { kind: OperationKind.Rebase, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as RebaseOperation,
	RebaseAbort: { kind: OperationKind.RebaseAbort, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as RebaseAbortOperation,
	RebaseContinue: { kind: OperationKind.RebaseContinue, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as RebaseContinueOperation,
	RevertFiles: (showProgress: boolean) => ({ kind: OperationKind.RevertFiles, blocking: false, readOnly: false, remote: false, retry: false, showProgress } as RevertFilesOperation),
	RevList: { kind: OperationKind.RevList, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false } as RevListOperation,
	RevParse: { kind: OperationKind.RevParse, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false } as RevParseOperation,
	SetBranchUpstream: { kind: OperationKind.SetBranchUpstream, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as SetBranchUpstreamOperation,
	Show: { kind: OperationKind.Show, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false } as ShowOperation,
	Stage: { kind: OperationKind.Stage, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as StageOperation,
	Status: { kind: OperationKind.Status, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as StatusOperation,
	Stash: { kind: OperationKind.Stash, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as StashOperation,
	SubmoduleUpdate: { kind: OperationKind.SubmoduleUpdate, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as SubmoduleUpdateOperation,
	Sync: { kind: OperationKind.Sync, blocking: true, readOnly: false, remote: true, retry: true, showProgress: true } as SyncOperation,
	Tag: { kind: OperationKind.Tag, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true } as TagOperation
};

export interface OperationResult {
	operation: Operation;
	error: any;
}

interface IOperationManager {
	getOperations(operationKind: OperationKind): Operation[];
	isIdle(): boolean;
	isRunning(operationKind: OperationKind): boolean;
	shouldDisableCommands(): boolean;
	shouldShowProgress(): boolean;
}

export class OperationManager implements IOperationManager {

	private operations = new Map<OperationKind, Set<Operation>>();

	constructor(private readonly logger: LogOutputChannel) { }

	start(operation: Operation): void {
		if (this.operations.has(operation.kind)) {
			this.operations.get(operation.kind)!.add(operation);
		} else {
			this.operations.set(operation.kind, new Set([operation]));
		}

		this.logger.trace(`Operation start: ${operation.kind} (blocking: ${operation.blocking}, readOnly: ${operation.readOnly}; retry: ${operation.retry}; showProgress: ${operation.showProgress})`);
	}

	end(operation: Operation): void {
		const operationSet = this.operations.get(operation.kind);
		if (operationSet) {
			operationSet.delete(operation);
			if (operationSet.size === 0) {
				this.operations.delete(operation.kind);
			}
		}

		this.logger.trace(`Operation end: ${operation.kind} (blocking: ${operation.blocking}, readOnly: ${operation.readOnly}; retry: ${operation.retry}; showProgress: ${operation.showProgress})`);
	}

	getOperations(operationKind: OperationKind): Operation[] {
		const operationSet = this.operations.get(operationKind);
		return operationSet ? Array.from(operationSet) : [];
	}

	isIdle(): boolean {
		const operationSets = this.operations.values();

		for (const operationSet of operationSets) {
			for (const operation of operationSet) {
				if (!operation.readOnly) {
					return false;
				}
			}
		}

		return true;
	}

	isRunning(operationKind: OperationKind): boolean {
		return this.operations.has(operationKind);
	}

	shouldDisableCommands(): boolean {
		const operationSets = this.operations.values();

		for (const operationSet of operationSets) {
			for (const operation of operationSet) {
				if (operation.blocking) {
					return true;
				}
			}
		}

		return false;
	}

	shouldShowProgress(): boolean {
		const operationSets = this.operations.values();

		for (const operationSet of operationSets) {
			for (const operation of operationSet) {
				if (operation.showProgress) {
					return true;
				}
			}
		}

		return false;
	}
}
