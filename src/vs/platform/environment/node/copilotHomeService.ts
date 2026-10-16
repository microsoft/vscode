/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { resolve } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { getCopilotHomePath, ICopilotHomeService } from '../common/copilotHome.js';
import { INativeEnvironmentService } from '../common/environment.js';

export class CopilotHomeService implements ICopilotHomeService {
	declare readonly _serviceBrand: undefined;
	readonly home: URI;
	readonly source: ICopilotHomeService['source'];

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
	) {
		this.home = URI.file(resolve(getCopilotHomePath(environmentService.userHome.fsPath, process.env)));
		this.source = process.env.COPILOT_HOME ? 'environment' : 'userHome';
	}
}
