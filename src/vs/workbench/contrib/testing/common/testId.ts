/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum TestIdPathParts {
	/** Delimiter for path parts in test IDs */
	Delimiter = '\0',
}

/**
 * Enum for describing relative positions of tests. Similar to
 * `node.compareDocumentPosition` in the DOM.
 */
export const enum TestPosition {
	/** a === b */
	IsSame,
	/** Neither a nor b are a child of one another. They may share a common parent, though. */
	Disconnected,
	/** b is a child of a */
	IsChild,
	/** b is a parent of a */
	IsParent,
}

type TestItemLike = { id: string; parent?: TestItemLike; _isRoot?: boolean };

/**
 * The test ID is a stringifiable client that
 */
export class TestId {
	private stringifed?: string;

	/**
	 * Creates a test ID from an ext host test item.
	 */
	public static fromExtHostTestItem(item: TestItemLike, rootId: string, parent = item.parent) {
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
	public static isRoot(idString: string) {
		return !idString.includes(TestIdPathParts.Delimiter);
	}

	/**
	 * Cheaply gets whether the ID refers to the root .
	 */
	public static root(idString: string) {
		const idx = idString.indexOf(TestIdPathParts.Delimiter);
		return idx === -1 ? idString : idString.slice(0, idx);
	}

	/**
	 * Creates a test ID from a serialized TestId instance.
	 */
	public static fromString(idString: string) {
		return new TestId(idString.split(TestIdPathParts.Delimiter));
	}

	/**
	 * Gets the ID resulting from adding b to the base ID.
	 */
	public static join(base: TestId, b: string) {
		return new TestId([...base.path, b]);
	}

	/**
	 * Splits a test ID into its parts.
	 */
	public static split(idString: string) {
		return idString.split(TestIdPathParts.Delimiter);
	}

	/**
	 * Gets the string ID resulting from adding b to the base ID.
	 */
	public static joinToString(base: string | TestId, b: string) {
		return base.toString() + TestIdPathParts.Delimiter + b;
	}

	/**
	 * Cheaply gets the parent ID of a test identified with the string.
	 */
	public static parentId(idString: string) {
		const idx = idString.lastIndexOf(TestIdPathParts.Delimiter);
		return idx === -1 ? undefined : idString.slice(0, idx);
	}

	/**
	 * Cheaply gets the local ID of a test identified with the string.
	 */
	public static localId(idString: string) {
		const idx = idString.lastIndexOf(TestIdPathParts.Delimiter);
		return idx === -1 ? idString : idString.slice(idx + TestIdPathParts.Delimiter.length);
	}

	/**
	 * Gets whether maybeChild is a child of maybeParent.
	 * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
	 */
	public static isChild(maybeParent: string, maybeChild: string) {
		return maybeChild[maybeParent.length] === TestIdPathParts.Delimiter && maybeChild.startsWith(maybeParent);
	}

	/**
	 * Compares the position of the two ID strings.
	 * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
	 */
	public static compare(a: string, b: string) {
		if (a === b) {
			return TestPosition.IsSame;
		}

		if (TestId.isChild(a, b)) {
			return TestPosition.IsChild;
		}

		if (TestId.isChild(b, a)) {
			return TestPosition.IsParent;
		}

		return TestPosition.Disconnected;
	}

	public static getLengthOfCommonPrefix(length: number, getId: (i: number) => TestId): number {
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

	constructor(
		public readonly path: readonly string[],
		private readonly viewEnd = path.length,
	) {
		if (path.length === 0 || viewEnd < 1) {
			throw new Error('cannot create test with empty path');
		}
	}

	/**
	 * Gets the ID of the parent test.
	 */
	public get rootId(): TestId {
		return new TestId(this.path, 1);
	}

	/**
	 * Gets the ID of the parent test.
	 */
	public get parentId(): TestId | undefined {
		return this.viewEnd > 1 ? new TestId(this.path, this.viewEnd - 1) : undefined;
	}

	/**
	 * Gets the local ID of the current full test ID.
	 */
	public get localId() {
		return this.path[this.viewEnd - 1];
	}

	/**
	 * Gets whether this ID refers to the root.
	 */
	public get controllerId() {
		return this.path[0];
	}

	/**
	 * Gets whether this ID refers to the root.
	 */
	public get isRoot() {
		return this.viewEnd === 1;
	}

	/**
	 * Returns an iterable that yields IDs of all parent items down to and
	 * including the current item.
	 */
	public *idsFromRoot() {
		for (let i = 1; i <= this.viewEnd; i++) {
			yield new TestId(this.path, i);
		}
	}

	/**
	 * Returns an iterable that yields IDs of the current item up to the root
	 * item.
	 */
	public *idsToRoot() {
		for (let i = this.viewEnd; i > 0; i--) {
			yield new TestId(this.path, i);
		}
	}

	/**
	 * Compares the other test ID with this one.
	 */
	public compare(other: TestId | string) {
		if (typeof other === 'string') {
			return TestId.compare(this.toString(), other);
		}

		for (let i = 0; i < other.viewEnd && i < this.viewEnd; i++) {
			if (other.path[i] !== this.path[i]) {
				return TestPosition.Disconnected;
			}
		}

		if (other.viewEnd > this.viewEnd) {
			return TestPosition.IsChild;
		}

		if (other.viewEnd < this.viewEnd) {
			return TestPosition.IsParent;
		}

		return TestPosition.IsSame;
	}

	/**
	 * Serializes the ID.
	 */
	public toJSON() {
		return this.toString();
	}

	/**
	 * Serializes the ID to a string.
	 */
	public toString() {
		if (!this.stringifed) {
			this.stringifed = this.path[0];
			for (let i = 1; i < this.viewEnd; i++) {
				this.stringifed += TestIdPathParts.Delimiter;
				this.stringifed += this.path[i];
			}
		}

		return this.stringifed;
	}
}
