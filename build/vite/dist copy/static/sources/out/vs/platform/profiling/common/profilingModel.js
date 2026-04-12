/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Recursive function that computes and caches the aggregate time for the
 * children of the computed now.
 */
const computeAggregateTime = (index, nodes) => {
    const row = nodes[index];
    if (row.aggregateTime) {
        return row.aggregateTime;
    }
    let total = row.selfTime;
    for (const child of row.children) {
        total += computeAggregateTime(child, nodes);
    }
    return (row.aggregateTime = total);
};
const ensureSourceLocations = (profile) => {
    let locationIdCounter = 0;
    const locationsByRef = new Map();
    const getLocationIdFor = (callFrame) => {
        const ref = [
            callFrame.functionName,
            callFrame.url,
            callFrame.scriptId,
            callFrame.lineNumber,
            callFrame.columnNumber,
        ].join(':');
        const existing = locationsByRef.get(ref);
        if (existing) {
            return existing.id;
        }
        const id = locationIdCounter++;
        locationsByRef.set(ref, {
            id,
            callFrame,
            location: {
                lineNumber: callFrame.lineNumber + 1,
                columnNumber: callFrame.columnNumber + 1,
                // source: {
                // 	name: maybeFileUrlToPath(callFrame.url),
                // 	path: maybeFileUrlToPath(callFrame.url),
                // 	sourceReference: 0,
                // },
            },
        });
        return id;
    };
    for (const node of profile.nodes) {
        node.locationId = getLocationIdFor(node.callFrame);
        node.positionTicks = node.positionTicks?.map(tick => ({
            ...tick,
            // weirdly, line numbers here are 1-based, not 0-based. The position tick
            // only gives line-level granularity, so 'mark' the entire range of source
            // code the tick refers to
            startLocationId: getLocationIdFor({
                ...node.callFrame,
                lineNumber: tick.line - 1,
                columnNumber: 0,
            }),
            endLocationId: getLocationIdFor({
                ...node.callFrame,
                lineNumber: tick.line,
                columnNumber: 0,
            }),
        }));
    }
    return [...locationsByRef.values()]
        .sort((a, b) => a.id - b.id)
        .map(l => ({ locations: [l.location], callFrame: l.callFrame }));
};
/**
 * Computes the model for the given profile.
 */
export const buildModel = (profile) => {
    if (!profile.timeDeltas || !profile.samples) {
        return {
            nodes: [],
            locations: [],
            samples: profile.samples || [],
            timeDeltas: profile.timeDeltas || [],
            // rootPath: profile.$vscode?.rootPath,
            duration: profile.endTime - profile.startTime,
        };
    }
    const { samples, timeDeltas } = profile;
    const sourceLocations = ensureSourceLocations(profile);
    const locations = sourceLocations.map((l, id) => {
        const src = l.locations[0]; //getBestLocation(profile, l.locations);
        return {
            id,
            selfTime: 0,
            aggregateTime: 0,
            ticks: 0,
            // category: categorize(l.callFrame, src),
            callFrame: l.callFrame,
            src,
        };
    });
    const idMap = new Map();
    const mapId = (nodeId) => {
        let id = idMap.get(nodeId);
        if (id === undefined) {
            id = idMap.size;
            idMap.set(nodeId, id);
        }
        return id;
    };
    // 1. Created a sorted list of nodes. It seems that the profile always has
    // incrementing IDs, although they are just not initially sorted.
    const nodes = new Array(profile.nodes.length);
    for (let i = 0; i < profile.nodes.length; i++) {
        const node = profile.nodes[i];
        // make them 0-based:
        const id = mapId(node.id);
        nodes[id] = {
            id,
            selfTime: 0,
            aggregateTime: 0,
            locationId: node.locationId,
            children: node.children?.map(mapId) || [],
        };
        for (const child of node.positionTicks || []) {
            if (child.startLocationId) {
                locations[child.startLocationId].ticks += child.ticks;
            }
        }
    }
    for (const node of nodes) {
        for (const child of node.children) {
            nodes[child].parent = node.id;
        }
    }
    // 2. The profile samples are the 'bottom-most' node, the currently running
    // code. Sum of these in the self time.
    const duration = profile.endTime - profile.startTime;
    let lastNodeTime = duration - timeDeltas[0];
    for (let i = 0; i < timeDeltas.length - 1; i++) {
        const d = timeDeltas[i + 1];
        nodes[mapId(samples[i])].selfTime += d;
        lastNodeTime -= d;
    }
    // Add in an extra time delta for the last sample. `timeDeltas[0]` is the
    // time before the first sample, and the time of the last sample is only
    // derived (approximately) by the missing time in the sum of deltas. Save
    // some work by calculating it here.
    if (nodes.length) {
        nodes[mapId(samples[timeDeltas.length - 1])].selfTime += lastNodeTime;
        timeDeltas.push(lastNodeTime);
    }
    // 3. Add the aggregate times for all node children and locations
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const location = locations[node.locationId];
        location.aggregateTime += computeAggregateTime(i, nodes);
        location.selfTime += node.selfTime;
    }
    return {
        nodes,
        locations,
        samples: samples.map(mapId),
        timeDeltas,
        // rootPath: profile.$vscode?.rootPath,
        duration,
    };
};
export class BottomUpNode {
    static root() {
        return new BottomUpNode({
            id: -1,
            selfTime: 0,
            aggregateTime: 0,
            ticks: 0,
            callFrame: {
                functionName: '(root)',
                lineNumber: -1,
                columnNumber: -1,
                scriptId: '0',
                url: '',
            },
        });
    }
    get id() {
        return this.location.id;
    }
    get callFrame() {
        return this.location.callFrame;
    }
    get src() {
        return this.location.src;
    }
    constructor(location, parent) {
        this.location = location;
        this.parent = parent;
        this.children = {};
        this.aggregateTime = 0;
        this.selfTime = 0;
        this.ticks = 0;
        this.childrenSize = 0;
    }
    addNode(node) {
        this.selfTime += node.selfTime;
        this.aggregateTime += node.aggregateTime;
    }
}
export const processNode = (aggregate, node, model, initialNode = node) => {
    let child = aggregate.children[node.locationId];
    if (!child) {
        child = new BottomUpNode(model.locations[node.locationId], aggregate);
        aggregate.childrenSize++;
        aggregate.children[node.locationId] = child;
    }
    child.addNode(initialNode);
    if (node.parent) {
        processNode(child, model.nodes[node.parent], model, initialNode);
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZmlsaW5nTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9wcm9maWxpbmcvY29tbW9uL3Byb2ZpbGluZ01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBNkVoRzs7O0dBR0c7QUFDSCxNQUFNLG9CQUFvQixHQUFHLENBQUMsS0FBYSxFQUFFLEtBQXNCLEVBQVUsRUFBRTtJQUM5RSxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDekIsSUFBSSxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDdkIsT0FBTyxHQUFHLENBQUMsYUFBYSxDQUFDO0lBQzFCLENBQUM7SUFFRCxJQUFJLEtBQUssR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDO0lBQ3pCLEtBQUssTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xDLEtBQUssSUFBSSxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQ3BDLENBQUMsQ0FBQztBQUVGLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxPQUF1QixFQUFzQyxFQUFFO0lBRTdGLElBQUksaUJBQWlCLEdBQUcsQ0FBQyxDQUFDO0lBQzFCLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxFQUE4RSxDQUFDO0lBRTdHLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUF1QixFQUFFLEVBQUU7UUFDcEQsTUFBTSxHQUFHLEdBQUc7WUFDWCxTQUFTLENBQUMsWUFBWTtZQUN0QixTQUFTLENBQUMsR0FBRztZQUNiLFNBQVMsQ0FBQyxRQUFRO1lBQ2xCLFNBQVMsQ0FBQyxVQUFVO1lBQ3BCLFNBQVMsQ0FBQyxZQUFZO1NBQ3RCLENB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