/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { ManagedSettingsData } from '../../../base/common/policy.js';
import { isObject } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IFileManagedSettingsService, normalizeManagedSettings } from './copilotManagedSettings.js';

/**
 * Upper bound on the size of `managed-settings.json` we will read into the main process. A
 * legitimate settings file is a few KB; capping the read keeps a malformed or hostile file on the
 * (externally writable, privileged) well-known path from OOM-ing the main process. `readFile`
 * throws `FILE_TOO_LARGE` past this, which `refresh()` treats like any other read failure.
 */
const MANAGED_SETTINGS_MAX_FILE_SIZE = 1024 * 1024; // 1 MB

export class FileManagedSettingsService extends Disposable implements IFileManagedSettingsService {

	readonly _serviceBrand: undefined;

	private _managedSettings: ManagedSettingsData = {};
	get managedSettings(): ManagedSettingsData { return this._managedSettings; }

	private readonly _onDidChangeManagedSettings = this._register(new Emitter<ManagedSettingsData>());
	readonly onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;

	private readonly throttledDelayer = this._register(new ThrottledDelayer(500));

	constructor(
		private readonly file: URI,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const onDidChangeFile = Event.filter(fileService.onDidFilesChange, e => e.affects(file));
		this._register(fileService.watch(file));
		this._register(onDidChangeFile(() => this.throttledDelayer.trigger(() => this.refresh())));

		// Initial read — routed through the same delayer (with no delay) so it is serialized
		// against change-triggered refreshes and can't be clobbered by a racing read. Non-blocking;
		// IPC clients handle eventual data arrival.
		this.throttledDelayer.trigger(() => this.refresh(), 0);
	}

	private async refresh(): Promise<void> {
		const previous = this._managedSettings;

		try {
			const content = await this.fileService.readFile(this.file, { limits: { size: MANAGED_SETTINGS_MAX_FILE_SIZE } });
			const parsed = JSON.parse(content.value.toString());

			if (isObject(parsed)) {
				this._managedSettings = normalizeManagedSettings(parsed as Record<string, unknown>,
					msg => this.logService.warn(`[FileManagedSettingsService] ${msg}`));
			} else {
				this.logService.warn('[FileManagedSettingsService] managed-settings.json is not a JSON object');
				this._managedSettings = {};
			}
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error('[FileManagedSettingsService] Failed to read managed-settings.json', error);
			}
			this._managedSettings = {};
		}

		if (!equals(previous, this._managedSettings)) {
			this._onDidChangeManagedSettings.fire(this._managedSettings);
		}
	}
}
