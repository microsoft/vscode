/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//
// The red-black tree is based on the "Introduction to Algorithms" by Cormen, Leiserson and Rivest.
//
export var ClassName;
(function (ClassName) {
    ClassName["EditorHintDecoration"] = "squiggly-hint";
    ClassName["EditorInfoDecoration"] = "squiggly-info";
    ClassName["EditorWarningDecoration"] = "squiggly-warning";
    ClassName["EditorErrorDecoration"] = "squiggly-error";
    ClassName["EditorUnnecessaryDecoration"] = "squiggly-unnecessary";
    ClassName["EditorUnnecessaryInlineDecoration"] = "squiggly-inline-unnecessary";
    ClassName["EditorDeprecatedInlineDecoration"] = "squiggly-inline-deprecated";
})(ClassName || (ClassName = {}));
export var NodeColor;
(function (NodeColor) {
    NodeColor[NodeColor["Black"] = 0] = "Black";
    NodeColor[NodeColor["Red"] = 1] = "Red";
})(NodeColor || (NodeColor = {}));
var Constants;
(function (Constants) {
    Constants[Constants["ColorMask"] = 1] = "ColorMask";
    Constants[Constants["ColorMaskInverse"] = 254] = "ColorMaskInverse";
    Constants[Constants["ColorOffset"] = 0] = "ColorOffset";
    Constants[Constants["IsVisitedMask"] = 2] = "IsVisitedMask";
    Constants[Constants["IsVisitedMaskInverse"] = 253] = "IsVisitedMaskInverse";
    Constants[Constants["IsVisitedOffset"] = 1] = "IsVisitedOffset";
    Constants[Constants["IsForValidationMask"] = 4] = "IsForValidationMask";
    Constants[Constants["IsForValidationMaskInverse"] = 251] = "IsForValidationMaskInverse";
    Constants[Constants["IsForValidationOffset"] = 2] = "IsForValidationOffset";
    Constants[Constants["StickinessMask"] = 24] = "StickinessMask";
    Constants[Constants["StickinessMaskInverse"] = 231] = "StickinessMaskInverse";
    Constants[Constants["StickinessOffset"] = 3] = "StickinessOffset";
    Constants[Constants["CollapseOnReplaceEditMask"] = 32] = "CollapseOnReplaceEditMask";
    Constants[Constants["CollapseOnReplaceEditMaskInverse"] = 223] = "CollapseOnReplaceEditMaskInverse";
    Constants[Constants["CollapseOnReplaceEditOffset"] = 5] = "CollapseOnReplaceEditOffset";
    Constants[Constants["IsMarginMask"] = 64] = "IsMarginMask";
    Constants[Constants["IsMarginMaskInverse"] = 191] = "IsMarginMaskInverse";
    Constants[Constants["IsMarginOffset"] = 6] = "IsMarginOffset";
    Constants[Constants["AffectsFontMask"] = 128] = "AffectsFontMask";
    Constants[Constants["AffectsFontMaskInverse"] = 127] = "AffectsFontMaskInverse";
    Constants[Constants["AffectsFontOffset"] = 7] = "AffectsFontOffset";
    /**
     * Due to how deletion works (in order to avoid always walking the right subtree of the deleted node),
     * the deltas for nodes can grow and shrink dramatically. It has been observed, in practice, that unless
     * the deltas are corrected, integer overflow will occur.
     *
     * The integer overflow occurs when 53 bits are used in the numbers, but we will try to avoid it as
     * a node's delta gets below a negative 30 bits number.
     *
     * MIN SMI (SMall Integer) as defined in v8.
     * one bit is lost for boxing/unboxing flag.
     * one bit is lost for sign flag.
     * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
     */
    Constants[Constants["MIN_SAFE_DELTA"] = -1073741824] = "MIN_SAFE_DELTA";
    /**
     * MAX SMI (SMall Integer) as defined in v8.
     * one bit is lost for boxing/unboxing flag.
     * one bit is lost for sign flag.
     * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
     */
    Constants[Constants["MAX_SAFE_DELTA"] = 1073741824] = "MAX_SAFE_DELTA";
})(Constants || (Constants = {}));
export function getNodeColor(node) {
    return ((node.metadata & 1 /* Constants.ColorMask */) >>> 0 /* Constants.ColorOffset */);
}
function setNodeColor(node, color) {
    node.metadata = ((node.metadata & 254 /* Constants.ColorMaskInverse */) | (color << 0 /* Constants.ColorOffset */));
}
function getNodeIsVisited(node) {
    return ((node.metadata & 2 /* Constants.IsVisitedMask */) >>> 1 /* Constants.IsVisitedOffset */) === 1;
}
function setNodeIsVisited(node, value) {
    node.metadata = ((node.metadata & 253 /* Constants.IsVisitedMaskInverse */) | ((value ? 1 : 0) << 1 /* Constants.IsVisitedOffset */));
}
function getNodeIsForValidation(node) {
    return ((node.metadata & 4 /* Constants.IsForValidationMask */) >>> 2 /* Constants.IsForValidationOffset */) === 1;
}
function setNodeIsForValidation(node, value) {
    node.metadata = ((node.metadata & 251 /* Constants.IsForValidationMaskInverse */) | ((value ? 1 : 0) << 2 /* Constants.IsForValidationOffset */));
}
function getNodeIsInGlyphMargin(node) {
    return ((node.metadata & 64 /* Constants.IsMarginMask */) >>> 6 /* Constants.IsMarginOffset */) === 1;
}
function setNodeIsInGlyphMargin(node, value) {
    node.metadata = ((node.metadata & 191 /* Constants.IsMarginMaskInverse */) | ((value ? 1 : 0) << 6 /* Constants.IsMarginOffset */));
}
function getNodeAffectsFont(node) {
    return ((node.metadata & 128 /* Constants.AffectsFontMask */) >>> 7 /* Constants.AffectsFontOffset */) === 1;
}
function setNodeAffectsFont(node, value) {
    node.metadata = ((node.metadata & 127 /* Constants.AffectsFontMaskInverse */) | ((value ? 1 : 0) << 7 /* Constants.AffectsFontOffset */));
}
function getNodeStickiness(node) {
    return ((node.metadata & 24 /* Constants.StickinessMask */) >>> 3 /* Constants.StickinessOffset */);
}
function _setNodeStickiness(node, stickiness) {
    node.metadata = ((node.metadata & 231 /* Constants.StickinessMaskInverse */) | (stickiness << 3 /* Constants.StickinessOffset */));
}
function getCollapseOnReplaceEdit(node) {
    return ((node.metadata & 32 /* Constants.CollapseOnReplaceEditMask */) >>> 5 /* Constants.CollapseOnReplaceEditOffset */) === 1;
}
function setCollapseOnReplaceEdit(node, value) {
    node.metadata = ((node.metadata & 223 /* Constants.CollapseOnReplaceEditMaskInverse */) | ((value ? 1 : 0) << 5 /* Constants.CollapseOnReplaceEditOffset */));
}
export function setNodeStickiness(node, stickiness) {
    _setNodeStickiness(node, stickiness);
}
export class IntervalNode {
    constructor(id, start, end) {
        this.metadata = 0;
        this.parent = this;
        this.left = this;
        this.right = this;
        setNodeColor(this, 1 /* NodeColor.Red */);
        this.start = start;
        this.end = end;
        // FORCE_OVERFLOWING_TEST: this.delta = start;
        this.delta = 0;
        this.maxEnd = end;
        this.id = id;
        this.ownerId = 0;
        this.options = null;
        setNodeIsForValidation(this, false);
        setNodeIsInGlyphMargin(this, false);
        _setNodeStickiness(this, 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */);
        setCollapseOnReplaceEdit(this, false);
        setNodeAffectsFont(this, false);
        this.cachedVersionId = 0;
        this.cachedAbsoluteStart = start;
        this.cachedAbsoluteEnd = end;
        this.range = null;
        setNodeIsVisited(this, false);
    }
    reset(versionId, start, end, range) {
        this.start = start;
        this.end = end;
        this.maxEnd = end;
        this.cachedVersionId = versionId;
        this.cachedAbsoluteStart = start;
        this.cachedAbsoluteEnd = end;
        this.range = range;
    }
    setOptions(options) {
        this.options = options;
        const className = this.options.className;
        setNodeIsForValidation(this, (className === "squiggly-error" /* ClassName.EditorErrorDecoration */
            || className === "squiggly-warning" /* ClassName.EditorWarningDecoration */
            || className === "squiggly-info" /* ClassName.EditorInfoDecoration */));
        setNodeIsInGlyphMargin(this, this.options.glyphMarginClassName !== null);
        _setNodeStickiness(this, this.options.stickiness);
        setCollapseOnReplaceEdit(this, this.options.collapseOnReplaceEdit);
        setNodeAffectsFont(this, this.options.affectsFont ?? false);
    }
    setCachedOffsets(absoluteStart, absoluteEnd, cachedVersionId) {
        if (this.cachedVersionId !== cachedVersionId) {
            this.range = null;
        }
        this.cachedVersionId = cachedVersionId;
        this.cachedAbsoluteStart = absoluteStart;
        this.cachedAbsoluteEnd = absoluteEnd;
    }
    detach() {
        this.parent = null;
        this.left = null;
        this.right = null;
    }
}
export const SENTINEL = new IntervalNode(null, 0, 0);
SENTINEL.parent = SENTINEL;
SENTINEL.left = SENTINEL;
SENTINEL.right = SENTINEL;
setNodeColor(SENTINEL, 0 /* NodeColor.Black */);
export class IntervalTree {
    constructor() {
        this.root = SENTINEL;
        this.requestNormalizeDelta = false;
    }
    intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
        if (this.root === SENTINEL) {
            return [];
        }
        return intervalSearch(this, start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    }
    search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
        if (this.root === SENTINEL) {
            return [];
        }
        return search(this, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    }
    /**
     * Will not set `cachedAbsoluteStart` nor `cachedAbsoluteEnd` on the returned nodes!
     */
    collectNodesFromOwner(ownerId) {
        return collectNodesFromOwner(this, ownerId);
    }
    /**
     * Will not set `cachedAbsoluteStart` nor `cachedAbsoluteEnd` on the returned nodes!
     */
    collectNodesPostOrder() {
        return collectNodesPostOrder(this);
    }
    insert(node) {
        rbTreeInsert(this, node);
        this._normalizeDeltaIfNecessary();
    }
    delete(node) {
        rbTreeDelete(this, node);
        this._normalizeDeltaIfNecessary();
    }
    resolveNode(node, cachedVersionId) {
        const initialNode = node;
        let delta = 0;
        while (node !== this.root) {
            if (node === node.parent.right) {
                delta += node.parent.delta;
            }
            node = node.parent;
        }
        const nodeStart = initialNode.start + delta;
        const nodeEnd = initialNode.end + delta;
        initialNode.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
    }
    acceptReplace(offset, length, textLength, forceMoveMarkers) {
        // Our strategy is to remove all directly impacted nodes, and then add them back to the tree.
        // (1) collect all nodes that are intersecting this edit as nodes of interest
        const nodesOfInterest = searchForEditing(this, offset, offset + length);
        // (2) remove all nodes that are intersecting this edit
        for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
            const node = nodesOfInterest[i];
            rbTreeDelete(this, node);
        }
        this._normalizeDeltaIfNecessary();
        // (3) edit all tree nodes except the nodes of interest
        noOverlapReplace(this, offset, offset + length, textLength);
        this._normalizeDeltaIfNecessary();
        // (4) edit the nodes of interest and insert them back in the tree
        for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
            const node = nodesOfInterest[i];
            node.start = node.cachedAbsoluteStart;
            node.end = node.cachedAbsoluteEnd;
            nodeAcceptEdit(node, offset, (offset + length), textLength, forceMoveMarkers);
            node.maxEnd = node.end;
            rbTreeInsert(this, node);
        }
        this._normalizeDeltaIfNecessary();
    }
    getAllInOrder() {
        return search(this, 0, false, false, 0, false);
    }
    _normalizeDeltaIfNecessary() {
        if (!this.requestNormalizeDelta) {
            return;
        }
        this.requestNormalizeDelta = false;
        normalizeDelta(this);
    }
}
//#region Delta Normalization
function normalizeDelta(T) {
    let node = T.root;
    let delta = 0;
    while (node !== SENTINEL) {
        if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
            // go left
            node = node.left;
            continue;
        }
        if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
            // go right
            delta += node.delta;
            node = node.right;
            continue;
        }
        // handle current node
        node.start = delta + node.start;
        node.end = delta + node.end;
        node.delta = 0;
        recomputeMaxEnd(node);
        setNodeIsVisited(node, true);
        // going up from this node
        setNodeIsVisited(node.left, false);
        setNodeIsVisited(node.right, false);
        if (node === node.parent.right) {
            delta -= node.parent.delta;
        }
        node = node.parent;
    }
    setNodeIsVisited(T.root, false);
}
//#endregion
//#region Editing
var MarkerMoveSemantics;
(function (MarkerMoveSemantics) {
    MarkerMoveSemantics[MarkerMoveSemantics["MarkerDefined"] = 0] = "MarkerDefined";
    MarkerMoveSemantics[MarkerMoveSemantics["ForceMove"] = 1] = "ForceMove";
    MarkerMoveSemantics[MarkerMoveSemantics["ForceStay"] = 2] = "ForceStay";
})(MarkerMoveSemantics || (MarkerMoveSemantics = {}));
function adjustMarkerBeforeColumn(markerOffset, markerStickToPreviousCharacter, checkOffset, moveSemantics) {
    if (markerOffset < checkOffset) {
        return true;
    }
    if (markerOffset > checkOffset) {
        return false;
    }
    if (moveSemantics === 1 /* MarkerMoveSemantics.ForceMove */) {
        return false;
    }
    if (moveSemantics === 2 /* MarkerMoveSemantics.ForceStay */) {
        return true;
    }
    return markerStickToPreviousCharacter;
}
/**
 * This is a lot more complicated than strictly necessary to maintain the same behaviour
 * as when decorations were implemented using two markers.
 */
export function nodeAcceptEdit(node, start, end, textLength, forceMoveMarkers) {
    const nodeStickiness = getNodeStickiness(node);
    const startStickToPreviousCharacter = (nodeStickiness === 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */
        || nodeStickiness === 2 /* TrackedRangeStickiness.GrowsOnlyWhenTypingBefore */);
    const endStickToPreviousCharacter = (nodeStickiness === 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
        || nodeStickiness === 2 /* TrackedRangeStickiness.GrowsOnlyWhenTypingBefore */);
    const deletingCnt = (end - start);
    const insertingCnt = textLength;
    const commonLength = Math.min(deletingCnt, insertingCnt);
    const nodeStart = node.start;
    let startDone = false;
    const nodeEnd = node.end;
    let endDone = false;
    if (start <= nodeStart && nodeEnd <= end && getCollapseOnReplaceEdit(node)) {
        // This edit encompasses the entire decoration range
        // and the decoration has asked to become collapsed
        node.start = start;
        startDone = true;
        node.end = start;
        endDone = true;
    }
    {
        const moveSemantics = forceMoveMarkers ? 1 /* MarkerMoveSemantics.ForceMove */ : (deletingCnt > 0 ? 2 /* MarkerMoveSemantics.ForceStay */ : 0 /* MarkerMoveSemantics.MarkerDefined */);
        if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start, moveSemantics)) {
            startDone = true;
        }
        if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start, moveSemantics)) {
            endDone = true;
        }
    }
    if (commonLength > 0 && !forceMoveMarkers) {
        const moveSemantics = (deletingCnt > insertingCnt ? 2 /* MarkerMoveSemantics.ForceStay */ : 0 /* MarkerMoveSemantics.MarkerDefined */);
        if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start + commonLength, moveSemantics)) {
            startDone = true;
        }
        if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start + commonLength, moveSemantics)) {
            endDone = true;
        }
    }
    {
        const moveSemantics = forceMoveMarkers ? 1 /* MarkerMoveSemantics.ForceMove */ : 0 /* MarkerMoveSemantics.MarkerDefined */;
        if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, end, moveSemantics)) {
            node.start = start + insertingCnt;
            startDone = true;
        }
        if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, end, moveSemantics)) {
            node.end = start + insertingCnt;
            endDone = true;
        }
    }
    // Finish
    const deltaColumn = (insertingCnt - deletingCnt);
    if (!startDone) {
        node.start = Math.max(0, nodeStart + deltaColumn);
    }
    if (!endDone) {
        node.end = Math.max(0, nodeEnd + deltaColumn);
    }
    if (node.start > node.end) {
        node.end = node.start;
    }
}
function searchForEditing(T, start, end) {
    // https://en.wikipedia.org/wiki/Interval_tree#Augmented_tree
    // Now, it is known that two intervals A and B overlap only when both
    // A.low <= B.high and A.high >= B.low. When searching the trees for
    // nodes overlapping with a given interval, you can immediately skip:
    //  a) all nodes to the right of nodes whose low value is past the end of the given interval.
    //  b) all nodes that have their maximum 'high' value below the start of the given interval.
    let node = T.root;
    let delta = 0;
    let nodeMaxEnd = 0;
    let nodeStart = 0;
    let nodeEnd = 0;
    const result = [];
    let resultLen = 0;
    while (node !== SENTINEL) {
        if (getNodeIsVisited(node)) {
            // going up from this node
            setNodeIsVisited(node.left, false);
            setNodeIsVisited(node.right, false);
            if (node === node.parent.right) {
                delta -= node.parent.delta;
            }
            node = node.parent;
            continue;
        }
        if (!getNodeIsVisited(node.left)) {
            // first time seeing this node
            nodeMaxEnd = delta + node.maxEnd;
            if (nodeMaxEnd < start) {
                // cover case b) from above
                // there is no need to search this node or its children
                setNodeIsVisited(node, true);
                continue;
            }
            if (node.left !== SENTINEL) {
                // go left
                node = node.left;
                continue;
            }
        }
        // handle current node
        nodeStart = delta + node.start;
        if (nodeStart > end) {
            // cover case a) from above
            // there is no need to search this node or its right subtree
            setNodeIsVisited(node, true);
            continue;
        }
        nodeEnd = delta + node.end;
        if (nodeEnd >= start) {
            node.setCachedOffsets(nodeStart, nodeEnd, 0);
            result[resultLen++] = node;
        }
        setNodeIsVisited(node, true);
        if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
            // go right
            delta += node.delta;
            node = node.right;
            continue;
        }
    }
    setNodeIsVisited(T.root, false);
    return result;
}
function noOverlapReplace(T, start, end, textLength) {
    // https://en.wikipedia.org/wiki/Interval_tree#Augmented_tree
    // Now, it is known that two intervals A and B overlap only when both
    // A.low <= B.high and A.high >= B.low. When searching the trees for
    // nodes overlapping with a given interval, you can immediately skip:
    //  a) all nodes to the right of nodes whose low value is past the end of the given interval.
    //  b) all nodes that have their maximum 'high' value below the start of the given interval.
    let node = T.root;
    let delta = 0;
    let nodeMaxEnd = 0;
    let nodeStart = 0;
    const editDelta = (textLength - (end - start));
    while (node !== SENTINEL) {
        if (getNodeIsVisited(node)) {
            // going up from this node
            setNodeIsVisited(node.left, false);
            setNodeIsVisited(node.right, false);
            if (node === node.parent.right) {
                delta -= node.parent.delta;
            }
            recomputeMaxEnd(node);
            node = node.parent;
            continue;
        }
        if (!getNodeIsVisited(node.left)) {
            // first time seeing this node
            nodeMaxEnd = delta + node.maxEnd;
            if (nodeMaxEnd < start) {
                // cover case b) from above
                // there is no need to search this node or its children
                setNodeIsVisited(node, true);
                continue;
            }
            if (node.left !== SENTINEL) {
                // go left
                node = node.left;
                continue;
            }
        }
        // handle current node
        nodeStart = delta + node.start;
        if (nodeStart > end) {
            node.start += editDelta;
            node.end += editDelta;
            node.delta += editDelta;
            if (node.delta < -1073741824 /* Constants.MIN_SAFE_DELTA */ || node.delta > 1073741824 /* Constants.MAX_SAFE_DELTA */) {
                T.requestNormalizeDelta = true;
            }
            // cover case a) from above
            // there is no need to search this node or its right subtree
            setNodeIsVisited(node, true);
            continue;
        }
        setNodeIsVisited(node, true);
        if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
            // go right
            delta += node.delta;
            node = node.right;
            continue;
        }
    }
    setNodeIsVisited(T.root, false);
}
//#endregion
//#region Searching
function collectNodesFromOwner(T, ownerId) {
    let node = T.root;
    const result = [];
    let resultLen = 0;
    while (node !== SENTINEL) {
        if (getNodeIsVisited(node)) {
            // going up from this node
            setNodeIsVisited(node.left, false);
            setNodeIsVisited(node.right, false);
            node = node.parent;
            continue;
        }
        if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
            // go left
            node = node.left;
            continue;
        }
        // handle current node
        if (node.ownerId === ownerId) {
            result[resultLen++] = node;
        }
        setNodeIsVisited(node, true);
        if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
            // go right
            node = node.right;
            continue;
        }
    }
    setNodeIsVisited(T.root, false);
    return result;
}
function collectNodesPostOrder(T) {
    let node = T.root;
    const result = [];
    let resultLen = 0;
    while (node !== SENTINEL) {
        if (getNodeIsVisited(node)) {
            // going up from this node
            setNodeIsVisited(node.left, false);
            setNodeIsVisited(node.right, false);
            node = node.parent;
            continue;
        }
        if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
            // go left
            node = node.left;
            continue;
        }
        if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
            // go right
            node = node.right;
            continue;
        }
        // handle current node
        result[resultLen++] = node;
        setNodeIsVisited(node, true);
    }
    setNodeIsVisited(T.root, false);
    return result;
}
function search(T, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    let node = T.root;
    let delta = 0;
    let nodeStart = 0;
    let nodeEnd = 0;
    const result = [];
    let resultLen = 0;
    while (node !== SENTINEL) {
        if (getNodeIsVisited(node)) {
            // going up from this node
            setNodeIsVisited(node.left, false);
            setNodeIsVisited(node.right, false);
            if (node === node.parent.right) {
                delta -= node.parent.delta;
            }
            node = node.parent;
            continue;
        }
        if (node.left !== SENTINEL && !getNodeIsVisited(node.left)) {
            // go left
            node = node.left;
            continue;
        }
        // handle current node
        nodeStart = delta + node.start;
        nodeEnd = delta + node.end;
        node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
        let include = true;
        if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
            include = false;
        }
        if (filterOutValidation && getNodeIsForValidation(node)) {
            include = false;
        }
        if (filterFontDecorations && getNodeAffectsFont(node)) {
            include = false;
        }
        if (onlyMarginDecorations && !getNodeIsInGlyphMargin(node)) {
            include = false;
        }
        if (include) {
            result[resultLen++] = node;
        }
        setNodeIsVisited(node, true);
        if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
            // go right
            delta += node.delta;
            node = node.right;
            continue;
        }
    }
    setNodeIsVisited(T.root, false);
    return result;
}
function intervalSearch(T, intervalStart, intervalEnd, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    // https://en.wikipedia.org/wiki/Interval_tree#Augmented_tree
    // Now, it is known that two intervals A and B overlap only when both
    // A.low <= B.high and A.high >= B.low. When searching the trees for
    // nodes overlapping with a given interval, you can immediately skip:
    //  a) all nodes to the right of nodes whose low value is past the end of the given interval.
    //  b) all nodes that have their maximum 'high' value below the start of the given interval.
    let node = T.root;
    let delta = 0;
    let nodeMaxEnd = 0;
    let nodeStart = 0;
    let nodeEnd = 0;
    const result = [];
    let resultLen = 0;
    while (node !== SENTINEL) {
        if (getNodeIsVisited(node)) {
            // going up from this node
            setNodeIsVisited(node.left, false);
            setNodeIsVisited(node.right, false);
            if (node === node.parent.right) {
                delta -= node.parent.delta;
            }
            node = node.parent;
            continue;
        }
        if (!getNodeIsVisited(node.left)) {
            // first time seeing this node
            nodeMaxEnd = delta + node.maxEnd;
            if (nodeMaxEnd < intervalStart) {
                // cover case b) from above
                // there is no need to search this node or its children
                setNodeIsVisited(node, true);
                continue;
            }
            if (node.left !== SENTINEL) {
                // go left
                node = node.left;
                continue;
            }
        }
        // handle current node
        nodeStart = delta + node.start;
        if (nodeStart > intervalEnd) {
            // cover case a) from above
            // there is no need to search this node or its right subtree
            setNodeIsVisited(node, true);
            continue;
        }
        nodeEnd = delta + node.end;
        if (nodeEnd >= intervalStart) {
            // There is overlap
            node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
            let include = true;
            if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
                include = false;
            }
            if (filterOutValidation && getNodeIsForValidation(node)) {
                include = false;
            }
            if (filterFontDecorations && getNodeAffectsFont(node)) {
                include = false;
            }
            if (onlyMarginDecorations && !getNodeIsInGlyphMargin(node)) {
                include = false;
            }
            if (include) {
                result[resultLen++] = node;
            }
        }
        setNodeIsVisited(node, true);
        if (node.right !== SENTINEL && !getNodeIsVisited(node.right)) {
            // go right
            delta += node.delta;
            node = node.right;
            continue;
        }
    }
    setNodeIsVisited(T.root, false);
    return result;
}
//#endregion
//#region Insertion
function rbTreeInsert(T, newNode) {
    if (T.root === SENTINEL) {
        newNode.parent = SENTINEL;
        newNode.left = SENTINEL;
        newNode.right = SENTINEL;
        setNodeColor(newNode, 0 /* NodeColor.Black */);
        T.root = newNode;
        return T.root;
    }
    treeInsert(T, newNode);
    recomputeMaxEndWalkToRoot(newNode.parent);
    // repair tree
    let x = newNode;
    while (x !== T.root && getNodeColor(x.parent) === 1 /* NodeColor.Red */) {
        if (x.parent === x.parent.parent.left) {
            const y = x.parent.parent.right;
            if (getNodeColor(y) === 1 /* NodeColor.Red */) {
                setNodeColor(x.parent, 0 /* NodeColor.Black */);
                setNodeColor(y, 0 /* NodeColor.Black */);
                setNodeColor(x.parent.parent, 1 /* NodeColor.Red */);
                x = x.parent.parent;
            }
            else {
                if (x === x.parent.right) {
                    x = x.parent;
                    leftRotate(T, x);
                }
                setNodeColor(x.parent, 0 /* NodeColor.Black */);
                setNodeColor(x.parent.parent, 1 /* NodeColor.Red */);
                rightRotate(T, x.parent.parent);
            }
        }
        else {
            const y = x.parent.parent.left;
            if (getNodeColor(y) === 1 /* NodeColor.Red */) {
                setNodeColor(x.parent, 0 /* NodeColor.Black */);
                setNodeColor(y, 0 /* NodeColor.Black */);
                setNodeColor(x.parent.parent, 1 /* NodeColor.Red */);
                x = x.parent.parent;
            }
            else {
                if (x === x.parent.left) {
                    x = x.parent;
                    rightRotate(T, x);
                }
                setNodeColor(x.parent, 0 /* NodeColor.Black */);
                setNodeColor(x.parent.parent, 1 /* NodeColor.Red */);
                leftRotate(T, x.parent.parent);
            }
        }
    }
    setNodeColor(T.root, 0 /* NodeColor.Black */);
    return newNode;
}
function treeInsert(T, z) {
    let delta = 0;
    let x = T.root;
    const zAbsoluteStart = z.start;
    const zAbsoluteEnd = z.end;
    while (true) {
        const cmp = intervalCompare(zAbsoluteStart, zAbsoluteEnd, x.start + delta, x.end + delta);
        if (cmp < 0) {
            // this node should be inserted to the left
            // => it is not affected by the node's delta
            if (x.left === SENTINEL) {
                z.start -= delta;
                z.end -= delta;
                z.maxEnd -= delta;
                x.left = z;
                break;
            }
            else {
                x = x.left;
            }
        }
        else {
            // this node should be inserted to the right
            // => it is not affected by the node's delta
            if (x.right === SENTINEL) {
                z.start -= (delta + x.delta);
                z.end -= (delta + x.delta);
                z.maxEnd -= (delta + x.delta);
                x.right = z;
                break;
            }
            else {
                delta += x.delta;
                x = x.right;
            }
        }
    }
    z.parent = x;
    z.left = SENTINEL;
    z.right = SENTINEL;
    setNodeColor(z, 1 /* NodeColor.Red */);
}
//#endregion
//#region Deletion
function rbTreeDelete(T, z) {
    let x;
    let y;
    // RB-DELETE except we don't swap z and y in case c)
    // i.e. we always delete what's pointed at by z.
    if (z.left === SENTINEL) {
        x = z.right;
        y = z;
        // x's delta is no longer influenced by z's delta
        x.delta += z.delta;
        if (x.delta < -1073741824 /* Constants.MIN_SAFE_DELTA */ || x.delta > 1073741824 /* Constants.MAX_SAFE_DELTA */) {
            T.requestNormalizeDelta = true;
        }
        x.start += z.delta;
        x.end += z.delta;
    }
    else if (z.right === SENTINEL) {
        x = z.left;
        y = z;
    }
    else {
        y = leftest(z.right);
        x = y.right;
        // y's delta is no longer influenced by z's delta,
        // but we don't want to walk the entire right-hand-side subtree of x.
        // we therefore maintain z's delta in y, and adjust only x
        x.start += y.delta;
        x.end += y.delta;
        x.delta += y.delta;
        if (x.delta < -1073741824 /* Constants.MIN_SAFE_DELTA */ || x.delta > 1073741824 /* Constants.MAX_SAFE_DELTA */) {
            T.requestNormalizeDelta = true;
        }
        y.start += z.delta;
        y.end += z.delta;
        y.delta = z.delta;
        if (y.delta < -1073741824 /* Constants.MIN_SAFE_DELTA */ || y.delta > 1073741824 /* Constants.MAX_SAFE_DELTA */) {
            T.requestNormalizeDelta = true;
        }
    }
    if (y === T.root) {
        T.root = x;
        setNodeColor(x, 0 /* NodeColor.Black */);
        z.detach();
        resetSentinel();
        recomputeMaxEnd(x);
        T.root.parent = SENTINEL;
        return;
    }
    const yWasRed = (getNodeColor(y) === 1 /* NodeColor.Red */);
    if (y === y.parent.left) {
        y.parent.left = x;
    }
    else {
        y.parent.right = x;
    }
    if (y === z) {
        x.parent = y.parent;
    }
    else {
        if (y.parent === z) {
            x.parent = y;
        }
        else {
            x.parent = y.parent;
        }
        y.left = z.left;
        y.right = z.right;
        y.parent = z.parent;
        setNodeColor(y, getNodeColor(z));
        if (z === T.root) {
            T.root = y;
        }
        else {
            if (z === z.parent.left) {
                z.parent.left = y;
            }
            else {
                z.parent.right = y;
            }
        }
        if (y.left !== SENTINEL) {
            y.left.parent = y;
        }
        if (y.right !== SENTINEL) {
            y.right.parent = y;
        }
    }
    z.detach();
    if (yWasRed) {
        recomputeMaxEndWalkToRoot(x.parent);
        if (y !== z) {
            recomputeMaxEndWalkToRoot(y);
            recomputeMaxEndWalkToRoot(y.parent);
        }
        resetSentinel();
        return;
    }
    recomputeMaxEndWalkToRoot(x);
    recomputeMaxEndWalkToRoot(x.parent);
    if (y !== z) {
        recomputeMaxEndWalkToRoot(y);
        recomputeMaxEndWalkToRoot(y.parent);
    }
    // RB-DELETE-FIXUP
    let w;
    while (x !== T.root && getNodeColor(x) === 0 /* NodeColor.Black */) {
        if (x === x.parent.left) {
            w = x.parent.right;
            if (getNodeColor(w) === 1 /* NodeColor.Red */) {
                setNodeColor(w, 0 /* NodeColor.Black */);
                setNodeColor(x.parent, 1 /* NodeColor.Red */);
                leftRotate(T, x.parent);
                w = x.parent.right;
            }
            if (getNodeColor(w.left) === 0 /* NodeColor.Black */ && getNodeColor(w.right) === 0 /* NodeColor.Black */) {
                setNodeColor(w, 1 /* NodeColor.Red */);
                x = x.parent;
            }
            else {
                if (getNodeColor(w.right) === 0 /* NodeColor.Black */) {
                    setNodeColor(w.left, 0 /* NodeColor.Black */);
                    setNodeColor(w, 1 /* NodeColor.Red */);
                    rightRotate(T, w);
                    w = x.parent.right;
                }
                setNodeColor(w, getNodeColor(x.parent));
                setNodeColor(x.parent, 0 /* NodeColor.Black */);
                setNodeColor(w.right, 0 /* NodeColor.Black */);
                leftRotate(T, x.parent);
                x = T.root;
            }
        }
        else {
            w = x.parent.left;
            if (getNodeColor(w) === 1 /* NodeColor.Red */) {
                setNodeColor(w, 0 /* NodeColor.Black */);
                setNodeColor(x.parent, 1 /* NodeColor.Red */);
                rightRotate(T, x.parent);
                w = x.parent.left;
            }
            if (getNodeColor(w.left) === 0 /* NodeColor.Black */ && getNodeColor(w.right) === 0 /* NodeColor.Black */) {
                setNodeColor(w, 1 /* NodeColor.Red */);
                x = x.parent;
            }
            else {
                if (getNodeColor(w.left) === 0 /* NodeColor.Black */) {
                    setNodeColor(w.right, 0 /* NodeColor.Black */);
                    setNodeColor(w, 1 /* NodeColor.Red */);
                    leftRotate(T, w);
                    w = x.parent.left;
                }
                setNodeColor(w, getNodeColor(x.parent));
                setNodeColor(x.parent, 0 /* NodeColor.Black */);
                setNodeColor(w.left, 0 /* NodeColor.Black */);
                rightRotate(T, x.parent);
                x = T.root;
            }
        }
    }
    setNodeColor(x, 0 /* NodeColor.Black */);
    resetSentinel();
}
function leftest(node) {
    while (node.left !== SENTINEL) {
        node = node.left;
    }
    return node;
}
function resetSentinel() {
    SENTINEL.parent = SENTINEL;
    SENTINEL.delta = 0; // optional
    SENTINEL.start = 0; // optional
    SENTINEL.end = 0; // optional
}
//#endregion
//#region Rotations
function leftRotate(T, x) {
    const y = x.right; // set y.
    y.delta += x.delta; // y's delta is no longer influenced by x's delta
    if (y.delta < -1073741824 /* Constants.MIN_SAFE_DELTA */ || y.delta > 1073741824 /* Constants.MAX_SAFE_DELTA */) {
        T.requestNormalizeDelta = true;
    }
    y.start += x.delta;
    y.end += x.delta;
    x.right = y.left; // turn y's left subtree into x's right subtree.
    if (y.left !== SENTINEL) {
        y.left.parent = x;
    }
    y.parent = x.parent; // link x's parent to y.
    if (x.parent === SENTINEL) {
        T.root = y;
    }
    else if (x === x.parent.left) {
        x.parent.left = y;
    }
    else {
        x.parent.right = y;
    }
    y.left = x; // put x on y's left.
    x.parent = y;
    recomputeMaxEnd(x);
    recomputeMaxEnd(y);
}
function rightRotate(T, y) {
    const x = y.left;
    y.delta -= x.delta;
    if (y.delta < -1073741824 /* Constants.MIN_SAFE_DELTA */ || y.delta > 1073741824 /* Constants.MAX_SAFE_DELTA */) {
        T.requestNormalizeDelta = true;
    }
    y.start -= x.delta;
    y.end -= x.delta;
    y.left = x.right;
    if (x.right !== SENTINEL) {
        x.right.parent = y;
    }
    x.parent = y.parent;
    if (y.parent === SENTINEL) {
        T.root = x;
    }
    else if (y === y.parent.right) {
        y.parent.right = x;
    }
    else {
        y.parent.left = x;
    }
    x.right = y;
    y.parent = x;
    recomputeMaxEnd(y);
    recomputeMaxEnd(x);
}
//#endregion
//#region max end computation
function computeMaxEnd(node) {
    let maxEnd = node.end;
    if (node.left !== SENTINEL) {
        const leftMaxEnd = node.left.maxEnd;
        if (leftMaxEnd > maxEnd) {
            maxEnd = leftMaxEnd;
        }
    }
    if (node.right !== SENTINEL) {
        const rightMaxEnd = node.right.maxEnd + node.delta;
        if (rightMaxEnd > maxEnd) {
            maxEnd = rightMaxEnd;
        }
    }
    return maxEnd;
}
export function recomputeMaxEnd(node) {
    node.maxEnd = computeMaxEnd(node);
}
function recomputeMaxEndWalkToRoot(node) {
    while (node !== SENTINEL) {
        const maxEnd = computeMaxEnd(node);
        if (node.maxEnd === maxEnd) {
            // no need to go further
            return;
        }
        node.maxEnd = maxEnd;
        node = node.parent;
    }
}
//#endregion
//#region utils
export function intervalCompare(aStart, aEnd, bStart, bEnd) {
    if (aStart === bStart) {
        return aEnd - bEnd;
    }
    return aStart - bStart;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJ2YWxUcmVlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9tb2RlbC9pbnRlcnZhbFRyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFNaEcsRUFBRTtBQUNGLG1HQUFtRztBQUNuRyxFQUFFO0FBRUYsTUFBTSxDQUFOLElBQWtCLFNBUWpCO0FBUkQsV0FBa0IsU0FBUztJQUMxQixtREFBc0MsQ0FBQTtJQUN0QyxtREFBc0MsQ0FBQTtJQUN0Qyx5REFBNEMsQ0FBQTtJQUM1QyxxREFBd0MsQ0FBQTtJQUN4QyxpRUFBb0QsQ0FBQTtJQUNwRCw4RUFBaUUsQ0FBQTtJQUNqRSw0RUFBK0QsQ0FBQTtBQUNoRSxDQUFDLEVBUmlCLFNBQVMsS0FBVCxTQUFTLFFBUTFCO0FBRUQsTUFBTSxDQUFOLElBQWtCLFNBR2pCO0FBSEQsV0FBa0IsU0FBUztJQUMxQiwyQ0FBUyxDQUFBO0lBQ1QsdUNBQU8sQ0FBQTtBQUNSLENBQUMsRUFIaUIsU0FBUyxLQUFULFNBQVMsUUFHMUI7QUFFRCxJQUFXLFNBa0RWO0FBbERELFdBQVcsU0FBUztJQUNuQixtREFBc0IsQ0FBQTtJQUN0QixtRUFBNkIsQ0FBQTtJQUM3Qix1REFBZSxDQUFBO0lBRWYsMkRBQTBCLENBQUE7SUFDMUIsMkVBQWlDLENBQUE7SUFDakMsK0RBQW1CLENBQUE7SUFFbkIsdUVBQWdDLENBQUE7SUFDaEMsdUZBQXVDLENBQUE7SUFDdkMsMkVBQXlCLENBQUE7SUFFekIsOERBQTJCLENBQUE7SUFDM0IsNkVBQWtDLENBQUE7SUFDbEMsaUVBQW9CLENBQUE7SUFFcEIsb0ZBQXNDLENBQUE7SUFDdEMsbUdBQTZDLENBQUE7SUFDN0MsdUZBQStCLENBQUE7SUFFL0IsMERBQXlCLENBQUE7SUFDekIseUVBQWdDLENBQUE7SUFDaEMsNkRBQWtCLENBQUE7SUFFbEIsaUVBQTRCLENBQUE7SUFDNUIsK0VBQW1DLENBQUE7SUFDbkMsbUVBQXFCLENBQUE7SUFFckI7Ozs7Ozs7Ozs7OztPQVlHO0lBQ0gsdUVBQTJCLENBQUE7SUFDM0I7Ozs7O09BS0c7SUFDSCxzRUFBd0IsQ0FBQTtBQUN6QixDQUFDLEVBbERVLFNBQVMsS0FBVCxTQUFTLFFBa0RuQjtBQUVELE1BQU0sVUFBVSxZQUFZLENBQUMsSUFBa0I7SUFDOUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsOEJBQXNCLENBQUMsa0NBQTBCLENBQUMsQ0FBQztBQUMxRSxDQUFDO0FBQ0QsU0FBUyxZQUFZLENBQUMsSUFBa0IsRUFBRSxLQUFnQjtJQUN6RCxJQUFJLENBQUMsUUFBUSxHQUFHLENBQ2YsQ0FBQyxJQUFJLENBQUMsUUFBUSx1Q0FBNkIsQ0FBQyxHQUFHLENBQUMsS0FBSyxpQ0FBeUIsQ0FBQyxDQUMvRSxDQUFDO0FBQ0gsQ0FBQztBQUNELFNBQVMsZ0JBQWdCLENBQUMsSUFBa0I7SUFDM0MsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsa0NBQTBCLENBQUMsc0NBQThCLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDeEYsQ0FBQztBQUNELFNBQVMsZ0JBQWdCLENBQUMsSUFBa0IsRUFBRSxLQUFjO0lBQzNELElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FDZixDQUFDLElBQUksQ0FBQyxRQUFRLDJDQUFpQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMscUNBQTZCLENBQUMsQ0FDakcsQ0FBQztBQUNILENBQUM7QUFDRCxTQUFTLHNCQUFzQixDQUFDLElBQWtCO0lBQ2pELE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLHdDQUFnQyxDQUFDLDRDQUFvQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3BHLENBQUM7QUFDRCxTQUFTLHNCQUFzQixDQUFDLElBQWtCLEVBQUUsS0FBYztJQUNqRSxJQUFJLENBQUMsUUFBUSxHQUFHLENBQ2YsQ0FBQyxJQUFJLENBQUMsUUFBUSxpREFBdUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDJDQUFtQyxDQUFDLENBQzdHLENBQUM7QUFDSCxDQUFDO0FBQ0QsU0FBUyxzQkFBc0IsQ0FBQyxJQUFrQjtJQUNqRCxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxrQ0FBeUIsQ0FBQyxxQ0FBNkIsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN0RixDQUFDO0FBQ0QsU0FBUyxzQkFBc0IsQ0FBQyxJQUFrQixFQUFFLEtBQWM7SUFDakUsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUNmLENBQUMsSUFBSSxDQUFDLFFBQVEsMENBQWdDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxvQ0FBNEIsQ0FBQyxDQUMvRixDQUFDO0FBQ0gsQ0FBQztBQUNELFNBQVMsa0JBQWtCLENBQUMsSUFBa0I7SUFDN0MsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsc0NBQTRCLENBQUMsd0NBQWdDLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDNUYsQ0FBQztBQUNELFNBQVMsa0JBQWtCLENBQUMsSUFBa0IsRUFBRSxLQUFjO0lBQzdELElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FDZixDQUFDLElBQUksQ0FBQyxRQUFRLDZDQUFtQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsdUNBQStCLENBQUMsQ0FDckcsQ0FBQztBQUNILENBQUM7QUFDRCxTQUFTLGlCQUFpQixDQUFDLElBQWtCO0lBQzVDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLG9DQUEyQixDQUFDLHVDQUErQixDQUFDLENBQUM7QUFDcEYsQ0FBQztBQUNELFNBQVMsa0JBQWtCLENBQUMsSUFBa0IsRUFBRSxVQUFrQztJQUNqRixJQUFJLENBQUMsUUFBUSxHQUFHLENBQ2YsQ0FBQyxJQUFJLENBQUMsUUFBUSw0Q0FBa0MsQ0FBQyxHQUFHLENBQUMsVUFBVSxzQ0FBOEIsQ0FBQyxDQUM5RixDQUFDO0FBQ0gsQ0FBQztBQUNELFNBQVMsd0JBQXdCLENBQUMsSUFBa0I7SUFDbkQsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsK0NBQXNDLENBQUMsa0RBQTBDLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDaEgsQ0FBQztBQUNELFNBQVMsd0JBQXdCLENBQUMsSUFBa0IsRUFBRSxLQUFjO0lBQ25FLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FDZixDQUFDLElBQUksQ0FBQyxRQUFRLHVEQUE2QyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsaURBQXlDLENBQUMsQ0FDekgsQ0FBQztBQUNILENBQUM7QUFDRCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsSUFBa0IsRUFBRSxVQUF3QztJQUM3RixrQkFBa0IsQ0FBQyxJQUFJLEVBQVUsVUFBVSxDQUFDLENBQUM7QUFDOUMsQ0FBQztBQUVELE1BQU0sT0FBTyxZQUFZO0lBeUJ4QixZQUFZLEVBQVUsRUFBRSxLQUFhLEVBQUUsR0FBVztRQUNqRCxJQUFJLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUVsQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztRQUNuQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixZQUFZLENBQUMsSUFBSSx3QkFBZ0IsQ0FBQztRQUVsQyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLDhDQUE4QztRQUM5QyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO1FBRWxCLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQ2IsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDakIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFLLENBQUM7UUFDckIsc0JBQXNCLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLHNCQUFzQixDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwQyxrQkFBa0IsQ0FBQyxJQUFJLDZEQUFxRCxDQUFDO1FBQzdFLHdCQUF3QixDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0QyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFaEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDekIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsR0FBRyxDQUFDO1FBQzdCLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBRWxCLGdCQUFnQixDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRU0sS0FBSyxDQUFDLFNBQWlCLEVBQUUsS0FBYSxFQUFFLEdBQVcsRUFBRSxLQUFZO1FBQ3ZFLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUM7UUFDbEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUM7UUFDakMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsR0FBRyxDQUFDO1FBQzdCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ3BCLENBQUM7SUFFTSxVQUFVLENBQUMsT0FBK0I7UUFDaEQsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDekMsc0JBQXNCLENBQUMsSUFBSSxFQUFFLENBQzVCLFNBQVMsMkRBQW9DO2VBQzFDLFNBQVMsK0RBQXNDO2VBQy9DLFNBQVMseURBQW1DLENBQy9DLENBQUMsQ0FBQztRQUNILHNCQUFzQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQixLQUFLLElBQUksQ0FBQyxDQUFDO1FBQ3pFLGtCQUFrQixDQUFDLElBQUksRUFBVSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzFELHdCQUF3QixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDbkUsa0JBQWtCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTSxnQkFBZ0IsQ0FBQyxhQUFxQixFQUFFLFdBQW1CLEVBQUUsZUFBdUI7UUFDMUYsSUFBSSxJQUFJLENBQUMsZUFBZSxLQUFLLGVBQWUsRUFBRSxDQUFDO1lBQzlDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ25CLENBQUM7UUFDRCxJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztRQUN2QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsYUFBYSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxXQUFXLENBQUM7SUFDdEMsQ0FBQztJQUVNLE1BQU07UUFDWixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUssQ0FBQztRQUNwQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUssQ0FBQztRQUNsQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUssQ0FBQztJQUNwQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLENBQUMsTUFBTSxRQUFRLEdBQWlCLElBQUksWUFBWSxDQUFDLElBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDcEUsUUFBUSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUM7QUFDM0IsUUFBUSxDQUFDLElBQUksR0FBRyxRQUFRLENBQUM7QUFDekIsUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7QUFDMUIsWUFBWSxDQUFDLFFBQVEsMEJBQWtCLENBQUM7QUFFeEMsTUFBTSxPQUFPLFlBQVk7SUFLeEI7UUFDQyxJQUFJLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztRQUNyQixJQUFJLENBQUMscUJBQXFCLEdBQUcsS0FBSyxDQUFDO0lBQ3BDLENBQUM7SUFFTSxjQUFjLENBQUMsS0FBYSxFQUFFLEdBQVcsRUFBRSxhQUFxQixFQUFFLG1CQUE0QixFQUFFLHFCQUE4QixFQUFFLGVBQXVCLEVBQUUscUJBQThCO1FBQzdMLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1QixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFDRCxPQUFPLGNBQWMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsbUJBQW1CLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixDQUFDLENBQUM7SUFDNUksQ0FBQztJQUVNLE1BQU0sQ0FBQyxhQUFxQixFQUFFLG1CQUE0QixFQUFFLHFCQUE4QixFQUFFLGVBQXVCLEVBQUUscUJBQThCO1FBQ3pKLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1QixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO0lBQ3hILENBQUM7SUFFRDs7T0FFRztJQUNJLHFCQUFxQixDQUFDLE9BQWU7UUFDM0MsT0FBTyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVEOztPQUVHO0lBQ0kscUJBQXFCO1FBQzNCLE9BQU8scUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVNLE1BQU0sQ0FBQyxJQUFrQjtRQUMvQixZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFTSxNQUFNLENBQUMsSUFBa0I7UUFDL0IsWUFBWSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6QixJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRU0sV0FBVyxDQUFDLElBQWtCLEVBQUUsZUFBdUI7UUFDN0QsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE9BQU8sSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMzQixJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNoQyxLQUFLLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDNUIsQ0FBQztZQUNELElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ3BCLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUM1QyxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQztRQUN4QyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRU0sYUFBYSxDQUFDLE1BQWMsRUFBRSxNQUFjLEVBQUUsVUFBa0IsRUFBRSxnQkFBeUI7UUFDakcsNkZBQTZGO1FBRTdGLDZFQUE2RTtRQUM3RSxNQUFNLGVBQWUsR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQztRQUV4RSx1REFBdUQ7UUFDdkQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzVELE1BQU0sSUFBSSxHQUFHLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQyxZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFCLENBQUM7UUFDRCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUVsQyx1REFBdUQ7UUFDdkQsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEdBQUcsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzVELElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1FBRWxDLGtFQUFrRTtRQUNsRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDNUQsTUFBTSxJQUFJLEdBQUcsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDO1lBQ3RDLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDO1lBQ2xDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzlFLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUN2QixZQUFZLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFCLENBQUM7UUFDRCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRU0sYUFBYTtRQUNuQixPQUFPLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFTywwQkFBMEI7UUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ2pDLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLHFCQUFxQixHQUFHLEtBQUssQ0FBQztRQUNuQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEIsQ0FBQztDQUNEO0FBRUQsNkJBQTZCO0FBQzdCLFNBQVMsY0FBYyxDQUFDLENBQWU7SUFDdEMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNsQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUUxQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDNUQsVUFBVTtZQUNWLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2pCLFNBQVM7UUFDVixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlELFdBQVc7WUFDWCxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNwQixJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNsQixTQUFTO1FBQ1YsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxHQUFHLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDNUIsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZixlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFdEIsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTdCLDBCQUEwQjtRQUMxQixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25DLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNoQyxLQUFLLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDNUIsQ0FBQztRQUNELElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFDRCxZQUFZO0FBRVosaUJBQWlCO0FBRWpCLElBQVcsbUJBSVY7QUFKRCxXQUFXLG1CQUFtQjtJQUM3QiwrRUFBaUIsQ0FBQTtJQUNqQix1RUFBYSxDQUFBO0lBQ2IsdUVBQWEsQ0FBQTtBQUNkLENBQUMsRUFKVSxtQkFBbUIsS0FBbkIsbUJBQW1CLFFBSTdCO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxZQUFvQixFQUFFLDhCQUF1QyxFQUFFLFdBQW1CLEVBQUUsYUFBa0M7SUFDdkosSUFBSSxZQUFZLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDaEMsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ0QsSUFBSSxZQUFZLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDaEMsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxhQUFhLDBDQUFrQyxFQUFFLENBQUM7UUFDckQsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxhQUFhLDBDQUFrQyxFQUFFLENBQUM7UUFDckQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ0QsT0FBTyw4QkFBOEIsQ0FBQztBQUN2QyxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGNBQWMsQ0FBQyxJQUFrQixFQUFFLEtBQWEsRUFBRSxHQUFXLEVBQUUsVUFBa0IsRUFBRSxnQkFBeUI7SUFDM0gsTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDL0MsTUFBTSw2QkFBNkIsR0FBRyxDQUNyQyxjQUFjLGdFQUF3RDtXQUNuRSxjQUFjLDZEQUFxRCxDQUN0RSxDQUFDO0lBQ0YsTUFBTSwyQkFBMkIsR0FBRyxDQUNuQyxjQUFjLCtEQUF1RDtXQUNsRSxjQUFjLDZEQUFxRCxDQUN0RSxDQUFDO0lBRUYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDbEMsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDO0lBQ2hDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBRXpELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7SUFDN0IsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO0lBRXRCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDekIsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBRXBCLElBQUksS0FBSyxJQUFJLFNBQVMsSUFBSSxPQUFPLElBQUksR0FBRyxJQUFJLHdCQUF3QixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDNUUsb0RBQW9EO1FBQ3BELG1EQUFtRDtRQUNuRCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLE9BQU8sR0FBRyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELENBQUM7UUFDQSxNQUFNLGFBQWEsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLHVDQUErQixDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUMsdUNBQStCLENBQUMsMENBQWtDLENBQUMsQ0FBQztRQUMvSixJQUFJLENBQUMsU0FBUyxJQUFJLHdCQUF3QixDQUFDLFNBQVMsRUFBRSw2QkFBNkIsRUFBRSxLQUFLLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUM1RyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxJQUFJLHdCQUF3QixDQUFDLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxLQUFLLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUN0RyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxZQUFZLEdBQUcsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUMzQyxNQUFNLGFBQWEsR0FBRyxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUMsQ0FBQyx1Q0FBK0IsQ0FBQywwQ0FBa0MsQ0FBQyxDQUFDO1FBQ3ZILElBQUksQ0FBQyxTQUFTLElBQUksd0JBQXdCLENBQUMsU0FBUyxFQUFFLDZCQUE2QixFQUFFLEtBQUssR0FBRyxZQUFZLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUMzSCxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxJQUFJLHdCQUF3QixDQUFDLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxLQUFLLEdBQUcsWUFBWSxFQUFFLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDckgsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNoQixDQUFDO0lBQ0YsQ0FBQztJQUVELENBQUM7UUFDQSxNQUFNLGFBQWEsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLHVDQUErQixDQUFDLDBDQUFrQyxDQUFDO1FBQzNHLElBQUksQ0FBQyxTQUFTLElBQUksd0JBQXdCLENBQUMsU0FBUyxFQUFFLDZCQUE2QixFQUFFLEdBQUcsRUFBRSxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQzFHLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxHQUFHLFlBQVksQ0FBQztZQUNsQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxJQUFJLHdCQUF3QixDQUFDLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxHQUFHLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUNwRyxJQUFJLENBQUMsR0FBRyxHQUFHLEtBQUssR0FBRyxZQUFZLENBQUM7WUFDaEMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNoQixDQUFDO0lBQ0YsQ0FBQztJQUVELFNBQVM7SUFDVCxNQUFNLFdBQVcsR0FBRyxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUMsQ0FBQztJQUNqRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLEdBQUcsV0FBVyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUNELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsT0FBTyxHQUFHLFdBQVcsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztJQUN2QixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsQ0FBZSxFQUFFLEtBQWEsRUFBRSxHQUFXO0lBQ3BFLDZEQUE2RDtJQUM3RCxxRUFBcUU7SUFDckUsb0VBQW9FO0lBQ3BFLHFFQUFxRTtJQUNyRSw2RkFBNkY7SUFDN0YsNEZBQTRGO0lBQzVGLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDbEIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ2QsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0lBQ25CLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNsQixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7SUFDaEIsTUFBTSxNQUFNLEdBQW1CLEVBQUUsQ0FBQztJQUNsQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDbEIsT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDMUIsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzVCLDBCQUEwQjtZQUMxQixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25DLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEMsSUFBSSxJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDaEMsS0FBSyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1lBQzVCLENBQUM7WUFDRCxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztZQUNuQixTQUFTO1FBQ1YsQ0FBQztRQUVELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNsQyw4QkFBOEI7WUFDOUIsVUFBVSxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQ2pDLElBQUksVUFBVSxHQUFHLEtBQUssRUFBRSxDQUFDO2dCQUN4QiwyQkFBMkI7Z0JBQzNCLHVEQUF1RDtnQkFDdkQsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUM3QixTQUFTO1lBQ1YsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDNUIsVUFBVTtnQkFDVixJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztnQkFDakIsU0FBUztZQUNWLENBQUM7UUFDRixDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLFNBQVMsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUMvQixJQUFJLFNBQVMsR0FBRyxHQUFHLEVBQUUsQ0FBQztZQUNyQiwyQkFBMkI7WUFDM0IsNERBQTREO1lBQzVELGdCQUFnQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM3QixTQUFTO1FBQ1YsQ0FBQztRQUVELE9BQU8sR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUMzQixJQUFJLE9BQU8sSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDNUIsQ0FBQztRQUNELGdCQUFnQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU3QixJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDOUQsV0FBVztZQUNYLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ3BCLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ2xCLFNBQVM7UUFDVixDQUFDO0lBQ0YsQ0FBQztJQUVELGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFaEMsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxDQUFlLEVBQUUsS0FBYSxFQUFFLEdBQVcsRUFBRSxVQUFrQjtJQUN4Riw2REFBNkQ7SUFDN0QscUVBQXFFO0lBQ3JFLG9FQUFvRTtJQUNwRSxxRUFBcUU7SUFDckUsNkZBQTZGO0lBQzdGLDRGQUE0RjtJQUM1RixJQUFJLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQ2xCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNkLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNuQixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDbEIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUMvQyxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMxQixJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDNUIsMEJBQTBCO1lBQzFCLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNwQyxJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNoQyxLQUFLLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDNUIsQ0FBQztZQUNELGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0QixJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztZQUNuQixTQUFTO1FBQ1YsQ0FBQztRQUVELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNsQyw4QkFBOEI7WUFDOUIsVUFBVSxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQ2pDLElBQUksVUFBVSxHQUFHLEtBQUssRUFBRSxDQUFDO2dCQUN4QiwyQkFBMkI7Z0JBQzNCLHVEQUF1RDtnQkFDdkQsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUM3QixTQUFTO1lBQ1YsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDNUIsVUFBVTtnQkFDVixJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztnQkFDakIsU0FBUztZQUNWLENBQUM7UUFDRixDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLFNBQVMsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUMvQixJQUFJLFNBQVMsR0FBRyxHQUFHLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQztZQUN4QixJQUFJLENBQUMsR0FBRyxJQUFJLFNBQVMsQ0FBQztZQUN0QixJQUFJLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQztZQUN4QixJQUFJLElBQUksQ0FBQyxLQUFLLDZDQUEyQixJQUFJLElBQUksQ0FBQyxLQUFLLDRDQUEyQixFQUFFLENBQUM7Z0JBQ3BGLENBQUMsQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUM7WUFDaEMsQ0FBQztZQUNELDJCQUEyQjtZQUMzQiw0REFBNEQ7WUFDNUQsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzdCLFNBQVM7UUFDVixDQUFDO1FBRUQsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTdCLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM5RCxXQUFXO1lBQ1gsS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDcEIsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDbEIsU0FBUztRQUNWLENBQUM7SUFDRixDQUFDO0lBRUQsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBRUQsWUFBWTtBQUVaLG1CQUFtQjtBQUVuQixTQUFTLHFCQUFxQixDQUFDLENBQWUsRUFBRSxPQUFlO0lBQzlELElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDbEIsTUFBTSxNQUFNLEdBQW1CLEVBQUUsQ0FBQztJQUNsQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDbEIsT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDMUIsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzVCLDBCQUEwQjtZQUMxQixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25DLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEMsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDbkIsU0FBUztRQUNWLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDNUQsVUFBVTtZQUNWLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2pCLFNBQVM7UUFDVixDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUM5QixNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDNUIsQ0FBQztRQUVELGdCQUFnQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU3QixJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDOUQsV0FBVztZQUNYLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ2xCLFNBQVM7UUFDVixDQUFDO0lBQ0YsQ0FBQztJQUVELGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFaEMsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxDQUFlO0lBQzdDLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDbEIsTUFBTSxNQUFNLEdBQW1CLEVBQUUsQ0FBQztJQUNsQyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDbEIsT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDMUIsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzVCLDBCQUEwQjtZQUMxQixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25DLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEMsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDbkIsU0FBUztRQUNWLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDNUQsVUFBVTtZQUNWLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2pCLFNBQVM7UUFDVixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlELFdBQVc7WUFDWCxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNsQixTQUFTO1FBQ1YsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDM0IsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRWhDLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsTUFBTSxDQUFDLENBQWUsRUFBRSxhQUFxQixFQUFFLG1CQUE0QixFQUFFLHFCQUE4QixFQUFFLGVBQXVCLEVBQUUscUJBQThCO0lBQzVLLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDbEIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ2QsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztJQUNoQixNQUFNLE1BQU0sR0FBbUIsRUFBRSxDQUFDO0lBQ2xDLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNsQixPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMxQixJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDNUIsMEJBQTBCO1lBQzFCLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNwQyxJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNoQyxLQUFLLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDNUIsQ0FBQztZQUNELElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQ25CLFNBQVM7UUFDVixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzVELFVBQVU7WUFDVixJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztZQUNqQixTQUFTO1FBQ1YsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixTQUFTLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDL0IsT0FBTyxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO1FBRTNCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRTNELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQztRQUNuQixJQUFJLGFBQWEsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssYUFBYSxFQUFFLENBQUM7WUFDckUsT0FBTyxHQUFHLEtBQUssQ0FBQztRQUNqQixDQUFDO1FBQ0QsSUFBSSxtQkFBbUIsSUFBSSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3pELE9BQU8sR0FBRyxLQUFLLENBQUM7UUFDakIsQ0FBQztRQUNELElBQUkscUJBQXFCLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN2RCxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFDRCxJQUFJLHFCQUFxQixJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM1RCxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFFRCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQzVCLENBQUM7UUFFRCxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFN0IsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlELFdBQVc7WUFDWCxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNwQixJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNsQixTQUFTO1FBQ1YsQ0FBQztJQUNGLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRWhDLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLENBQWUsRUFBRSxhQUFxQixFQUFFLFdBQW1CLEVBQUUsYUFBcUIsRUFBRSxtQkFBNEIsRUFBRSxxQkFBOEIsRUFBRSxlQUF1QixFQUFFLHFCQUE4QjtJQUNoTyw2REFBNkQ7SUFDN0QscUVBQXFFO0lBQ3JFLG9FQUFvRTtJQUNwRSxxRUFBcUU7SUFDckUsNkZBQTZGO0lBQzdGLDRGQUE0RjtJQUU1RixJQUFJLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQ2xCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNkLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNuQixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDbEIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLE1BQU0sTUFBTSxHQUFtQixFQUFFLENBQUM7SUFDbEMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzFCLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM1QiwwQkFBMEI7WUFDMUIsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNuQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3BDLElBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2hDLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUM1QixDQUFDO1lBQ0QsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDbkIsU0FBUztRQUNWLENBQUM7UUFFRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDbEMsOEJBQThCO1lBQzlCLFVBQVUsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztZQUNqQyxJQUFJLFVBQVUsR0FBRyxhQUFhLEVBQUUsQ0FBQztnQkFDaEMsMkJBQTJCO2dCQUMzQix1REFBdUQ7Z0JBQ3ZELGdCQUFnQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDN0IsU0FBUztZQUNWLENBQUM7WUFFRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzVCLFVBQVU7Z0JBQ1YsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLFNBQVM7WUFDVixDQUFDO1FBQ0YsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixTQUFTLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDL0IsSUFBSSxTQUFTLEdBQUcsV0FBVyxFQUFFLENBQUM7WUFDN0IsMkJBQTJCO1lBQzNCLDREQUE0RDtZQUM1RCxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDN0IsU0FBUztRQUNWLENBQUM7UUFFRCxPQUFPLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7UUFFM0IsSUFBSSxPQUFPLElBQUksYUFBYSxFQUFFLENBQUM7WUFDOUIsbUJBQW1CO1lBQ25CLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBRTNELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQztZQUNuQixJQUFJLGFBQWEsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssYUFBYSxFQUFFLENBQUM7Z0JBQ3JFLE9BQU8sR0FBRyxLQUFLLENBQUM7WUFDakIsQ0FBQztZQUNELElBQUksbUJBQW1CLElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDekQsT0FBTyxHQUFHLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBQ0QsSUFBSSxxQkFBcUIsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN2RCxPQUFPLEdBQUcsS0FBSyxDQUFDO1lBQ2pCLENBQUM7WUFDRCxJQUFJLHFCQUFxQixJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDNUQsT0FBTyxHQUFHLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBRUQsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDNUIsQ0FBQztRQUNGLENBQUM7UUFFRCxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFN0IsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlELFdBQVc7WUFDWCxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNwQixJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUNsQixTQUFTO1FBQ1YsQ0FBQztJQUNGLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRWhDLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELFlBQVk7QUFFWixtQkFBbUI7QUFDbkIsU0FBUyxZQUFZLENBQUMsQ0FBZSxFQUFFLE9BQXFCO0lBQzNELElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUN6QixPQUFPLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQztRQUMxQixPQUFPLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztRQUN4QixPQUFPLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQztRQUN6QixZQUFZLENBQUMsT0FBTywwQkFBa0IsQ0FBQztRQUN2QyxDQUFDLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQztRQUNqQixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDZixDQUFDO0lBRUQsVUFBVSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUV2Qix5QkFBeUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFMUMsY0FBYztJQUNkLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQztJQUNoQixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLDBCQUFrQixFQUFFLENBQUM7UUFDakUsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUVoQyxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsMEJBQWtCLEVBQUUsQ0FBQztnQkFDdkMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLDBCQUFrQixDQUFDO2dCQUN4QyxZQUFZLENBQUMsQ0FBQywwQkFBa0IsQ0FBQztnQkFDakMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSx3QkFBZ0IsQ0FBQztnQkFDN0MsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO1lBQ3JCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUMxQixDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztvQkFDYixVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNsQixDQUFDO2dCQUNELFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTSwwQkFBa0IsQ0FBQztnQkFDeEMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSx3QkFBZ0IsQ0FBQztnQkFDN0MsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUUvQixJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsMEJBQWtCLEVBQUUsQ0FBQztnQkFDdkMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLDBCQUFrQixDQUFDO2dCQUN4QyxZQUFZLENBQUMsQ0FBQywwQkFBa0IsQ0FBQztnQkFDakMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSx3QkFBZ0IsQ0FBQztnQkFDN0MsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO1lBQ3JCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUN6QixDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztvQkFDYixXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixDQUFDO2dCQUNELFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTSwwQkFBa0IsQ0FBQztnQkFDeEMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSx3QkFBZ0IsQ0FBQztnQkFDN0MsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSwwQkFBa0IsQ0FBQztJQUV0QyxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsQ0FBZSxFQUFFLENBQWU7SUFDbkQsSUFBSSxLQUFLLEdBQVcsQ0FBQyxDQUFDO0lBQ3RCLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDZixNQUFNLGNBQWMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQy9CLE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDM0IsT0FBTyxJQUFJLEVBQUUsQ0FBQztRQUNiLE1BQU0sR0FBRyxHQUFHLGVBQWUsQ0FBQyxjQUFjLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxFQUFFLENBQUMsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFDMUYsSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDYiwyQ0FBMkM7WUFDM0MsNENBQTRDO1lBQzVDLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDekIsQ0FBQyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUM7Z0JBQ2pCLENBQUMsQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDO2dCQUNmLENBQUMsQ0FBQyxNQUFNLElBQUksS0FBSyxDQUFDO2dCQUNsQixDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztnQkFDWCxNQUFNO1lBQ1AsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ1osQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsNENBQTRDO1lBQzVDLDRDQUE0QztZQUM1QyxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzFCLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM3QixDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDM0IsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzlCLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO2dCQUNaLE1BQU07WUFDUCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsS0FBSyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7Z0JBQ2pCLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDYixDQUFDLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztJQUNsQixDQUFDLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQztJQUNuQixZQUFZLENBQUMsQ0FBQyx3QkFBZ0IsQ0FBQztBQUNoQyxDQUFDO0FBQ0QsWUFBWTtBQUVaLGtCQUFrQjtBQUNsQixTQUFTLFlBQVksQ0FBQyxDQUFlLEVBQUUsQ0FBZTtJQUVyRCxJQUFJLENBQWUsQ0FBQztJQUNwQixJQUFJLENBQWUsQ0FBQztJQUVwQixvREFBb0Q7SUFDcEQsZ0RBQWdEO0lBRWhELElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUN6QixDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUNaLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFTixpREFBaUQ7UUFDakQsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxDQUFDLEtBQUssNkNBQTJCLElBQUksQ0FBQyxDQUFDLEtBQUssNENBQTJCLEVBQUUsQ0FBQztZQUM5RSxDQUFDLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLENBQUM7UUFDRCxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDbkIsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDO0lBRWxCLENBQUM7U0FBTSxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDakMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDWCxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRVAsQ0FBQztTQUFNLENBQUM7UUFDUCxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUVaLGtEQUFrRDtRQUNsRCxxRUFBcUU7UUFDckUsMERBQTBEO1FBQzFELENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUNuQixDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDakIsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxDQUFDLEtBQUssNkNBQTJCLElBQUksQ0FBQyxDQUFDLEtBQUssNENBQTJCLEVBQUUsQ0FBQztZQUM5RSxDQUFDLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDbkIsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUNsQixJQUFJLENBQUMsQ0FBQyxLQUFLLDZDQUEyQixJQUFJLENBQUMsQ0FBQyxLQUFLLDRDQUEyQixFQUFFLENBQUM7WUFDOUUsQ0FBQyxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQixDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUNYLFlBQVksQ0FBQyxDQUFDLDBCQUFrQixDQUFDO1FBRWpDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNYLGFBQWEsRUFBRSxDQUFDO1FBQ2hCLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuQixDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUM7UUFDekIsT0FBTztJQUNSLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsMEJBQWtCLENBQUMsQ0FBQztJQUVwRCxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3pCLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNuQixDQUFDO1NBQU0sQ0FBQztRQUNQLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDYixDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztTQUFNLENBQUM7UUFFUCxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDcEIsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDZCxDQUFDO2FBQU0sQ0FBQztZQUNQLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNyQixDQUFDO1FBRUQsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUNsQixDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDcEIsWUFBWSxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVqQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbEIsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDWixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3pCLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUNuQixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ3BCLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3pCLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNuQixDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzFCLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNwQixDQUFDO0lBQ0YsQ0FBQztJQUVELENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUVYLElBQUksT0FBTyxFQUFFLENBQUM7UUFDYix5QkFBeUIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDYix5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3Qix5QkFBeUIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckMsQ0FBQztRQUNELGFBQWEsRUFBRSxDQUFDO1FBQ2hCLE9BQU87SUFDUixDQUFDO0lBRUQseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0IseUJBQXlCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3BDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ2IseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0IseUJBQXlCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxrQkFBa0I7SUFDbEIsSUFBSSxDQUFlLENBQUM7SUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLDRCQUFvQixFQUFFLENBQUM7UUFFNUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN6QixDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFFbkIsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLDBCQUFrQixFQUFFLENBQUM7Z0JBQ3ZDLFlBQVksQ0FBQyxDQUFDLDBCQUFrQixDQUFDO2dCQUNqQyxZQUFZLENBQUMsQ0FBQyxDQUFDLE1BQU0sd0JBQWdCLENBQUM7Z0JBQ3RDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN4QixDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDcEIsQ0FBQztZQUVELElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsNEJBQW9CLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsNEJBQW9CLEVBQUUsQ0FBQztnQkFDM0YsWUFBWSxDQUFDLENBQUMsd0JBQWdCLENBQUM7Z0JBQy9CLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ2QsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsNEJBQW9CLEVBQUUsQ0FBQztvQkFDL0MsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLDBCQUFrQixDQUFDO29CQUN0QyxZQUFZLENBQUMsQ0FBQyx3QkFBZ0IsQ0FBQztvQkFDL0IsV0FBVyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDbEIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNwQixDQUFDO2dCQUVELFlBQVksQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxZQUFZLENBQUMsQ0FBQyxDQUFDLE1BQU0sMEJBQWtCLENBQUM7Z0JBQ3hDLFlBQVksQ0FBQyxDQUFDLENBQUMsS0FBSywwQkFBa0IsQ0FBQztnQkFDdkMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3hCLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ1osQ0FBQztRQUVGLENBQUM7YUFBTSxDQUFDO1lBQ1AsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBRWxCLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQywwQkFBa0IsRUFBRSxDQUFDO2dCQUN2QyxZQUFZLENBQUMsQ0FBQywwQkFBa0IsQ0FBQztnQkFDakMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLHdCQUFnQixDQUFDO2dCQUN0QyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDekIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ25CLENBQUM7WUFFRCxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLDRCQUFvQixJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLDRCQUFvQixFQUFFLENBQUM7Z0JBQzNGLFlBQVksQ0FBQyxDQUFDLHdCQUFnQixDQUFDO2dCQUMvQixDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUVkLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLDRCQUFvQixFQUFFLENBQUM7b0JBQzlDLFlBQVksQ0FBQyxDQUFDLENBQUMsS0FBSywwQkFBa0IsQ0FBQztvQkFDdkMsWUFBWSxDQUFDLENBQUMsd0JBQWdCLENBQUM7b0JBQy9CLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ2pCLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDbkIsQ0FBQztnQkFFRCxZQUFZLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDeEMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLDBCQUFrQixDQUFDO2dCQUN4QyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksMEJBQWtCLENBQUM7Z0JBQ3RDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN6QixDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNaLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQVksQ0FBQyxDQUFDLDBCQUFrQixDQUFDO0lBQ2pDLGFBQWEsRUFBRSxDQUFDO0FBQ2pCLENBQUM7QUFFRCxTQUFTLE9BQU8sQ0FBQyxJQUFrQjtJQUNsQyxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDL0IsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7SUFDbEIsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsYUFBYTtJQUNyQixRQUFRLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQztJQUMzQixRQUFRLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVc7SUFDL0IsUUFBUSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxXQUFXO0lBQy9CLFFBQVEsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsV0FBVztBQUM5QixDQUFDO0FBQ0QsWUFBWTtBQUVaLG1CQUFtQjtBQUNuQixTQUFTLFVBQVUsQ0FBQyxDQUFlLEVBQUUsQ0FBZTtJQUNuRCxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUksU0FBUztJQUUvQixDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBSSxpREFBaUQ7SUFDeEUsSUFBSSxDQUFDLENBQUMsS0FBSyw2Q0FBMkIsSUFBSSxDQUFDLENBQUMsS0FBSyw0Q0FBMkIsRUFBRSxDQUFDO1FBQzlFLENBQUMsQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUM7SUFDaEMsQ0FBQztJQUNELENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFFakIsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUksZ0RBQWdEO0lBQ3JFLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUN6QixDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDbkIsQ0FBQztJQUNELENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFHLHdCQUF3QjtJQUMvQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDM0IsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7SUFDWixDQUFDO1NBQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNoQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7SUFDbkIsQ0FBQztTQUFNLENBQUM7UUFDUCxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDcEIsQ0FBQztJQUVELENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQU0scUJBQXFCO0lBQ3RDLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBRWIsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25CLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQixDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsQ0FBZSxFQUFFLENBQWU7SUFDcEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUVqQixDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDbkIsSUFBSSxDQUFDLENBQUMsS0FBSyw2Q0FBMkIsSUFBSSxDQUFDLENBQUMsS0FBSyw0Q0FBMkIsRUFBRSxDQUFDO1FBQzlFLENBQUMsQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUM7SUFDaEMsQ0FBQztJQUNELENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFFakIsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQ2pCLElBQUksQ0FBQyxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMxQixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDcEIsQ0FBQztJQUNELENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUNwQixJQUFJLENBQUMsQ0FBQyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDM0IsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7SUFDWixDQUFDO1NBQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNqQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDcEIsQ0FBQztTQUFNLENBQUM7UUFDUCxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7SUFDbkIsQ0FBQztJQUVELENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ1osQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFFYixlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkIsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BCLENBQUM7QUFDRCxZQUFZO0FBRVosNkJBQTZCO0FBRTdCLFNBQVMsYUFBYSxDQUFDLElBQWtCO0lBQ3hDLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDdEIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ3BDLElBQUksVUFBVSxHQUFHLE1BQU0sRUFBRSxDQUFDO1lBQ3pCLE1BQU0sR0FBRyxVQUFVLENBQUM7UUFDckIsQ0FBQztJQUNGLENBQUM7SUFDRCxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDN0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUNuRCxJQUFJLFdBQVcsR0FBRyxNQUFNLEVBQUUsQ0FBQztZQUMxQixNQUFNLEdBQUcsV0FBVyxDQUFDO1FBQ3RCLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxVQUFVLGVBQWUsQ0FBQyxJQUFrQjtJQUNqRCxJQUFJLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQsU0FBUyx5QkFBeUIsQ0FBQyxJQUFrQjtJQUNwRCxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUUxQixNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbkMsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzVCLHdCQUF3QjtZQUN4QixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7QUFDRixDQUFDO0FBRUQsWUFBWTtBQUVaLGVBQWU7QUFDZixNQUFNLFVBQVUsZUFBZSxDQUFDLE1BQWMsRUFBRSxJQUFZLEVBQUUsTUFBYyxFQUFFLElBQVk7SUFDekYsSUFBSSxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDdkIsT0FBTyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ3BCLENBQUM7SUFDRCxPQUFPLE1BQU0sR0FBRyxNQUFNLENBQUM7QUFDeEIsQ0FBQztBQUNELFlBQVkifQ==