/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IFileService, IWatchOptions } from 'vs/platform/files/common/files';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IWorkbenchFileService = refineServiceDecorator<IFileService, IWorkbenchFileService>(IFileService);

export interface IWorkbenchFileService extends IFileService {

	/**
	 * Allows to start a watcher that reports file/folder change events on the provided resource.
	 *
	 * Note: watching a folder does not report events recursively unless the provided options
	 * explicitly opt-in to recursive watching.
	 */
	watch(resource: URI, options?: IWatchOptions): IDisposable;
}
