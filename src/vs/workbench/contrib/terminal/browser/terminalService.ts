/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalService as CommonTerminalService } from 'vs/workbench/contrib/terminal/common/terminalService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';

export abstract class TerminalService extends CommonTerminalService implements ITerminalService {

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService
	) {
		super(contextKeyService, panelService, partService, lifecycleService, storageService);
	}
}