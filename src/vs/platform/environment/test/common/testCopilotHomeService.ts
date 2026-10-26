/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICopilotHomeService } from '../../common/copilotHome.js';

export class TestCopilotHomeService implements ICopilotHomeService {
	declare readonly _serviceBrand: undefined;
	readonly home: URI;
	readonly source: ICopilotHomeService['source'];

	constructor(userHome: URI, copilotHome?: URI) {
		this.home = copilotHome ?? URI.joinPath(userHome, '.copilot');
		this.source = copilotHome ? 'environment' : 'userHome';
	}
}
