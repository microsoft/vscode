/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeSitterTokenizationService } from 'vs/editor/common/services/treeSitterTokenizationFeature';


export class TestTreeSitterTokenizationService implements ITreeSitterTokenizationService {
	readonly _serviceBrand: undefined;

	public initTreeSitter(): Promise<void> {
		return Promise.resolve();
	}
}
