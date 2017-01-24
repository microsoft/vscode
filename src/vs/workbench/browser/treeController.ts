/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { DefaultController, WorkbenchOpenMode, IControllerOptions } from 'vs/base/parts/tree/browser/treeDefaults';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

interface IConfiguration {
	workbench: {
		openMode: string;
	};
}

export class TreeControllerBase extends DefaultController {
	constructor(
		options: IControllerOptions,
		configurationService: IConfigurationService
	) {
		super(options);

		this.onConfigurationUpdated(configurationService.getConfiguration<IConfiguration>());
		configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config));
	}

	private onConfigurationUpdated(config: IConfiguration): void {
		super.setOpenMode(this.getOpenModeSetting(config));
	}

	private getOpenModeSetting(config: IConfiguration): WorkbenchOpenMode {
		const openModeSetting = config && config.workbench && config.workbench.openMode;
		return openModeSetting === 'doubleClick' ? WorkbenchOpenMode.DOUBLE_CLICK : WorkbenchOpenMode.SINGLE_CLICK;
	}
}
