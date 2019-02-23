/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileDialogService, IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions } from 'vs/platform/dialogs/common/dialogs';
import { URI } from 'vs/base/common/uri';

export class SimpleFileDialogService implements IFileDialogService {

	_serviceBrand: any;

	defaultFilePath(schemeFilter?: string): URI {
		throw new Error('Method not implemented.');
	}

	defaultFolderPath(schemeFilter?: string): URI {
		throw new Error('Method not implemented.');
	}

	defaultWorkspacePath(schemeFilter?: string): URI {
		throw new Error('Method not implemented.');
	}

	pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		throw new Error('Method not implemented.');
	}

	pickFileAndOpen(options: IPickAndOpenOptions): Promise<any> {
		throw new Error('Method not implemented.');
	}

	pickFolderAndOpen(options: IPickAndOpenOptions): Promise<any> {
		throw new Error('Method not implemented.');
	}

	pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<any> {
		throw new Error('Method not implemented.');
	}

	showSaveDialog(options: ISaveDialogOptions): Promise<URI> {
		throw new Error('Method not implemented.');
	}

	showOpenDialog(options: IOpenDialogOptions): Promise<URI[]> {
		throw new Error('Method not implemented.');
	}
}