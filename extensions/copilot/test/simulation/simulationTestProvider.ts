/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ITestFailure, ITestProvider } from '../../src/platform/testing/common/testProvider';
import { Event } from '../../src/util/vs/base/common/event';
import { URI } from '../../src/util/vs/base/common/uri';
import { Range } from '../../src/vscodeTypes';

export class SimulationTestProvider implements ITestProvider {
	declare readonly _serviceBrand: undefined;

	onDidChangeResults = Event.None;

	constructor(private readonly failures: {
		label?: string;
		uri: URI;
		testRange: Range;
		failureRange?: Range;
		message: string;
	}[] = []) { }

	public getFailureAtPosition() {
		return undefined;
	}

	hasTestsInUri(): Promise<boolean> {
		return Promise.resolve(false);
	}

	getLastFailureFor(): ITestFailure | undefined {
		return undefined;
	}

	public getAllFailures(): Iterable<ITestFailure> {
		return this.failures.map((f): ITestFailure => ({
			snapshot: {
				children: [],
				id: '',
				label: f.label ?? 'my test',
				taskStates: [],
				uri: f.uri,
				range: f.testRange,
			},
			task: {
				state: 4,
				messages: [
					{
						message: f.message,
						location: {
							uri: f.uri,
							range: f.failureRange || f.testRange,
						},
					}
				]
			}
		}));
	}

	hasAnyTests(): Promise<boolean> {
		return Promise.resolve(true);
	}
}
