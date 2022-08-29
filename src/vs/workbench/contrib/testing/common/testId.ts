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

type TestItemLike = { id: string; parent?: TestItemLike };

/**
 * The test ID is a stringifiable client that
 */
export class TestId {
	private stringifed?: string;

	/**
	 * Creates a test ID from an ext host test item.
	 */
	public static fromExtHostTestItem(item: TestItemLike, rootId: string, parent = item.parent) {
		if (item.id === rootId) {
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
	 * Cheaply ets whether the ID refers to the root .
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
	 * Gets the string ID resulting from adding b to the base ID.
	 */
	public static joinToString(base: string | TestId, b: string) {
		return base.toString() + TestIdPathParts.Delimiter + b;
	}

	/**
	 * Compares the position of the two ID strings.
	 */
	public static compare(a: string, b: string) {
		if (a === b) {
			return TestPosition.IsSame;
		}

		if (b.startsWith(a + TestIdPathParts.Delimiter)) {
			return TestPosition.IsChild;
		}

		if (a.startsWith(b + TestIdPathParts.Delimiter)) {
			return TestPosition.IsParent;
		}

		return TestPosition.Disconnected;
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
	public get parentId(): TestId {
		return this.viewEnd > 1 ? new TestId(this.path, this.viewEnd - 1) : this;
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
