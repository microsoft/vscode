/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IProgress } from 'vs/platform/progress/common/progress';
import { TestItem, TestResultState } from 'vs/workbench/api/common/extHostTypes';

export class StubTestItem extends TestItem {
	parent: StubTestItem | undefined;

	constructor(id: string, label: string, private readonly pendingChildren: StubTestItem[]) {
		super(id, label, URI.file('/'), pendingChildren.length > 0);
	}

	public override discoverChildren(progress: IProgress<{ busy: boolean }>) {
		for (const child of this.pendingChildren) {
			this.children.add(child);
		}

		progress.report({ busy: false });
	}
}

export const stubTest = (label: string, idPrefix = 'id-', children: StubTestItem[] = []): StubTestItem => {
	return new StubTestItem(idPrefix + label, label, children);
};

export const testStubs = {
	test: stubTest,
	nested: (idPrefix = 'id-') => stubTest('root', idPrefix, [
		stubTest('a', idPrefix, [stubTest('aa', idPrefix), stubTest('ab', idPrefix)]),
		stubTest('b', idPrefix),
	]),
};

export const ReExportedTestRunState = TestResultState;
