/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const emptyArr = new Array<number>();

export class ImmutableSet<T> {
	private static empty = new ImmutableSet<any>(0);
	public static getEmpty<T>(): ImmutableSet<T> {
		return this.empty;
	}

	constructor(
		private readonly items: number,
		private readonly additionalItems: readonly number[] = emptyArr) {
	}

	public add(value: T, keyProvider: DenseKeyProvider<T>): ImmutableSet<T> {
		const key = keyProvider.getKey(value);
		let idx = key >> 5; // divided by 32
		if (idx === 0) {
			// fast path
			const newItem = (1 << key) | this.items;
			if (newItem === this.items) {
				return this;
			}
			return new ImmutableSet(newItem, this.additionalItems);
		}
		idx--;

		const newItems = this.additionalItems.slice(0);
		while (newItems.length < idx) {
			newItems.push(0);
		}
		newItems[idx] |= 1 << (key & 31);

		return new ImmutableSet(this.items, newItems);
	}

	public has(value: T, keyProvider: DenseKeyProvider<T>): boolean {
		const key = keyProvider.getKey(value);
		let idx = key >> 5; // divided by 32
		if (idx === 0) {
			// fast path
			return (this.items & (1 << key)) !== 0;
		}
		idx--;

		return ((this.additionalItems[idx] || 0) & (1 << (key & 31))) !== 0;
	}

	public merge(other: ImmutableSet<T>): ImmutableSet<T> {
		const merged = this.items | other.items;

		if (this.additionalItems === emptyArr && other.additionalItems === emptyArr) {
			// fast path
			if (merged === this.items) {
				return this;
			}
			if (merged === other.items) {
				return other;
			}
			return new ImmutableSet(merged, emptyArr);
		}

		// This can be optimized, but it's not a common case
		const newItems = new Array<number>();
		for (let i = 0; i < Math.max(this.additionalItems.length, other.additionalItems.length); i++) {
			const item1 = this.additionalItems[i] || 0;
			const item2 = other.additionalItems[i] || 0;
			newItems.push(item1 | item2);
		}

		return new ImmutableSet(merged, newItems);
	}

	public intersects(other: ImmutableSet<T>): boolean {
		if ((this.items & other.items) !== 0) {
			return true;
		}

		for (let i = 0; i < Math.min(this.additionalItems.length, other.additionalItems.length); i++) {
			if ((this.additionalItems[i] & other.additionalItems[i]) !== 0) {
				return true;
			}
		}

		return false;
	}
}

export class DenseKeyProvider<T> {
	private readonly items = new Map<T, number>();

	getKey(value: T): number {
		let existing = this.items.get(value);
		if (existing === undefined) {
			existing = this.items.size;
			this.items.set(value, existing);
		}
		return existing;
	}
}
