/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var TestIdPathParts;
(function (TestIdPathParts) {
    /** Delimiter for path parts in test IDs */
    TestIdPathParts["Delimiter"] = "\0";
})(TestIdPathParts || (TestIdPathParts = {}));
/**
 * Enum for describing relative positions of tests. Similar to
 * `node.compareDocumentPosition` in the DOM.
 */
export var TestPosition;
(function (TestPosition) {
    /** a === b */
    TestPosition[TestPosition["IsSame"] = 0] = "IsSame";
    /** Neither a nor b are a child of one another. They may share a common parent, though. */
    TestPosition[TestPosition["Disconnected"] = 1] = "Disconnected";
    /** b is a child of a */
    TestPosition[TestPosition["IsChild"] = 2] = "IsChild";
    /** b is a parent of a */
    TestPosition[TestPosition["IsParent"] = 3] = "IsParent";
})(TestPosition || (TestPosition = {}));
/**
 * The test ID is a stringifiable client that
 */
export class TestId {
    /**
     * Creates a test ID from an ext host test item.
     */
    static fromExtHostTestItem(item, rootId, parent = item.parent) {
        if (item._isRoot) {
            return new TestId([rootId]);
        }
        const path = [item.id];
        for (let i = parent; i && i.id !== rootId; i = i.parent) {
            path.push(i.id);
        }
        path.push(rootId);
        return new TestId(path.reverse());
    }
    /**
     * Cheaply ets whether the ID refers to the root .
     */
    static isRoot(idString) {
        return !idString.includes("\0" /* TestIdPathParts.Delimiter */);
    }
    /**
     * Cheaply gets whether the ID refers to the root .
     */
    static root(idString) {
        const idx = idString.indexOf("\0" /* TestIdPathParts.Delimiter */);
        return idx === -1 ? idString : idString.slice(0, idx);
    }
    /**
     * Creates a test ID from a serialized TestId instance.
     */
    static fromString(idString) {
        return new TestId(idString.split("\0" /* TestIdPathParts.Delimiter */));
    }
    /**
     * Gets the ID resulting from adding b to the base ID.
     */
    static join(base, b) {
        return new TestId([...base.path, b]);
    }
    /**
     * Splits a test ID into its parts.
     */
    static split(idString) {
        return idString.split("\0" /* TestIdPathParts.Delimiter */);
    }
    /**
     * Gets the string ID resulting from adding b to the base ID.
     */
    static joinToString(base, b) {
        return base.toString() + "\0" /* TestIdPathParts.Delimiter */ + b;
    }
    /**
     * Cheaply gets the parent ID of a test identified with the string.
     */
    static parentId(idString) {
        const idx = idString.lastIndexOf("\0" /* TestIdPathParts.Delimiter */);
        return idx === -1 ? undefined : idString.slice(0, idx);
    }
    /**
     * Cheaply gets the local ID of a test identified with the string.
     */
    static localId(idString) {
        const idx = idString.lastIndexOf("\0" /* TestIdPathParts.Delimiter */);
        return idx === -1 ? idString : idString.slice(idx + "\0" /* TestIdPathParts.Delimiter */.length);
    }
    /**
     * Gets whether maybeChild is a child of maybeParent.
     * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
     */
    static isChild(maybeParent, maybeChild) {
        return maybeChild[maybeParent.length] === "\0" /* TestIdPathParts.Delimiter */ && maybeChild.startsWith(maybeParent);
    }
    /**
     * Compares the position of the two ID strings.
     * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
     */
    static compare(a, b) {
        if (a === b) {
            return 0 /* TestPosition.IsSame */;
        }
        if (TestId.isChild(a, b)) {
            return 2 /* TestPosition.IsChild */;
        }
        if (TestId.isChild(b, a)) {
            return 3 /* TestPosition.IsParent */;
        }
        return 1 /* TestPosition.Disconnected */;
    }
    static getLengthOfCommonPrefix(length, getId) {
        if (length === 0) {
            return 0;
        }
        let commonPrefix = 0;
        while (commonPrefix < length - 1) {
            for (let i = 1; i < length; i++) {
                const a = getId(i - 1);
                const b = getId(i);
                if (a.path[commonPrefix] !== b.path[commonPrefix]) {
                    return commonPrefix;
                }
            }
            commonPrefix++;
        }
        return commonPrefix;
    }
    constructor(path, viewEnd = path.length) {
        this.path = path;
        this.viewEnd = viewEnd;
        if (path.length === 0 || viewEnd < 1) {
            throw new Error('cannot create test with empty path');
        }
    }
    /**
     * Gets the ID of the parent test.
     */
    get rootId() {
        return new TestId(this.path, 1);
    }
    /**
     * Gets the ID of the parent test.
     */
    get parentId() {
        return this.viewEnd > 1 ? new TestId(this.path, this.viewEnd - 1) : undefined;
    }
    /**
     * Gets the local ID of the current full test ID.
     */
    get localId() {
        return this.path[this.viewEnd - 1];
    }
    /**
     * Gets whether this ID refers to the root.
     */
    get controllerId() {
        return this.path[0];
    }
    /**
     * Gets whether this ID refers to the root.
     */
    get isRoot() {
        return this.viewEnd === 1;
    }
    /**
     * Returns an iterable that yields IDs of all parent items down to and
     * including the current item.
     */
    *idsFromRoot() {
        for (let i = 1; i <= this.viewEnd; i++) {
            yield new TestId(this.path, i);
        }
    }
    /**
     * Returns an iterable that yields IDs of the current item up to the root
     * item.
     */
    *idsToRoot() {
        for (let i = this.viewEnd; i > 0; i--) {
            yield new TestId(this.path, i);
        }
    }
    /**
     * Compares the other test ID with this one.
     */
    compare(other) {
        if (typeof other === 'string') {
            return TestId.compare(this.toString(), other);
        }
        for (let i = 0; i < other.viewEnd && i < this.viewEnd; i++) {
            if (other.path[i] !== this.path[i]) {
                return 1 /* TestPosition.Disconnected */;
            }
        }
        if (other.viewEnd > this.viewEnd) {
            return 2 /* TestPosition.IsChild */;
        }
        if (other.viewEnd < this.viewEnd) {
            return 3 /* TestPosition.IsParent */;
        }
        return 0 /* TestPosition.IsSame */;
    }
    /**
     * Serializes the ID.
     */
    toJSON() {
        return this.toString();
    }
    /**
     * Serializes the ID to a string.
     */
    toString() {
        if (!this.stringifed) {
            this.stringifed = this.path[0];
            for (let i = 1; i < this.viewEnd; i++) {
                this.stringifed += "\0" /* TestIdPathParts.Delimiter */;
                this.stringifed += this.path[i];
            }
        }
        return this.stringifed;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdElkLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdElkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sQ0FBTixJQUFrQixlQUdqQjtBQUhELFdBQWtCLGVBQWU7SUFDaEMsMkNBQTJDO0lBQzNDLG1DQUFnQixDQUFBO0FBQ2pCLENBQUMsRUFIaUIsZUFBZSxLQUFmLGVBQWUsUUFHaEM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLENBQU4sSUFBa0IsWUFTakI7QUFURCxXQUFrQixZQUFZO0lBQzdCLGNBQWM7SUFDZCxtREFBTSxDQUFBO0lBQ04sMEZBQTBGO0lBQzFGLCtEQUFZLENBQUE7SUFDWix3QkFBd0I7SUFDeEIscURBQU8sQ0FBQTtJQUNQLHlCQUF5QjtJQUN6Qix1REFBUSxDQUFBO0FBQ1QsQ0FBQyxFQVRpQixZQUFZLEtBQVosWUFBWSxRQVM3QjtBQUlEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLE1BQU07SUFHbEI7O09BRUc7SUFDSSxNQUFNLENBQUMsbUJBQW1CLENBQUMsSUFBa0IsRUFBRSxNQUFjLEVBQUUsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNO1FBQ3pGLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQzdCLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2QixLQUFLLElBQUksQ0FBQyxHQUFHLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN6RCxJQUFJLENBQUMsSUFBSSxD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