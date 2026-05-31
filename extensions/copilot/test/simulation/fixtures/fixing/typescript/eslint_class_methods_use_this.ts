/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint class-methods-use-this: "error" */
export class List<T> {
	protected readonly a: T
	protected readonly d: List<T>
	constructor(a: T, d: List<T>) {
		this.a = a
		this.d = d
	}
	length(): number {
		return 1 + this.d.length()
	}
	append(l1: List<T>, l2: List<T>): List<T> {
		if (l1.d === null) {
			return l2
		}
		else {
			return new List(l1.a, l2)
		}
	}
}