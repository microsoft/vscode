/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITestMessage, TestMessageType, TestResultItem } from './testTypes.js';

export function shouldSkipTestOutputDecoration(message: ITestMessage, item: TestResultItem | undefined): boolean {
	return message.type === TestMessageType.Output && !message.location && !!item;
}

export class TestResultTreeState<T> {
	private readonly items = new Set<TestResultItem>();
	private readonly children = new Map<TestResultItem, readonly T[]>();

	public update(tests: Iterable<TestResultItem>, includeMessageChildren: boolean, changedItems?: Iterable<TestResultItem>): void {
		if (includeMessageChildren) {
			for (const test of tests) {
				this.items.add(test);
			}
		} else {
			for (const test of changedItems ?? []) {
				this.items.add(test);
			}
		}
	}

	public getItems(): readonly TestResultItem[] {
		return [...this.items];
	}

	public setChildren(test: TestResultItem, children: readonly T[]): void {
		this.children.set(test, children);
	}

	public getChildren(test: TestResultItem): readonly T[] | undefined {
		return this.children.get(test);
	}
}
