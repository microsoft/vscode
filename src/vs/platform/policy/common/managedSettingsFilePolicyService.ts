/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY } from '../../../base/common/copilotPolicy.js';
import { PolicyName } from '../../../base/common/policy.js';
import { isObject, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IPolicyService, PolicyValue } from './policy.js';
import { FilePolicyService } from './filePolicyService.js';

/**
 * Mapping from nested managed-settings.json schema paths to flat policy keys.
 * The V0 schema shape is:
 *
 * ```json
 * {
 *   "permissions": {
 *     "disableBypassPermissionsMode": "disable"
 *   }
 * }
 * ```
 *
 * This map converts the nested structure to flat `IPolicyService` keys.
 */
interface ISchemaMapping {
	readonly section: string;
	readonly key: string;
	readonly policyName: string;
	/** Transforms the raw JSON value to the policy value. If undefined is returned, the key is not emitted. */
	readonly transform?: (value: string | number | boolean) => PolicyValue | undefined;
}

const SCHEMA_MAPPINGS: readonly ISchemaMapping[] = [
	{
		section: 'permissions',
		key: 'disableBypassPermissionsMode',
		policyName: COPILOT_MANAGED_SETTINGS_AUTO_APPROVE_POLICY,
		transform: value => value === 'disable' ? false : undefined,
	},
];

/**
 * Flattens the nested managed-settings.json schema into flat policy key-value pairs.
 * Unknown keys are silently ignored for forward-compatibility.
 */
function flattenManagedSettingsSchema(raw: Record<string, unknown>): Map<PolicyName, PolicyValue> {
	const result = new Map<PolicyName, PolicyValue>();

	for (const mapping of SCHEMA_MAPPINGS) {
		const section = raw[mapping.section];
		if (isObject(section)) {
			const value = (section as Record<string, unknown>)[mapping.key];
			if (isString(value) || typeof value === 'number' || typeof value === 'boolean') {
				const transformed = mapping.transform ? mapping.transform(value) : value;
				if (transformed !== undefined) {
					result.set(mapping.policyName, transformed);
				}
			}
		}
	}

	return result;
}

/**
 * Reads the GitHubCopilot managed-settings.json file and flattens its nested
 * schema into the flat policy key-value store that `IPolicyService` expects.
 *
 * Extends {@link FilePolicyService} for file watching, throttling, and diff logic.
 * Overrides {@link read} to parse the nested schema (instead of flat key-value)
 * and optionally validate file security properties before reading.
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

			return flattenManagedSettingsSchema(raw as Record<string, unknown>);
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.error(`[ManagedSettingsFilePolicyService] Failed to read managed settings`, error);
			}
		}

		return new Map();
	}
}
