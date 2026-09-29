/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../src/util/common/services';
import { SimulationTest } from '../base/stest';

export const ITestInformation = createServiceIdentifier<ITestInformation>('ITestInformation');

export interface ITestInformation {
	fullTestName: string;
	testFileName: string | undefined;
}

export class TestInformation implements ITestInformation {
	constructor(
		private readonly _testInfo: SimulationTest,
	) { }

	get fullTestName(): string {
		return this._testInfo.fullName;
	}

	get testFileName(): string | undefined {
		return this._testInfo.options.location?.path;
	}
}
