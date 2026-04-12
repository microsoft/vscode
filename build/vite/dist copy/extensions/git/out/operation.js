"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-dangerous-type-assertions */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationManager = exports.Operation = void 0;
exports.Operation = {
    Add: (showProgress) => ({ kind: "Add" /* OperationKind.Add */, blocking: false, readOnly: false, remote: false, retry: false, showProgress }),
    Apply: { kind: "Apply" /* OperationKind.Apply */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Blame: (showProgress) => ({ kind: "Blame" /* OperationKind.Blame */, blocking: false, readOnly: true, remote: false, retry: false, showProgress }),
    Branch: { kind: "Branch" /* OperationKind.Branch */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    CheckIgnore: { kind: "CheckIgnore" /* OperationKind.CheckIgnore */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    CherryPick: { kind: "CherryPick" /* OperationKind.CherryPick */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Checkout: (refLabel) => ({ kind: "Checkout" /* OperationKind.Checkout */, blocking: true, readOnly: false, remote: false, retry: false, showProgress: true, refLabel }),
    CheckoutTracking: (refLabel) => ({ kind: "CheckoutTracking" /* OperationKind.CheckoutTracking */, blocking: true, readOnly: false, remote: false, retry: false, showProgress: true, refLabel }),
    Clean: (showProgress) => ({ kind: "Clean" /* OperationKind.Clean */, blocking: false, readOnly: false, remote: false, retry: false, showProgress }),
    Commit: { kind: "Commit" /* OperationKind.Commit */, blocking: true, readOnly: false, remote: false, retry: false, showProgress: true },
    Config: (readOnly) => ({ kind: "Config" /* OperationKind.Config */, blocking: false, readOnly, remote: false, retry: false, showProgress: false }),
    DeleteBranch: { kind: "DeleteBranch" /* OperationKind.DeleteBranch */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    DeleteRef: { kind: "DeleteRef" /* OperationKind.DeleteRef */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    DeleteRemoteRef: { kind: "DeleteRemoteRef" /* OperationKind.DeleteRemoteRef */, blocking: false, readOnly: false, remote: true, retry: false, showProgress: true },
    DeleteTag: { kind: "DeleteTag" /* OperationKind.DeleteTag */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Diff: { kind: "Diff" /* OperationKind.Diff */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    Fetch: (showProgress) => ({ kind: "Fetch" /* OperationKind.Fetch */, blocking: false, readOnly: false, remote: true, retry: true, showProgress }),
    FindTrackingBranches: { kind: "GetTracking" /* OperationKind.FindTrackingBranches */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true },
    GetBranch: { kind: "GetBranch" /* OperationKind.GetBranch */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    GetBranches: { kind: "GetBranches" /* OperationKind.GetBranches */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true },
    GetCommitTemplate: { kind: "GetCommitTemplate" /* OperationKind.GetCommitTemplate */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true },
    GetObjectDetails: { kind: "GetObjectDetails" /* OperationKind.GetObjectDetails */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    GetObjectFiles: { kind: "GetObjectFiles" /* OperationKind.GetObjectFiles */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    GetRefs: { kind: "GetRefs" /* OperationKind.GetRefs */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    GetRemoteRefs: { kind: "GetRemoteRefs" /* OperationKind.GetRemoteRefs */, blocking: false, readOnly: true, remote: true, retry: false, showProgress: false },
    HashObject: { kind: "HashObject" /* OperationKind.HashObject */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Ignore: { kind: "Ignore" /* OperationKind.Ignore */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Log: (showProgress) => ({ kind: "Log" /* OperationKind.Log */, blocking: false, readOnly: true, remote: false, retry: false, showProgress }),
    LogFile: { kind: "LogFile" /* OperationKind.LogFile */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    Merge: { kind: "Merge" /* OperationKind.Merge */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    MergeAbort: { kind: "MergeAbort" /* OperationKind.MergeAbort */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    MergeBase: { kind: "MergeBase" /* OperationKind.MergeBase */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: true },
    Move: { kind: "Move" /* OperationKind.Move */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    PostCommitCommand: { kind: "PostCommitCommand" /* OperationKind.PostCommitCommand */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Pull: { kind: "Pull" /* OperationKind.Pull */, blocking: true, readOnly: false, remote: true, retry: true, showProgress: true },
    Push: { kind: "Push" /* OperationKind.Push */, blocking: true, readOnly: false, remote: true, retry: false, showProgress: true },
    Remote: { kind: "Remote" /* OperationKind.Remote */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    RenameBranch: { kind: "RenameBranch" /* OperationKind.RenameBranch */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Remove: { kind: "Remove" /* OperationKind.Remove */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Reset: { kind: "Reset" /* OperationKind.Reset */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Rebase: { kind: "Rebase" /* OperationKind.Rebase */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    RebaseAbort: { kind: "RebaseAbort" /* OperationKind.RebaseAbort */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    RebaseContinue: { kind: "RebaseContinue" /* OperationKind.RebaseContinue */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Refresh: { kind: "Refresh" /* OperationKind.Refresh */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Restore: (showProgress) => ({ kind: "Restore" /* OperationKind.Restore */, blocking: false, readOnly: false, remote: false, retry: false, showProgress }),
    RevertFiles: (showProgress) => ({ kind: "RevertFiles" /* OperationKind.RevertFiles */, blocking: false, readOnly: false, remote: false, retry: false, showProgress }),
    RevList: { kind: "RevList" /* OperationKind.RevList */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    RevParse: { kind: "RevParse" /* OperationKind.RevParse */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    SetBranchUpstream: { kind: "SetBranchUpstream" /* OperationKind.SetBranchUpstream */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Show: { kind: "Show" /* OperationKind.Show */, blocking: false, readOnly: true, remote: false, retry: false, showProgress: false },
    Stage: { kind: "Stage" /* OperationKind.Stage */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Status: { kind: "Status" /* OperationKind.Status */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Stash: (readOnly) => ({ kind: "Stash" /* OperationKind.Stash */, blocking: false, readOnly, remote: false, retry: false, showProgress: true }),
    SubmoduleUpdate: { kind: "SubmoduleUpdate" /* OperationKind.SubmoduleUpdate */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Sync: { kind: "Sync" /* OperationKind.Sync */, blocking: true, readOnly: false, remote: true, retry: true, showProgress: true },
    Tag: { kind: "Tag" /* OperationKind.Tag */, blocking: false, readOnly: false, remote: false, retry: false, showProgress: true },
    Worktree: (readOnly) => ({ kind: "Worktree" /* OperationKind.Worktree */, blocking: false, readOnly, remote: false, retry: false, showProgress: true })
};
class OperationManager {
    logger;
    operations = new Map();
    constructor(logger) {
        this.logger = logger;
    }
    start(operation) {
        if (this.operations.has(operation.kind)) {
            this.operations.get(operation.kind).add(operation);
        }
        else {
            this.operations.set(operation.kind, new Set([operation]));
        }
        this.logger.trace(`[OperationManager][start] ${operation.kind} (blocking: ${operation.blocking}, readOnly: ${operation.readOnly}; retry: ${operation.retry}; showProgress: ${operation.showProgress})`);
    }
    end(operation) {
        const operationSet = this.operations.get(operation.kind);
        if (operationSet) {
            operationSet.delete(operation);
            if (operationSet.size === 0) {
                this.operations.delete(operation.kind);
            }
        }
        this.logger.trace(`[OperationManager][end] ${operation.kind} (blocking: ${operation.blocking}, readOnly: ${operation.readOnly}; retry: ${operation.retry}; showProgress: ${operation.showProgress})`);
    }
    getOperations(operationKind) {
        const operationSet = this.operations.get(operationKind);
        return operationSet ? Array.from(operationSet) : [];
    }
    isIdle() {
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
    isRunning(operationKind) {
        return this.operations.has(operationKind);
    }
    shouldDisableCommands() {
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
    shouldShowProgress() {
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
exports.OperationManager = OperationManager;
//# sourceMappingURL=operation.js.map