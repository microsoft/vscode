/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Position, TestItem, Uri } from 'vscode';
import { Event } from '../../../util/vs/base/common/event';
import { ITestFailure, ITestProvider } from './testProvider';

export class NullTestProvider implements ITestProvider {
	declare _serviceBrand: undefined;

	onDidChangeResults = Event.None;

	getAllFailures(): Iterable<ITestFailure> {
		return [];
	}

	getFailureAtPosition(uri: Uri, position: Position): ITestFailure | undefined {
		return undefined;
	}

	getLastFailureFor(testItem: TestItem): ITestFailure | undefined {
		return undefined;
	}

	hasTestsInUri(): Promise<boolean> {
		return Promise.resolve(false);
	}

	hasAnyTests(): Promise<boolean> {
		return Promise.resolve(false);
	}
}
