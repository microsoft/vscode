/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ExtensionContext } from 'vscode';

import { LogService } from './logService';
import { PromptService } from './promptService';
import { assertDefined } from '../utils/asserts';
import { ObservableDisposable } from '../utils/vscode';
import { FileSystemService } from './filesystemService';
import { IFileSystemService, ILogService, IPromptService } from './types';

/**
 * Set of services used by the extension.
 */
// TODO: @legomushroom - add real services infrastructure instead
class Services extends ObservableDisposable {
	/**
	 * VSCode extension context.
	 */
	private _context: ExtensionContext | undefined;

	/**
	 * Initialized file system service singleton instance.
	 */
	private _filesystemService: IFileSystemService | undefined;

	/**
	 * Initialized log service singleton instance.
	 */
	private _logService: ILogService | undefined;

	/**
	 * Initialized prompt service singleton instance.
	 */
	private _promptService: IPromptService | undefined;

	/**
	 * Safe getter for the current VSCode extension context.
	 */
	private get context(): ExtensionContext {
		assertDefined(
			this._context,
			'Services have not been initialized. Call `initialize()` first.',
		);

		return this._context;
	}

	/**
	 * Initialize services with provided VSCode extension context.
	 *
	 * @throws if {@link initialize} method has been called before already.
	 */
	public initialize(context: ExtensionContext): this {
		assert(
			this._context === undefined,
			'Services have already been initialized.',
		);

		this._context = context;

		return this;
	}

	/**
	 * Get singleton instance for the {@link IFileSystemService}.
	 *
	 * @throws if {@link initialize} method has not been called yet.
	 */
	public get filesystemService(): IFileSystemService {
		if (this._filesystemService) {
			return this._filesystemService;
		}

		this._filesystemService = this._register(new FileSystemService());

		return this._filesystemService;
	}

	/**
	 * Get singleton instance for the {@link ILogService}.
	 *
	 * @throws if {@link initialize} method has not been called yet.
	 */
	public get logService(): ILogService {
		if (this._logService) {
			return this._logService;
		}

		this._logService = this._register(new LogService(this.context));

		return this._logService;
	}

	/**
	 * Get singleton instance for the {@link IPromptService}.
	 *
	 * @throws if {@link initialize} method has not been called yet.
	 */
	public get promptService(): IPromptService {
		if (this._promptService) {
			return this._promptService;
		}

		this._promptService = this._register(new PromptService(
			this.filesystemService,
			this.logService,
		));

		return this._promptService;
	}
}

export const services = new Services();
