/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IFileService } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { DiskFileSystemProvider } from 'vs/workbench/services/files2/node/diskFileSystemProvider';
import { Disposable } from 'vs/base/common/lifecycle';

export class DiskFileSystemSupport extends Disposable implements IWorkbenchContribution {

	constructor(@IFileService fileService: IFileService) {
		super();

		this._register(fileService.registerProvider(Schemas.file, new DiskFileSystemProvider()));
	}
}