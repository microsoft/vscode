/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedSettingsData } from '../../../base/common/copilotPolicy.js';
import { PolicyName } from '../../../base/common/policy.js';
import { isObject } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IPolicyService, PolicyValue } from './policy.js';
import { FilePolicyService } from './filePolicyService.js';

/**
 * Reads the GitHubCopilot managed-settings.json file and evaluates each
 * policy definition's {@link PolicyDefinition.managedSettingsValue} callback
 * against the parsed data.
 *
 * Extends {@link FilePolicyService} for file watching, throttling, and diff logic.
 * Overrides {@link read} to parse the managed-settings schema and apply
 * per-policy value callbacks — the same pattern as {@link AccountPolicyService}
 * uses {@link PolicyDefinition.value} for account policy data.
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
			const result = new Map<PolicyName, PolicyValue>();

			for (const name in this.policyDefinitions) {
				const definition = this.policyDefinitions[name];
				if (definition.managedSettingsValue) {
					const value = definition.managedSettingsValue(data);
					if (value !== undefined) {
						result.set(name, value);
					}
				}
			}

			return result;
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.error(`[ManagedSettingsFilePolicyService] Failed to read managed settings`, error);
			}
		}

		return new Map();
	}
}
