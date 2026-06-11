/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedSettingsData, MANAGED_SETTINGS_RAW_POLICY_NAME } from '../../../base/common/copilotPolicy.js';
import { PolicyName } from '../../../base/common/policy.js';
import { isObject } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IPolicyService, PolicyValue } from './policy.js';
import { FilePolicyService } from './filePolicyService.js';

/**
 * Reads the GitHubCopilot managed-settings.json file and stores the raw
 * {@link IManagedSettingsData} as a JSON-encoded policy value under
 * {@link MANAGED_SETTINGS_RAW_POLICY_NAME}.
 *
 * The raw data is forwarded to the renderer via the existing policy IPC
 * channel, where `AccountPolicyService` reads it and passes it to each
 * policy definition's `value({ managedSettings })` callback.
 *
 * Extends {@link FilePolicyService} for file watching, throttling, and diff logic.
 *
 * An optional `validateFile` callback can be provided to enforce security
 * checks (root-owned, no symlinks, not world-writable) before reading.
 */
export class ManagedSettingsFilePolicyService extends FilePolicyService implements IPolicyService {

	constructor(
		file: URI,
		@IFileService fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		private readonly validateFile?: (filePath: string) => Promise<{ valid: boolean; reason?: string }>,
	) {
		super(file, fileService, _logService);
	}

	protected override async read(): Promise<Map<PolicyName, PolicyValue>> {
		try {
			if (this.validateFile) {
				const result = await this.validateFile(this.file.fsPath);
				if (!result.valid) {
					this._logService.warn(`[ManagedSettingsFilePolicyService] Skipping policy file: ${result.reason}`);
					return new Map();
				}
			}

			const content = await this.fileService.readFile(this.file);
			const raw = JSON.parse(content.value.toString());

			if (!isObject(raw)) {
				throw new Error('Managed settings file is not a JSON object');
			}

			const data = raw as IManagedSettingsData;
			return new Map([[MANAGED_SETTINGS_RAW_POLICY_NAME, JSON.stringify(data)]]);
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.error(`[ManagedSettingsFilePolicyService] Failed to read managed settings`, error);
			}
		}

		return new Map();
	}
}
