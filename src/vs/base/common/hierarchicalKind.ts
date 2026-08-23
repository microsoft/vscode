/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class HierarchicalKind {
	public static readonly sep = '.';

	public static readonly None = new HierarchicalKind('@@none@@'); // Special kind that matches nothing
	public static readonly Empty = new HierarchicalKind('');

	constructor(
		public readonly value: string
	) { }

	public equals(other: HierarchicalKind): boolean {
		return this.value === other.value;
	}

	public contains(other: HierarchicalKind): boolean {
		return this.equals(other) || this.value === '' || other.value.startsWith(this.value + HierarchicalKind.sep);
	}

	public intersects(other: HierarchicalKind): boolean {
		return this.contains(other) || other.contains(this);
	}

	public append(...parts: string[]): HierarchicalKind {
		return new HierarchicalKind((this.value ? [this.value, ...parts] : parts).join(HierarchicalKind.sep));
	}
}
