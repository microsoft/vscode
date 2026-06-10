/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export const ISimulationTestContext = createServiceIdentifier<ISimulationTestContext>('ISimulationTestContext');

export interface ISimulationTestContext {

	_serviceBrand: undefined;

	readonly isInSimulationTests: boolean;

	writeFile(filename: string, contents: Uint8Array | string, tag: string): Promise<string>;
}


export class NulSimulationTestContext implements ISimulationTestContext {

	_serviceBrand: undefined;

	readonly isInSimulationTests = false;

	async writeFile(filename: string, contents: Uint8Array | string, tag: string): Promise<string> {
		return '';
	}
}
