/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { TestId } from './testId.js';
export var TestResultState;
(function (TestResultState) {
    TestResultState[TestResultState["Unset"] = 0] = "Unset";
    TestResultState[TestResultState["Queued"] = 1] = "Queued";
    TestResultState[TestResultState["Running"] = 2] = "Running";
    TestResultState[TestResultState["Passed"] = 3] = "Passed";
    TestResultState[TestResultState["Failed"] = 4] = "Failed";
    TestResultState[TestResultState["Skipped"] = 5] = "Skipped";
    TestResultState[TestResultState["Errored"] = 6] = "Errored";
})(TestResultState || (TestResultState = {}));
export const testResultStateToContextValues = {
    [0 /* TestResultState.Unset */]: 'unset',
    [1 /* TestResultState.Queued */]: 'queued',
    [2 /* TestResultState.Running */]: 'running',
    [3 /* TestResultState.Passed */]: 'passed',
    [4 /* TestResultState.Failed */]: 'failed',
    [5 /* TestResultState.Skipped */]: 'skipped',
    [6 /* TestResultState.Errored */]: 'errored',
};
/** note: keep in sync with TestRunProfileKind in vscode.d.ts */
export var ExtTestRunProfileKind;
(function (ExtTestRunProfileKind) {
    ExtTestRunProfileKind[ExtTestRunProfileKind["Run"] = 1] = "Run";
    ExtTestRunProfileKind[ExtTestRunProfileKind["Debug"] = 2] = "Debug";
    ExtTestRunProfileKind[ExtTestRunProfileKind["Coverage"] = 3] = "Coverage";
})(ExtTestRunProfileKind || (ExtTestRunProfileKind = {}));
export var TestControllerCapability;
(function (TestControllerCapability) {
    TestControllerCapability[TestControllerCapability["Refresh"] = 2] = "Refresh";
    TestControllerCapability[TestControllerCapability["CodeRelatedToTest"] = 4] = "CodeRelatedToTest";
    TestControllerCapability[TestControllerCapability["TestRelatedToCode"] = 8] = "TestRelatedToCode";
})(TestControllerCapability || (TestControllerCapability = {}));
export var TestRunProfileBitset;
(function (TestRunProfileBitset) {
    TestRunProfileBitset[TestRunProfileBitset["Run"] = 2] = "Run";
    TestRunProfileBitset[TestRunProfileBitset["Debug"] = 4] = "Debug";
    TestRunProfileBitset[TestRunProfileBitset["Coverage"] = 8] = "Coverage";
    TestRunProfileBitset[TestRunProfileBitset["HasNonDefaultProfile"] = 16] = "HasNonDefaultProfile";
    TestRunProfileBitset[TestRunProfileBitset["HasConfigurable"] = 32] = "HasConfigurable";
    TestRunProfileBitset[TestRunProfileBitset["SupportsContinuousRun"] = 64] = "SupportsContinuousRun";
})(TestRunProfileBitset || (TestRunProfileBitset = {}));
export const testProfileBitset = {
    [2 /* TestRunProfileBitset.Run */]: localize('testing.runProfileBitset.run', 'Run'),
    [4 /* TestRunProfileBitset.Debug */]: localize('testing.runProfileBitset.debug', 'Debug'),
    [8 /* TestRunProfileBitset.Coverage */]: localize('testing.runProfileBitset.coverage', 'Coverage'),
};
/**
 * List of all test run profile bitset values.
 */
export const testRunProfileBitsetList = [
    2 /* TestRunProfileBitset.Run */,
    4 /* TestRunProfileBitset.Debug */,
    8 /* TestRunProfileBitset.Coverage */,
    16 /* TestRunProfileBitset.HasNonDefaultProfile */,
    32 /* TestRunProfileBitset.HasConfigurable */,
    64 /* TestRunProfileBitset.SupportsContinuousRun */,
];
export const isStartControllerTests = (t) => 'runId' in t;
export var IRichLocation;
(function (IRichLocation) {
    IRichLocation.serialize = (location) => ({
        range: location.range.toJSON(),
        uri: location.uri.toJSON(),
    });
    IRichLocation.deserialize = (uriIdentity, location) => ({
        range: Range.lift(location.range),
        uri: uriIdentity.asCanonicalUri(URI.revive(location.uri)),
    });
})(IRichLocation || (IRichLocation = {}));
export var TestMessageType;
(function (TestMessageType) {
    TestMessageType[TestMessageType["Error"] = 0] = "Error";
    TestMessageType[TestMessageType["Output"] = 1] = "Output";
})(TestMessageType || (TestMessageType = {}));
export var ITestMessageStackFrame;
(function (ITestMessageStackFrame) {
    ITestMessageStackFrame.serialize = (stack) => ({
        label: stack.label,
        uri: stack.uri?.toJSON(),
        position: stack.position?.toJSON(),
    });
    ITestMessageStackFrame.deserialize = (uriIdentity, stack) => ({
        label: stack.label,
        uri: stack.uri ? uriIdentity.asCanonicalUri(URI.revive(stack.uri)) : undefined,
        position: stack.position ? Position.lift(stack.position) : undefined,
    });
})(ITestMessageStackFrame || (ITestMessageStackFrame = {}));
export var ITestErrorMessage;
(function (ITestErrorMessage) {
    ITestErrorMessage.serialize = (message) => ({
        message: message.message,
        type: 0 /* TestMessageType.Error */,
        expected: message.expected,
        actual: message.actual,
        contextValue: message.contextValue,
        location: message.location && IRichLocation.serialize(message.location),
        stackTrace: message.stackTrace?.map(ITestMessageStackFrame.serialize),
    });
    ITestErrorMessage.deserialize = (uriIdentity, message) => ({
        message: message.message,
        type: 0 /* TestMessageType.Error */,
        expected: message.expected,
        actual: message.actual,
        contextValue: message.contextValue,
        location: message.location && IRichLocation.deserialize(uriIdentity, message.location),
        stackTrace: message.stackTrace && message.stackTrace.map(s => ITestMessageStackFrame.deserialize(uriIdentity, s)),
    });
})(ITestErrorMessage || (ITestErrorMessage = {}));
/**
 * Gets the TTY marker ID for either starting or ending
 * an ITestOutputMessage.marker of the given ID.
 */
export const getMarkId = (marker, start) => `${start ? 's' : 'e'}${marker}`;
export var ITestOutputMessage;
(function (ITestOutputMessage) {
    ITestOutputMessage.serialize = (message) => ({
        message: message.message,
        type: 1 /* TestMessageType.Output */,
        offset: message.offset,
        length: message.length,
        location: message.location && IRichLocation.serialize(message.location),
    });
    ITestOutputMessage.deserialize = (uriIdentity, message) => ({
        message: message.message,
        type: 1 /* TestMessageType.Output */,
        offset: message.offset,
        length: message.length,
        location: message.location && IRichLocation.deserialize(uriIdentity, message.location),
    });
})(ITestOutputMessage || (ITestOutputMessage = {}));
export var ITestMessage;
(function (ITestMessage) {
    ITestMessage.serialize = (message) => message.type === 0 /* TestMessageType.Error */ ? ITestErrorMessage.serialize(message) : ITestOutputMessage.serialize(message);
    ITestMessage.deserialize = (uriIdentity, message) => message.type === 0 /* TestMessageType.Error */ ? ITestErrorMessage.deserialize(uriIdentity, message) : ITestOutputMessage.deserialize(uriIdentity, message);
    ITestMessage.isDiffable = (message) => message.type === 0 /* TestMessageType.Error */ && message.actual !== undefined && message.expected !== undefined;
})(ITestMessage || (ITestMessage = {}));
export var ITestTaskState;
(function (ITestTaskState) {
    ITestTaskState.serializeWithoutMessages = (state) => ({
        state: state.state,
        duration: state.duration,
        messages: [],
    });
    ITestTaskState.serialize = (state) => ({
        state: state.state,
        duration: state.duration,
        messages: state.messages.map(ITestMessage.serialize),
    });
    ITestTaskState.deserialize = (uriIdentity, state) => ({
        state: state.state,
        duration: state.duration,
        messages: state.messages.map(m => ITestMessage.deserialize(uriIdentity, m)),
    });
})(ITestTaskState || (ITestTaskState = {}));
const testTagDelimiter = '\0';
export const namespaceTestTag = (ctrlId, tagId) => ctrlId + testTagDelimiter + tagId;
export const denamespaceTestTag = (namespaced) => {
    const index = namespaced.indexOf(testTagDelimiter);
    return { ctrlId: namespaced.slice(0, index), tagId: namespaced.slice(index + 1) };
};
export var ITestItem;
(function (ITestItem) {
    ITestItem.serialize = (item) => ({
        extId: item.extId,
        label: item.label,
        tags: item.tags,
        busy: item.busy,
        children: undefined,
        uri: item.uri?.toJSON(),
        range: item.range?.toJSON() || null,
        description: item.description,
        error: item.error,
        sortText: item.sortText
    });
    ITestItem.deserialize = (uriIdentity, serialized) => ({
        extId: serialized.extId,
        label: serialized.label,
        tags: serialized.tags,
        busy: serialized.busy,
        children: undefined,
        uri: serialized.uri ? uriIdentity.asCanonicalUri(URI.revive(serialized.uri)) : undefined,
        range: serialized.range ? Range.lift(serialized.range) : null,
        description: serialized.description,
        error: serialized.error,
        sortText: serialized.sortText
    });
})(ITestItem || (ITestItem = {}));
export var TestItemExpandState;
(function (TestItemExpandState) {
    TestItemExpandState[TestItemExpandState["NotExpandable"] = 0] = "NotExpandable";
    TestItemExpandState[TestItemExpandState["Expandable"] = 1] = "Expandable";
    TestItemExpandState[TestItemExpandState["BusyExpanding"] = 2] = "BusyExpanding";
    TestItemExpandState[TestItemExpandState["Expanded"] = 3] = "Expanded";
})(TestItemExpandState || (TestItemExpandState = {}));
export var InternalTestItem;
(function (InternalTestItem) {
    InternalTestItem.serialize = (item) => ({
        expand: item.expand,
        item: ITestItem.serialize(item.item)
    });
    InternalTestItem.deserialize = (uriIdentity, serialized) => ({
        // the `controllerId` is derived from the test.item.extId. It's redundant
        // in the non-serialized InternalTestItem too, but there just because it's
        // checked against in many hot paths.
        controllerId: TestId.root(serialized.item.extId),
        expand: serialized.expand,
        item: ITestItem.deserialize(uriIdentity, serialized.item)
    });
})(InternalTestItem || (InternalTestItem = {}));
export var ITestItemUpdate;
(function (ITestItemUpdate) {
    ITestItemUpdate.serialize = (u) => {
        let item;
        if (u.item) {
            item = {};
            if (u.item.label !== undefined) {
                item.label = u.item.label;
            }
            if (u.item.tags !== undefined) {
                item.tags = u.item.tags;
            }
            if (u.item.busy !== undefined) {
                item.busy = u.item.busy;
            }
            if (u.item.uri !== undefined) {
                item.uri = u.item.uri?.toJSON();
            }
            if (u.item.range !== undefined) {
                item.range = u.item.range?.toJSON();
            }
            if (u.item.description !== undefined) {
                item.description = u.item.description;
            }
            if (u.item.error !== undefined) {
                item.error = u.item.error;
            }
            if (u.item.sortText !== undefined) {
                item.sortText = u.item.sortText;
            }
        }
        return { extId: u.extId, expand: u.expand, item };
    };
    ITestItemUpdate.deserialize = (u) => {
        let item;
        if (u.item) {
            item = {};
            if (u.item.label !== undefined) {
                item.label = u.item.label;
            }
            if (u.item.tags !== undefined) {
                item.tags = u.item.tags;
            }
            if (u.item.busy !== undefined) {
                item.busy = u.item.busy;
            }
            if (u.item.range !== undefined) {
                item.range = u.item.range ? Range.lift(u.item.range) : null;
            }
            if (u.item.description !== undefined) {
                item.description = u.item.description;
            }
            if (u.item.error !== undefined) {
                item.error = u.item.error;
            }
            if (u.item.sortText !== undefined) {
                item.sortText = u.item.sortText;
            }
        }
        return { extId: u.extId, expand: u.expand, item };
    };
})(ITestItemUpdate || (ITestItemUpdate = {}));
export const applyTestItemUpdate = (internal, patch) => {
    if (patch.expand !== undefined) {
        internal.expand = patch.expand;
    }
    if (patch.item !== undefined) {
        internal.item = internal.item ? Object.assign(internal.item, patch.item) : patch.item;
    }
};
export var TestResultItem;
(function (TestResultItem) {
    TestResultItem.serializeWithoutMessages = (original) => ({
        ...InternalTestItem.serialize(original),
        ownComputedState: original.ownComputedState,
        computedState: original.computedState,
        tasks: original.tasks.map(ITestTaskState.serializeWithoutMessages),
    });
    TestResultItem.serialize = (original) => ({
        ...InternalTestItem.serialize(original),
        ownComputedState: original.ownComputedState,
        computedState: original.computedState,
        tasks: original.tasks.map(ITestTaskState.serialize),
    });
    TestResultItem.deserialize = (uriIdentity, serialized) => ({
        ...InternalTestItem.deserialize(uriIdentity, serialized),
        ownComputedState: serialized.ownComputedState,
        computedState: serialized.computedState,
        tasks: serialized.tasks.map(m => ITestTaskState.deserialize(uriIdentity, m)),
        retired: true,
    });
})(TestResultItem || (TestResultItem = {}));
export var ICoverageCount;
(function (ICoverageCount) {
    ICoverageCount.empty = () => ({ covered: 0, total: 0 });
    ICoverageCount.sum = (target, src) => {
        target.covered += src.covered;
        target.total += src.total;
    };
})(ICoverageCount || (ICoverageCount = {}));
export var IFileCoverage;
(function (IFileCoverage) {
    IFileCoverage.serialize = (original) => ({
        id: original.id,
        statement: original.statement,
        branch: original.branch,
        declaration: original.declaration,
        testIds: original.testIds,
        uri: original.uri.toJSON(),
    });
    IFileCoverage.deserialize = (uriIdentity, serialized) => ({
        id: serialized.id,
        statement: serialized.statement,
        branch: serialized.branch,
        declaration: serialized.declaration,
        testIds: serialized.testIds,
        uri: uriIdentity.asCanonicalUri(URI.revive(serialized.uri)),
    });
    IFileCoverage.empty = (id, uri) => ({
        id,
        uri,
        statement: ICoverageCount.empty(),
    });
})(IFileCoverage || (IFileCoverage = {}));
function serializeThingWithLocation(serialized) {
    return {
        ...serialized,
        location: serialized.location?.toJSON(),
    };
}
function deserializeThingWithLocation(serialized) {
    serialized.location = serialized.location ? (Position.isIPosition(serialized.location) ? Position.lift(serialized.location) : Range.lift(serialized.location)) : undefined;
    return serialized;
}
/** Number of recent runs in which coverage reports should be retained. */
export const KEEP_N_LAST_COVERAGE_REPORTS = 3;
export var DetailType;
(function (DetailType) {
    DetailType[DetailType["Declaration"] = 0] = "Declaration";
    DetailType[DetailType["Statement"] = 1] = "Statement";
    DetailType[DetailType["Branch"] = 2] = "Branch";
})(DetailType || (DetailType = {}));
export var CoverageDetails;
(function (CoverageDetails) {
    CoverageDetails.serialize = (original) => original.type === 0 /* DetailType.Declaration */ ? IDeclarationCoverage.serialize(original) : IStatementCoverage.serialize(original);
    CoverageDetails.deserialize = (serialized) => serialized.type === 0 /* DetailType.Declaration */ ? IDeclarationCoverage.deserialize(serialized) : IStatementCoverage.deserialize(serialized);
})(CoverageDetails || (CoverageDetails = {}));
export var IBranchCoverage;
(function (IBranchCoverage) {
    IBranchCoverage.serialize = serializeThingWithLocation;
    IBranchCoverage.deserialize = deserializeThingWithLocation;
})(IBranchCoverage || (IBranchCoverage = {}));
export var IDeclarationCoverage;
(function (IDeclarationCoverage) {
    IDeclarationCoverage.serialize = serializeThingWithLocation;
    IDeclarationCoverage.deserialize = deserializeThingWithLocation;
})(IDeclarationCoverage || (IDeclarationCoverage = {}));
export var IStatementCoverage;
(function (IStatementCoverage) {
    IStatementCoverage.serialize = (original) => ({
        ...serializeThingWithLocation(original),
        branches: original.branches?.map(IBranchCoverage.serialize),
    });
    IStatementCoverage.deserialize = (serialized) => ({
        ...deserializeThingWithLocation(serialized),
        branches: serialized.branches?.map(IBranchCoverage.deserialize),
    });
})(IStatementCoverage || (IStatementCoverage = {}));
export var TestDiffOpType;
(function (TestDiffOpType) {
    /** Adds a new test (with children) */
    TestDiffOpType[TestDiffOpType["Add"] = 0] = "Add";
    /** Shallow-updates an existing test */
    TestDiffOpType[TestDiffOpType["Update"] = 1] = "Update";
    /** Ranges of some tests in a document were synced, so it should be considered up-to-date */
    TestDiffOpType[TestDiffOpType["DocumentSynced"] = 2] = "DocumentSynced";
    /** Removes a test (and all its children) */
    TestDiffOpType[TestDiffOpType["Remove"] = 3] = "Remove";
    /** Changes the number of controllers who are yet to publish their collection roots. */
    TestDiffOpType[TestDiffOpType["IncrementPendingExtHosts"] = 4] = "IncrementPendingExtHosts";
    /** Retires a test/result */
    TestDiffOpType[TestDiffOpType["Retire"] = 5] = "Retire";
    /** Add a new test tag */
    TestDiffOpType[TestDiffOpType["AddTag"] = 6] = "AddTag";
    /** Remove a test tag */
    TestDiffOpType[TestDiffOpType["RemoveTag"] = 7] = "RemoveTag";
})(TestDiffOpType || (TestDiffOpType = {}));
export var TestsDiffOp;
(function (TestsDiffOp) {
    TestsDiffOp.deserialize = (uriIdentity, u) => {
        if (u.op === 0 /* TestDiffOpType.Add */) {
            return { op: u.op, item: InternalTestItem.deserialize(uriIdentity, u.item) };
        }
        else if (u.op === 1 /* TestDiffOpType.Update */) {
            return { op: u.op, item: ITestItemUpdate.deserialize(u.item) };
        }
        else if (u.op === 2 /* TestDiffOpType.DocumentSynced */) {
            return { op: u.op, uri: uriIdentity.asCanonicalUri(URI.revive(u.uri)), docv: u.docv };
        }
        else {
            return u;
        }
    };
    TestsDiffOp.serialize = (u) => {
        if (u.op === 0 /* TestDiffOpType.Add */) {
            return { op: u.op, item: InternalTestItem.serialize(u.item) };
        }
        else if (u.op === 1 /* TestDiffOpType.Update */) {
            return { op: u.op, item: ITestItemUpdate.serialize(u.item) };
        }
        else {
            return u;
        }
    };
})(TestsDiffOp || (TestsDiffOp = {}));
/**
 * Maintains tests in this extension host sent from the main thread.
 */
export class AbstractIncrementalTestCollection {
    constructor(uriIdentity) {
        this.uriIdentity = uriIdentity;
        this._tags = new Map();
        /**
         * Map of item IDs to test item objects.
         */
        this.items = new Map();
        /**
         * ID of test root items.
         */
        this.roots = new Set();
        /**
         * Number of 'busy' controllers.
         */
        this.busyControllerCount = 0;
        /**
         * Number of pending roots.
         */
        this.pendingRootCount = 0;
        /**
         * Known test tags.
         */
        this.tags = this._tags;
    }
    /**
     * Applies the diff to the collection.
     */
    apply(diff) {
        const changes = this.createChangeCollector();
        for (const op of diff) {
            switch (op.op) {
                case 0 /* TestDiffOpType.Add */:
                    this.add(InternalTestItem.deserialize(this.uriIdentity, op.item), changes);
                    break;
                case 1 /* TestDiffOpType.Update */:
                    this.update(ITestItemUpdate.deserialize(op.item), changes);
                    break;
                case 3 /* TestDiffOpType.Remove */:
                    this.remove(op.itemId, changes);
                    break;
                case 5 /* TestDiffOpType.Retire */:
                    this.retireTest(op.itemId);
                    break;
                case 4 /* TestDiffOpType.IncrementPendingExtHosts */:
                    this.updatePendingRoots(op.amount);
                    break;
                case 6 /* TestDiffOpType.AddTag */:
                    this._tags.set(op.tag.id, op.tag);
                    break;
                case 7 /* TestDiffOpType.RemoveTag */:
                    this._tags.delete(op.id);
                    break;
            }
        }
        changes.complete?.();
    }
    add(item, changes) {
        const parentId = TestId.parentId(item.item.extId)?.toString();
        let created;
        if (!parentId) {
            created = this.createItem(item);
            this.roots.add(created);
            this.items.set(item.item.extId, created);
        }
        else if (this.items.has(parentId)) {
            const parent = this.items.get(parentId);
            parent.children.add(item.item.extId);
            created = this.createItem(item, parent);
            this.items.set(item.item.extId, created);
        }
        else {
            console.error(`Test with unknown parent ID: ${JSON.stringify(item)}`);
            return;
        }
        changes.add?.(created);
        if (item.expand === 2 /* TestItemExpandState.BusyExpanding */) {
            this.busyControllerCount++;
        }
        return created;
    }
    update(patch, changes) {
        const existing = this.items.get(patch.extId);
        if (!existing) {
            return;
        }
        if (patch.expand !== undefined) {
            if (existing.expand === 2 /* TestItemExpandState.BusyExpanding */) {
                this.busyControllerCount--;
            }
            if (patch.expand === 2 /* TestItemExpandState.BusyExpanding */) {
                this.busyControllerCount++;
            }
        }
        applyTestItemUpdate(existing, patch);
        changes.update?.(existing);
        return existing;
    }
    remove(itemId, changes) {
        const toRemove = this.items.get(itemId);
        if (!toRemove) {
            return;
        }
        const parentId = TestId.parentId(toRemove.item.extId)?.toString();
        if (parentId) {
            const parent = this.items.get(parentId);
            parent.children.delete(toRemove.item.extId);
        }
        else {
            this.roots.delete(toRemove);
        }
        const queue = [[itemId]];
        while (queue.length) {
            for (const itemId of queue.pop()) {
                const existing = this.items.get(itemId);
                if (existing) {
                    queue.push(existing.children);
                    this.items.delete(itemId);
                    changes.remove?.(existing, existing !== toRemove);
                    if (existing.expand === 2 /* TestItemExpandState.BusyExpanding */) {
                        this.busyControllerCount--;
                    }
                }
            }
        }
    }
    /**
     * Called when the extension signals a test result should be retired.
     */
    retireTest(testId) {
        // no-op
    }
    /**
     * Updates the number of test root sources who are yet to report. When
     * the total pending test roots reaches 0, the roots for all controllers
     * will exist in the collection.
     */
    updatePendingRoots(delta) {
        this.pendingRootCount += delta;
    }
    /**
     * Called before a diff is applied to create a new change collector.
     */
    createChangeCollector() {
        return {};
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFR5cGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFR5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFhLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2pGLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUVyQyxNQUFNLENBQU4sSUFBa0IsZUFRakI7QUFSRCxXQUFrQixlQUFlO0lBQ2hDLHVEQUFTLENBQUE7SUFDVCx5REFBVSxDQUFBO0lBQ1YsMkRBQVcsQ0FBQTtJQUNYLHlEQUFVLENBQUE7SUFDVix5REFBVSxDQUFBO0lBQ1YsMkRBQVcsQ0FBQTtJQUNYLDJEQUFXLENBQUE7QUFDWixDQUFDLEVBUmlCLGVBQWUsS0FBZixlQUFlLFFBUWhDO0FBRUQsTUFBTSxDQUFDLE1BQU0sOEJBQThCLEdBQXVDO0lBQ2pGLCtCQUF1QixFQUFFLE9BQU87SUFDaEMsZ0NBQXdCLEVBQUUsUUFBUTtJQUNsQyxpQ0FBeUIsRUFBRSxTQUFTO0lBQ3BDLGdDQUF3QixFQUFFLFFBQVE7SUFDbEMsZ0NBQXdCLEVBQUUsUUFBUTtJQUNsQyxpQ0FBeUIsRUFBRSxTQUFTO0lBQ3BDLGlDQUF5QixFQUFFLFNBQVM7Q0FDcEMsQ0FBQztBQUVGLGdFQUFnRTtBQUNoRSxNQUFNLENBQU4sSUFBa0IscUJBSWpCO0FBSkQsV0FBa0IscUJBQXFCO0lBQ3RDLCtEQUFPLENBQUE7SUFDUCxtRUFBUyxDQUFBO0lBQ1Qs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