/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import { Utils } from '../common/profiling.js';
import { buildModel, BottomUpNode, processNode } from '../common/profilingModel.js';
export function create() {
    return new ProfileAnalysisWorker();
}
class ProfileAnalysisWorker {
    constructor() {
        this._requestHandlerBrand = undefined;
    }
    $analyseBottomUp(profile) {
        if (!Utils.isValidProfile(profile)) {
            return { kind: 1 /* ProfilingOutput.Irrelevant */, samples: [] };
        }
        const model = buildModel(profile);
        const samples = bottomUp(model, 5)
            .filter(s => !s.isSpecial);
        if (samples.length === 0 || samples[0].percentage < 10) {
            // ignore this profile because 90% of the time is spent inside "special" frames
            // like idle, GC, or program
            return { kind: 1 /* ProfilingOutput.Irrelevant */, samples: [] };
        }
        return { kind: 2 /* ProfilingOutput.Interesting */, samples };
    }
    $analyseByUrlCategory(profile, categories) {
        // build search tree
        const searchTree = TernarySearchTree.forUris();
        searchTree.fill(categories);
        // cost by categories
        const model = buildModel(profile);
        const aggegrateByCategory = new Map();
        for (const node of model.nodes) {
            const loc = model.locations[node.locationId];
            let category;
            try {
                category = searchTree.findSubstr(URI.parse(loc.callFrame.url));
            }
            catch {
                // ignore
            }
            if (!category) {
                category = printCallFrameShort(loc.callFrame);
            }
            const value = aggegrateByCategory.get(category) ?? 0;
            const newValue = value + node.selfTime;
            aggegrateByCategory.set(category, newValue);
        }
        const result = [];
        for (const [key, value] of aggegrateByCategory) {
            result.push([key, value]);
        }
        return result;
    }
}
function isSpecial(call) {
    return call.functionName.startsWith('(') && call.functionName.endsWith(')');
}
function printCallFrameShort(frame) {
    let result = frame.functionName || '(anonymous)';
    if (frame.url) {
        result += '#';
        result += basename(frame.url);
        if (frame.lineNumber >= 0) {
            result += ':';
            result += frame.lineNumber + 1;
        }
        if (frame.columnNumber >= 0) {
            result += ':';
            result += frame.columnNumber + 1;
        }
    }
    return result;
}
function printCallFrameStackLike(frame) {
    let result = frame.functionName || '(anonymous)';
    if (frame.url) {
        result += ' (';
        result += frame.url;
        if (frame.lineNumber >= 0) {
            result += ':';
            result += frame.lineNumber + 1;
        }
        if (frame.columnNumber >= 0) {
            result += ':';
            result += frame.columnNumber + 1;
        }
        result += ')';
    }
    return result;
}
function getHeaviestLocationIds(model, topN) {
    const stackSelfTime = {};
    for (const node of model.nodes) {
        stackSelfTime[node.locationId] = (stackSelfTime[node.locationId] || 0) + node.selfTime;
    }
    const locationIds = Object.entries(stackSelfTime)
        .sort(([, a], [, b]) => b - a)
        .slice(0, topN)
        .map(([locationId]) => Number(locationId));
    return new Set(locationIds);
}
function bottomUp(model, topN) {
    const root = BottomUpNode.root();
    const locationIds = getHeaviestLocationIds(model, topN);
    for (const node of model.nodes) {
        if (locationIds.has(node.locationId)) {
            processNode(root, node, model);
            root.addNode(node);
        }
    }
    const result = Object.values(root.children)
        .sort((a, b) => b.selfTime - a.selfTime)
        .slice(0, topN);
    const samples = [];
    for (const node of result) {
        const sample = {
            selfTime: Math.round(node.selfTime / 1000),
            totalTime: Math.round(node.aggregateTime / 1000),
            location: printCallFrameShort(node.callFrame),
            absLocation: printCallFrameStackLike(node.callFrame),
            url: node.callFrame.url,
            caller: [],
            percentage: Math.round(node.selfTime / (model.duration / 100)),
            isSpecial: isSpecial(node.callFrame)
        };
        // follow the heaviest caller paths
        const stack = [node];
        while (stack.length) {
            const node = stack.pop();
            let top;
            for (const candidate of Object.values(node.children)) {
                if (!top || top.selfTime < candidate.selfTime) {
                    top = candidate;
                }
            }
            if (top) {
                const percentage = Math.round(top.selfTime / (node.selfTime / 100));
                sample.caller.push({
                    percentage,
                    location: printCallFrameShort(top.callFrame),
                    absLocation: printCallFrameStackLike(top.callFrame),
                });
                stack.push(top);
            }
        }
        samples.push(sample);
    }
    return samples;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZmlsZUFuYWx5c2lzV29ya2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcHJvZmlsaW5nL2VsZWN0cm9uLWJyb3dzZXIvcHJvZmlsZUFuYWx5c2lzV29ya2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsT0FBTyxFQUFjLEtBQUssRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBaUMsVUFBVSxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQWdCLE1BQU0sNkJBQTZCLENBQUM7QUFHakksTUFBTSxVQUFVLE1BQU07SUFDckIsT0FBTyxJQUFJLHFCQUFxQixFQUFFLENBQUM7QUFDcEMsQ0FBQztBQUVELE1BQU0scUJBQXFCO0lBQTNCO1FBRUMseUJBQW9CLEdBQVMsU0FBUyxDQUFDO0lBb0R4QyxDQUFDO0lBbERBLGdCQUFnQixDQUFDLE9BQW1CO1FBQ25DLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDcEMsT0FBTyxFQUFFLElBQUksb0NBQTRCLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzFELENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7YUFDaEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFNUIs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