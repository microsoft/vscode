/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { OpenerService as BaseOpenerService } from 'vs/editor/browser/services/openerService';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/product';
import { IStorageService } from 'vs/platform/storage/common/storage';

export class OpenerService extends BaseOpenerService {

	_serviceBrand!: ServiceIdentifier<any>;

	constructor(
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@IStorageService readonly storageService: IStorageService,
		@IDialogService readonly dialogService: IDialogService,
		@IProductService readonly productService: IProductService
	) {
		super(codeEditorService, commandService, storageService, dialogService, productService);
	}

	async openExternal(resource: URI): Promise<boolean> {
		const success = this.windowsService.openExternal(encodeURI(resource.toString(true)));
		if (!success && resource.scheme === Schemas.file) {
			await this.windowsService.showItemInFolder(resource);

			return true;
		}

		return success;
	}
}

registerSingleton(IOpenerService, OpenerService, true);
