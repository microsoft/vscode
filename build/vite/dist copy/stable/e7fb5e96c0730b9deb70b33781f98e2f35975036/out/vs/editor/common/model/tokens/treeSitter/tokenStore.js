/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Exported for tests
export class ListNode {
    get children() { return this._children; }
    get length() { return this._length; }
    constructor(height) {
        this.height = height;
        this._children = [];
        this._length = 0;
    }
    static create(node1, node2) {
        const list = new ListNode(node1.height + 1);
        list.appendChild(node1);
        list.appendChild(node2);
        return list;
    }
    canAppendChild() {
        return this._children.length < 3;
    }
    appendChild(node) {
        if (!this.canAppendChild()) {
            throw new Error('Cannot insert more than 3 children in a ListNode');
        }
        this._children.push(node);
        this._length += node.length;
        this._updateParentLength(node.length);
        if (!isLeaf(node)) {
            node.parent = this;
        }
    }
    _updateParentLength(delta) {
        let updateParent = this.parent;
        while (updateParent) {
            updateParent._length += delta;
            updateParent = updateParent.parent;
        }
    }
    unappendChild() {
        const child = this._children.pop();
        this._length -= child.length;
        this._updateParentLength(-child.length);
        return child;
    }
    prependChild(node) {
        if (this._children.length >= 3) {
            throw new Error('Cannot prepend more than 3 children in a ListNode');
        }
        this._children.unshift(node);
        this._length += node.length;
        this._updateParentLength(node.length);
        if (!isLeaf(node)) {
            node.parent = this;
        }
    }
    unprependChild() {
        const child = this._children.shift();
        this._length -= child.length;
        this._updateParentLength(-child.length);
        return child;
    }
    lastChild() {
        return this._children[this._children.length - 1];
    }
    dispose() {
        this._children.splice(0, this._children.length);
    }
}
export var TokenQuality;
(function (TokenQuality) {
    TokenQuality[TokenQuality["None"] = 0] = "None";
    TokenQuality[TokenQuality["ViewportGuess"] = 1] = "ViewportGuess";
    TokenQuality[TokenQuality["EditGuess"] = 2] = "EditGuess";
    TokenQuality[TokenQuality["Accurate"] = 3] = "Accurate";
})(TokenQuality || (TokenQuality = {}));
function isLeaf(node) {
    return node.token !== undefined;
}
// Heavily inspired by https://github.com/microsoft/vscode/blob/4eb2658d592cb6114a7a393655574176cc790c5b/src/vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/concat23Trees.ts#L108-L109
function append(node, nodeToAppend) {
    let curNode = node;
    const parents = [];
    let nodeToAppendOfCorrectHeight;
    while (true) {
        if (nodeToAppend.height === curNode.height) {
            nodeToAppendOfCorrectHeight = nodeToAppend;
            break;
        }
        if (isLeaf(curNode)) {
            throw new Error('unexpected');
        }
        parents.push(curNode);
        curNode = curNode.lastChild();
    }
    for (let i = parents.length - 1; i >= 0; i--) {
        const parent = parents[i];
        if (nodeToAppendOfCorrectHeight) {
            // Can we take the element?
            if (parent.children.length >= 3) {
                // we need to split to maintain (2,3)-tree property.
                // Send the third element + the new element to the parent.
                const newList = ListNode.create(parent.unappendChild(), nodeToAppendOfCorrectHeight);
                nodeToAppendOfCorrectHeight = newList;
            }
            else {
                parent.appendChild(nodeToAppendOfCorrectHeight);
                nodeToAppendOfCorrectHeight = undefined;
            }
        }
    }
    if (nodeToAppendOfCorrectHeight) {
        const newList = new ListNode(nodeToAppendOfCorrectHeight.height + 1);
        newList.appendChild(node);
        newList.appendChild(nodeToAppendOfCorrectHeight);
        return newList;
    }
    else {
        return node;
    }
}
function prepend(list, nodeToAppend) {
    let curNode = list;
    const parents = [];
    while (nodeToAppend.height !== curNode.height) {
        if (isLeaf(curNode)) {
            throw new Error('unexpected');
        }
        parents.push(curNode);
        // assert 2 <= curNode.childrenFast.length <= 3
        curNode = curNode.children[0];
    }
    let nodeToPrependOfCorrectHeight = nodeToAppend;
    // assert nodeToAppendOfCorrectHeight!.listHeight === curNode.listHeight
    for (let i = parents.length - 1; i >= 0; i--) {
        const parent = parents[i];
        if (nodeToPrependOfCorrectHeight) {
            // Can we take the element?
            if (parent.children.length >= 3) {
                // we need to split to maintain (2,3)-tree property.
                // Send the third element + the new element to the parent.
                nodeToPrependOfCorrectHeight = ListNode.create(nodeToPrependOfCorrectHeight, parent.unprependChild());
            }
            else {
                parent.prependChild(nodeToPrependOfCorrectHeight);
                nodeToPrependOfCorrectHeight = undefined;
            }
        }
    }
    if (nodeToPrependOfCorrectHeight) {
        return ListNode.create(nodeToPrependOfCorrectHeight, list);
    }
    else {
        return list;
    }
}
function concat(node1, node2) {
    if (node1.height === node2.height) {
        return ListNode.create(node1, node2);
    }
    else if (node1.height > node2.height) {
        // node1 is the tree we want to insert into
        return append(node1, node2);
    }
    else {
        return prepend(node2, node1);
    }
}
export class TokenStore {
    get root() {
        return this._root;
    }
    constructor(_textModel) {
        this._textModel = _textModel;
        this._root = this.createEmptyRoot();
    }
    createEmptyRoot() {
        return {
            length: this._textModel.getValueLength(),
            token: 0,
            height: 0,
            tokenQuality: TokenQuality.None
        };
    }
    /**
     *
     * @param update all the tokens for the document in sequence
     */
    buildStore(tokens, tokenQuality) {
        this._root = this.createFromUpdates(tokens, tokenQuality);
    }
    createFromUpdates(tokens, tokenQuality) {
        if (tokens.length === 0) {
            return this.createEmptyRoot();
        }
        let newRoot = {
            length: tokens[0].length,
            token: tokens[0].token,
            height: 0,
            tokenQuality
        };
        for (let j = 1; j < tokens.length; j++) {
            newRoot = append(newRoot, { length: tokens[j].length, token: tokens[j].token, height: 0, tokenQuality });
        }
        return newRoot;
    }
    /**
     *
     * @param tokens tokens are in sequence in the document.
     */
    update(length, tokens, tokenQuality) {
        if (tokens.length === 0) {
            return;
        }
        this.replace(length, tokens[0].startOffsetInclusive, tokens, tokenQuality);
    }
    delete(length, startOffset) {
        this.replace(length, startOffset, [], TokenQuality.EditGuess);
    }
    /**
     *
     * @param tokens tokens are in sequence in the document.
     */
    replace(length, updateOffsetStart, tokens, tokenQuality) {
        const firstUnchangedOffsetAfterUpdate = updateOffsetStart + length;
        // Find the last unchanged node preceding the update
        const precedingNodes = [];
        // Find the first unchanged node after the update
        const postcedingNodes = [];
        const stack = [{ node: this._root, offset: 0 }];
        while (stack.length > 0) {
            const node = stack.pop();
            const currentOffset = node.offset;
            if (currentOffset < updateOffsetStart && currentOffset + node.node.length <= updateOffsetStart) {
                if (!isLeaf(node.node)) {
                    node.node.parent = undefined;
                }
                precedingNodes.push(node.node);
                continue;
            }
            else if (isLeaf(node.node) && (currentOffset < updateOffsetStart)) {
                // We have a partial preceding node
                precedingNodes.push({ length: updateOffsetStart - currentOffset, token: node.node.token, height: 0, tokenQuality: node.node.tokenQuality });
                // Node could also be postceeding, so don't continue
            }
            if ((updateOffsetStart <= currentOffset) && (currentOffset + node.node.length <= firstUnchangedOffsetAfterUpdate)) {
                continue;
            }
            if (currentOffset >= firstUnchangedOffsetAfterUpdate) {
                if (!isLeaf(node.node)) {
                    node.node.parent = undefined;
                }
                postcedingNodes.push(node.node);
                continue;
            }
            else if (isLeaf(node.node) && (currentOffset + node.node.length > firstUnchangedOffsetAfterUpdate)) {
                // we have a partial postceeding node
                postcedingNodes.push({ length: currentOffset + node.node.length - firstUnchangedOffsetAfterUpdate, token: node.node.token, height: 0, tokenQuality: node.node.tokenQuality });
                continue;
            }
            if (!isLeaf(node.node)) {
                // Push children in reverse order to process them left-to-right when popping
                let childOffset = currentOffset + node.node.length;
                for (let i = node.node.children.length - 1; i >= 0; i--) {
                    childOffset -= node.node.children[i].length;
                    stack.push({ node: node.node.children[i], offset: childOffset });
                }
            }
        }
        let allNodes;
        if (tokens.length > 0) {
            allNodes = precedingNodes.concat(this.createFromUpdates(tokens, tokenQuality), postcedingNodes);
        }
        else {
            allNodes = precedingNodes.concat(postcedingNodes);
        }
        let newRoot = allNodes[0];
        for (let i = 1; i < allNodes.length; i++) {
            newRoot = concat(newRoot, allNodes[i]);
        }
        this._root = newRoot ?? this.createEmptyRoot();
    }
    /**
     *
     * @param startOffsetInclusive
     * @param endOffsetExclusive
     * @param visitor Return true from visitor to exit early
     * @returns
     */
    traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, visitor) {
        const stack = [{ node: this._root, offset: 0 }];
        while (stack.length > 0) {
            const { node, offset } = stack.pop();
            const nodeEnd = offset + node.length;
            // Skip nodes that are completely before or after the range
            if (nodeEnd <= startOffsetInclusive || offset >= endOffsetExclusive) {
                continue;
            }
            if (visitor(node, offset)) {
                return;
            }
            if (!isLeaf(node)) {
                // Push children in reverse order to process them left-to-right when popping
                let childOffset = offset + node.length;
                for (let i = node.children.length - 1; i >= 0; i--) {
                    childOffset -= node.children[i].length;
                    stack.push({ node: node.children[i], offset: childOffset });
                }
            }
        }
    }
    getTokenAt(offset) {
        let result;
        this.traverseInOrderInRange(offset, this._root.length, (node, offset) => {
            if (isLeaf(node)) {
                result = { token: node.token, startOffsetInclusive: offset, length: node.length };
                return true;
            }
            return false;
        });
        return result;
    }
    getTokensInRange(startOffsetInclusive, endOffsetExclusive) {
        const result = [];
        this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node, offset) => {
            if (isLeaf(node)) {
                let clippedLength = node.length;
                let clippedOffset = offset;
                if ((offset < startOffsetInclusive) && (offset + node.length > endOffsetExclusive)) {
                    clippedOffset = startOffsetInclusive;
                    clippedLength = endOffsetExclusive - startOffsetInclusive;
                }
                else if (offset < startOffsetInclusive) {
                    clippedLength -= (startOffsetInclusive - offset);
                    clippedOffset = startOffsetInclusive;
                }
                else if (offset + node.length > endOffsetExclusive) {
                    clippedLength -= (offset + node.length - endOffsetExclusive);
                }
                result.push({ token: node.token, startOffsetInclusive: clippedOffset, length: clippedLength });
            }
            return false;
        });
        return result;
    }
    markForRefresh(startOffsetInclusive, endOffsetExclusive) {
        this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node) => {
            if (isLeaf(node)) {
                node.tokenQuality = TokenQuality.None;
            }
            return false;
        });
    }
    rangeHasTokens(startOffsetInclusive, endOffsetExclusive, minimumTokenQuality) {
        let hasAny = true;
        this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node) => {
            if (isLeaf(node) && (node.tokenQuality < minimumTokenQuality)) {
                hasAny = false;
            }
            return false;
        });
        return hasAny;
    }
    rangeNeedsRefresh(startOffsetInclusive, endOffsetExclusive) {
        let needsRefresh = false;
        this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node) => {
            if (isLeaf(node) && (node.tokenQuality !== TokenQuality.Accurate)) {
                needsRefresh = true;
            }
            return false;
        });
        return needsRefresh;
    }
    getNeedsRefresh() {
        const result = [];
        this.traverseInOrderInRange(0, this._textModel.getValueLength(), (node, offset) => {
            if (isLeaf(node) && (node.tokenQuality !== TokenQuality.Accurate)) {
                if ((result.length > 0) && (result[result.length - 1].endOffset === offset)) {
                    result[result.length - 1].endOffset += node.length;
                }
                else {
                    result.push({ startOffset: offset, endOffset: offset + node.length });
                }
            }
            return false;
        });
        return result;
    }
    deepCopy() {
        const newStore = new TokenStore(this._textModel);
        newStore._root = this._copyNodeIterative(this._root);
        return newStore;
    }
    _copyNodeIterative(root) {
        const newRoot = isLeaf(root)
            ? { length: root.length, token: root.token, tokenQuality: root.tokenQuality, height: root.height }
            : new ListNode(root.height);
        const stack = [[root, newRoot]];
        while (stack.length > 0) {
            const [oldNode, clonedNode] = stack.pop();
            if (!isLeaf(oldNode)) {
                for (const child of oldNode.children) {
                    const childCopy = isLeaf(child)
                        ? { length: child.length, token: child.token, tokenQuality: child.tokenQuality, height: child.height }
                        : new ListNode(child.height);
                    clonedNode.appendChild(childCopy);
                    stack.push([child, childCopy]);
                }
            }
        }
        return newRoot;
    }
    /**
     * Returns a string representation of the token tree using an iterative approach
     */
    printTree(root = this._root) {
        const result = [];
        const stack = [[root, 0]];
        while (stack.length > 0) {
            const [node, depth] = stack.pop();
            const indent = '  '.repeat(depth);
            if (isLeaf(node)) {
                result.push(`${indent}Leaf(length: ${node.length}, token: ${node.token}, refresh: ${node.tokenQuality})\n`);
            }
            else {
                result.push(`${indent}List(length: ${node.length})\n`);
                // Push children in reverse order so they get processed left-to-right
                for (let i = node.children.length - 1; i >= 0; i--) {
                    stack.push([node.children[i], depth + 1]);
                }
            }
        }
        return result.join('');
    }
    dispose() {
        const stack = [[this._root, false]];
        while (stack.length > 0) {
            const [node, visited] = stack.pop();
            if (isLeaf(node)) {
                // leaf node does not need to be disposed
            }
            else if (!visited) {
                stack.push([node, true]);
                for (let i = node.children.length - 1; i >= 0; i--) {
                    stack.push([node.children[i], false]);
                }
            }
            else {
                node.dispose();
                node.parent = undefined;
            }
        }
        this._root = undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5TdG9yZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbW9kZWwvdG9rZW5zL3RyZWVTaXR0ZXIvdG9rZW5TdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxxQkFBcUI7QUFDckIsTUFBTSxPQUFPLFFBQVE7SUFHcEIsSUFBSSxRQUFRLEtBQTBCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFHOUQsSUFBSSxNQUFNLEtBQWEsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUU3QyxZQUE0QixNQUFjO1FBQWQsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQU56QixjQUFTLEdBQVcsRUFBRSxDQUFDO1FBR2hDLFlBQU8sR0FBVyxDQUFDLENBQUM7SUFHa0IsQ0FBQztJQUUvQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQVcsRUFBRSxLQUFXO1FBQ3JDLE1BQU0sSUFBSSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELGNBQWM7UUFDYixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQsV0FBVyxDQUFDLElBQVU7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRSxDQUFDO1lBQzVCLE1BQU0sSUFBSSxLQUFLLENBQUMsa0RBQWtELENBQUMsQ0FBQztRQUNyRSxDQUFDO1FBQ0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMs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