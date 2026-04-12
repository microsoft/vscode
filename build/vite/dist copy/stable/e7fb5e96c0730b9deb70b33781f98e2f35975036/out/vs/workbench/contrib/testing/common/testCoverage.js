/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { deepClone } from '../../../../base/common/objects.js';
import { observableSignal } from '../../../../base/common/observable.js';
import { WellDefinedPrefixTree } from '../../../../base/common/prefixTree.js';
import { URI } from '../../../../base/common/uri.js';
import { ICoverageCount } from './testTypes.js';
let incId = 0;
/**
 * Class that exposese coverage information for a run.
 */
export class TestCoverage {
    constructor(result, fromTaskId, uriIdentityService, accessor) {
        this.result = result;
        this.fromTaskId = fromTaskId;
        this.uriIdentityService = uriIdentityService;
        this.accessor = accessor;
        this.fileCoverage = new ResourceMap();
        this.didAddCoverage = observableSignal(this);
        this.tree = new WellDefinedPrefixTree();
        this.associatedData = new Map();
    }
    /** Gets all test IDs that were included in this test run. */
    *allPerTestIDs() {
        const seen = new Set();
        for (const root of this.tree.nodes) {
            if (root.value && root.value.perTestData) {
                for (const id of root.value.perTestData) {
                    if (!seen.has(id)) {
                        seen.add(id);
                        yield id;
                    }
                }
            }
        }
    }
    append(coverage, tx) {
        const previous = this.getComputedForUri(coverage.uri);
        const result = this.result;
        const applyDelta = (kind, node) => {
            if (!node[kind]) {
                if (coverage[kind]) {
                    node[kind] = { ...coverage[kind] };
                }
            }
            else {
                node[kind].covered += (coverage[kind]?.covered || 0) - (previous?.[kind]?.covered || 0);
                node[kind].total += (coverage[kind]?.total || 0) - (previous?.[kind]?.total || 0);
            }
        };
        // We insert using the non-canonical path to normalize for casing differences
        // between URIs, but when inserting an intermediate node always use 'a' canonical
        // version.
        const canonical = [...this.treePathForUri(coverage.uri, /* canonical = */ true)];
        const chain = [];
        this.tree.mutatePath(this.treePathForUri(coverage.uri, /* canonical = */ false), node => {
            chain.push(node);
            if (chain.length === canonical.length) {
                // we reached our destination node, apply the coverage as necessary:
                if (node.value) {
                    const v = node.value;
                    // if ID was generated from a test-specific coverage, reassign it to get its real ID in the extension host.
                    v.id = coverage.id;
                    v.statement = coverage.statement;
                    v.branch = coverage.branch;
                    v.declaration = coverage.declaration;
                }
                else {
                    const v = node.value = new FileCoverage(coverage, result, this.accessor);
                    this.fileCoverage.set(coverage.uri, v);
                }
            }
            else {
                // Otherwise, if this is not a partial per-test coverage, merge the
                // coverage changes into the chain. Per-test coverages are not complete
                // and we don't want to consider them for computation.
                if (!node.value) {
                    // clone because later intersertions can modify the counts:
                    const intermediate = deepClone(coverage);
                    intermediate.id = String(incId++);
                    intermediate.uri = this.treePathToUri(canonical.slice(0, chain.length));
                    node.value = new ComputedFileCoverage(intermediate, result);
                }
                else {
                    applyDelta('statement', node.value);
                    applyDelta('branch', node.value);
                    applyDelta('declaration', node.value);
                    node.value.didChange.trigger(tx);
                }
            }
            if (coverage.testIds) {
                node.value.perTestData ??= new Set();
                for (const id of coverage.testIds) {
                    node.value.perTestData.add(id);
                }
            }
        });
        if (chain) {
            this.didAddCoverage.trigger(tx, chain);
        }
    }
    /**
     * Builds a new tree filtered to per-test coverage data for the given ID.
     */
    filterTreeForTest(testId) {
        const tree = new WellDefinedPrefixTree();
        for (const node of this.tree.values()) {
            if (node instanceof FileCoverage) {
                if (!node.perTestData?.has(testId.toString())) {
                    continue;
                }
                const canonical = [...this.treePathForUri(node.uri, /* canonical = */ true)];
                const chain = [];
                tree.mutatePath(this.treePathForUri(node.uri, /* canonical = */ false), n => {
                    chain.push(n);
                    n.value ??= new BypassedFileCoverage(this.treePathToUri(canonical.slice(0, chain.length)), node.fromResult);
                });
            }
        }
        return tree;
    }
    /**
     * Gets coverage information for all files.
     */
    getAllFiles() {
        return this.fileCoverage;
    }
    /**
     * Gets coverage information for a specific file.
     */
    getUri(uri) {
        return this.fileCoverage.get(uri);
    }
    /**
     * Gets computed information for a file, including DFS-computed information
     * from child tests.
     */
    getComputedForUri(uri) {
        return this.tree.find(this.treePathForUri(uri, /* canonical = */ false));
    }
    *treePathForUri(uri, canconicalPath) {
        yield uri.scheme;
        yield uri.authority;
        const path = !canconicalPath && this.uriIdentityService.extUri.ignorePathCasing(uri) ? uri.path.toLowerCase() : uri.path;
        yield* path.split('/');
    }
    treePathToUri(path) {
        return URI.from({ scheme: path[0], authority: path[1], path: path.slice(2).join('/') });
    }
}
export const getTotalCoveragePercent = (statement, branch, function_) => {
    let numerator = statement.covered;
    let denominator = statement.total;
    if (branch) {
        numerator += branch.covered;
        denominator += branch.total;
    }
    if (function_) {
        numerator += function_.covered;
        denominator += function_.total;
    }
    return denominator === 0 ? 1 : numerator / denominator;
};
export class AbstractFileCoverage {
    /**
     * Gets the total coverage percent based on information provided.
     * This is based on the Clover total coverage formula
     */
    get tpc() {
        return getTotalCoveragePercent(this.statement, this.branch, this.declaration);
    }
    constructor(coverage, fromResult) {
        this.fromResult = fromResult;
        this.didChange = observableSignal(this);
        this.id = coverage.id;
        this.uri = coverage.uri;
        this.statement = coverage.statement;
        this.branch = coverage.branch;
        this.declaration = coverage.declaration;
    }
}
/**
 * File coverage info computed from children in the tree, not provided by the
 * extension.
 */
export class ComputedFileCoverage extends AbstractFileCoverage {
}
/**
 * A virtual node that doesn't have any added coverage info.
 */
export class BypassedFileCoverage extends ComputedFileCoverage {
    constructor(uri, result) {
        super({ id: String(incId++), uri, statement: { covered: 0, total: 0 } }, result);
    }
}
export class FileCoverage extends AbstractFileCoverage {
    /** Gets whether details are synchronously available */
    get hasSynchronousDetails() {
        return this._details instanceof Array || this.resolved;
    }
    constructor(coverage, fromResult, accessor) {
        super(coverage, fromResult);
        this.accessor = accessor;
    }
    /**
     * Gets per-line coverage details.
     */
    async detailsForTest(_testId, token = CancellationToken.None) {
        this._detailsForTest ??= new Map();
        const testId = _testId.toString();
        const prev = this._detailsForTest.get(testId);
        if (prev) {
            return prev;
        }
        const promise = (async () => {
            try {
                return await this.accessor.getCoverageDetails(this.id, testId, token);
            }
            catch (e) {
                this._detailsForTest?.delete(testId);
                throw e;
            }
        })();
        this._detailsForTest.set(testId, promise);
        return promise;
    }
    /**
     * Gets per-line coverage details.
     */
    async details(token = CancellationToken.None) {
        this._details ??= this.accessor.getCoverageDetails(this.id, undefined, token);
        try {
            const d = await this._details;
            this.resolved = true;
            return d;
        }
        catch (e) {
            this._details = undefined;
            throw e;
        }
    }
}
export const totalFromCoverageDetails = (uri, details) => {
    const fc = {
        id: '',
        uri,
        statement: ICoverageCount.empty(),
    };
    for (const detail of details) {
        if (detail.type === 1 /* DetailType.Statement */) {
            fc.statement.total++;
            fc.statement.total += detail.count ? 1 : 0;
            for (const branch of detail.branches || []) {
                fc.branch ??= ICoverageCount.empty();
                fc.branch.total++;
                fc.branch.covered += branch.count ? 1 : 0;
            }
        }
        else {
            fc.declaration ??= ICoverageCount.empty();
            fc.declaration.total++;
            fc.declaration.covered += detail.count ? 1 : 0;
        }
    }
    return fc;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENvdmVyYWdlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdENvdmVyYWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0QsT0FBTyxFQUFnQixnQkFBZ0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBbUIscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFJckQsT0FBTyxFQUErQixjQUFjLEVBQWlCLE1BQU0sZ0JBQWdCLENBQUM7QUFNNUYsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0FBRWQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sWUFBWTtJQU14QixZQUNpQixNQUFzQixFQUN0QixVQUFrQixFQUNqQixrQkFBdUMsRUFDdkMsUUFBMkI7UUFINUIsV0FBTSxHQUFOLE1BQU0sQ0FBZ0I7UUFDdEIsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUNqQix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQ3ZDLGFBQVEsR0FBUixRQUFRLENBQW1CO1FBVDVCLGlCQUFZLEdBQUcsSUFBSSxXQUFXLEVBQWdCLENBQUM7UUFDaEQsbUJBQWMsR0FBRyxnQkFBZ0IsQ0FBMEMsSUFBSSxDQUFDLENBQUM7UUFDakYsU0FBSSxHQUFHLElBQUkscUJBQXFCLEVBQXdCLENBQUM7UUFDekQsbUJBQWMsR0FBRyxJQUFJLEdBQUcsRUFBb0IsQ0FBQztJQU96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