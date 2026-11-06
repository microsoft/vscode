/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { resolve } from '../../../../base/common/path.js';
import { env } from '../../../../base/common/process.js';
import { URI } from '../../../../base/common/uri.js';
import { getCopilotHomePath, ICopilotHomeService } from '../../../../platform/environment/common/copilotHome.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IPathService } from '../../../../platform/path/common/pathService.js';

export { ICopilotHomeService } from '../../../../platform/environment/common/copilotHome.js';

export class WorkbenchCopilotHomeService implements ICopilotHomeService {
	declare readonly _serviceBrand: undefined;
	readonly home: URI;
	readonly source: ICopilotHomeService['source'];

	constructor(
		@IPathService pathService: IPathService,
	) {
		this.home = URI.file(resolve(getCopilotHomePath(pathService.userHome({ preferLocal: true }).fsPath, env)));
		this.source = env.COPILOT_HOME ? 'environment' : 'userHome';
	}
}

registerSingleton(ICopilotHomeService, WorkbenchCopilotHomeService, InstantiationType.Delayed);
