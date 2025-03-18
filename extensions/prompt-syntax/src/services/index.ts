/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ExtensionContext } from 'vscode';

import { IFileSystemService, ILogService } from './types';
import { LogService } from './logService';
import { assertDefined } from '../utils/asserts';
import { ObservableDisposable } from '../utils/vscode';
import { FileSystemService } from './vscodeFilesystem';

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - add real services infrastructure instead
class Services extends ObservableDisposable {
	private _context: ExtensionContext | undefined;
	private _logService: ILogService | undefined;
	private _filesystemService: IFileSystemService | undefined;

	private get context(): ExtensionContext {
		assertDefined(
			this._context,
			'Services have not been initialized. Call `initialize()` first.',
		);

		return this._context;
	}

	public initialize(context: ExtensionContext): this {
		assert(
			this._context === undefined,
			'Services have already been initialized.',
		);

		this._context = context;

		return this;
	}

	public get logService(): ILogService {
		if (this._logService) {
			return this._logService;
		}

		this._logService = this._register(new LogService(this.context));

		return this._logService;
	}

	public get filesystemService(): IFileSystemService {
		if (this._filesystemService) {
			return this._filesystemService;
		}

		this._filesystemService = this._register(new FileSystemService());

		return this._filesystemService;
	}
}

export const services = new Services();
