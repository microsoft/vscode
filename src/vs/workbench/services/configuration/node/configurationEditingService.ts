/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as json from 'vs/base/common/json';
import * as encoding from 'vs/base/node/encoding';
import strings = require('vs/base/common/strings');
import { setProperty } from 'vs/base/common/jsonEdit';
import { Queue } from 'vs/base/common/async';
import { applyEdits } from 'vs/base/common/jsonFormatter';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationEditingService, ConfigurationEditingErrorCode, IConfigurationEditingError, ConfigurationTarget, IConfigurationValue } from 'vs/workbench/services/configuration/common/configurationEditing';

interface IConfigurationEditOperation extends IConfigurationValue {
	target: URI;
	isWorkspaceStandalone?: boolean;
}

interface IValidationResult {
	error?: ConfigurationEditingErrorCode;
	exists?: boolean;
	contents?: string;
}

export class ConfigurationEditingService implements IConfigurationEditingService {

	public _serviceBrand: any;

	private queue: Queue<void>;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService
	) {
		this.queue = new Queue<void>();
	}

	public writeConfiguration(target: ConfigurationTarget, value: IConfigurationValue): TPromise<void> {
		return this.queue.queue(() => this.doWriteConfiguration(target, value)); // queue up writes to prevent race conditions
	}

	private doWriteConfiguration(target: ConfigurationTarget, value: IConfigurationValue): TPromise<void> {
		const operation = this.getConfigurationEditOperation(target, value);

		// First validate before making any edits
		return this.validate(target, operation).then(validation => {
			if (typeof validation.error === 'number') {
				return this.wrapError(validation.error, target);
			}

			// Create configuration file if missing
			const resource = operation.target;
			let ensureConfigurationFile = TPromise.as(null);
			let contents: string;
			if (!validation.exists) {
				contents = '{}';
				ensureConfigurationFile = this.fileService.updateContent(resource, contents, { encoding: encoding.UTF8 });
			} else {
				contents = validation.contents;
			}

			return ensureConfigurationFile.then(() => {

				// Apply all edits to the configuration file
				const result = this.applyEdits(contents, operation);

				return this.fileService.updateContent(resource, result, { encoding: encoding.UTF8 }).then(() => {

					// Reload the configuration so that we make sure all parties are updated
					return this.configurationService.reloadConfiguration().then(() => void 0);
				});
			});
		});
	}

	private wrapError(code: ConfigurationEditingErrorCode, target: ConfigurationTarget): TPromise<any> {
		const message = this.toErrorMessage(code, target);

		return TPromise.wrapError<IConfigurationEditingError>({
			code,
			message,
			toString: () => message
		});
	}

	private toErrorMessage(error: ConfigurationEditingErrorCode, target: ConfigurationTarget): string {
		switch (error) {

			// API constraints
			case ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY: return nls.localize('errorUnknownKey', "Unable to write to the configuration file (Unknown Key)");
			case ConfigurationEditingErrorCode.ERROR_INVALID_TARGET: return nls.localize('errorInvalidTarget', "Unable to write to the configuration file (Invalid Target)");

			// User issues
			case ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED: return nls.localize('errorNoWorkspaceOpened', "Unable to write settings because no folder is opened. Please open a folder first and try again.");
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION: {
				if (target === ConfigurationTarget.USER) {
					return nls.localize('errorInvalidConfiguration', "Unable to write settings. Please open **User Settings** to correct errors/warnings in the file and try again.");
				}

				return nls.localize('errorInvalidConfigurationWorkspace', "Unable to write settings. Please open **Workspace Settings** to correct errors/warnings in the file and try again.");
			};
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY: {
				if (target === ConfigurationTarget.USER) {
					return nls.localize('errorConfigurationFileDirty', "Unable to write settings because the file is dirty. Please save the **User Settings** file and try again.");
				}

				return nls.localize('errorConfigurationFileDirtyWorkspace', "Unable to write settings because the file is dirty. Please save the **Workspace Settings** file and try again.");
			};
		}
	}

	private applyEdits(content: string, edit: IConfigurationEditOperation): string {
		const {tabSize, insertSpaces} = this.configurationService.getConfiguration<{ tabSize: number; insertSpaces: boolean }>('editor');
		const {eol} = this.configurationService.getConfiguration<{ eol: string }>('files');

		const {key, value} = edit;

		// Without key, the entire settings file is being replaced, so we just use JSON.stringify
		if (!key) {
			return JSON.stringify(value, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t');
		}

		const edits = setProperty(content, [key], value, { tabSize, insertSpaces, eol });
		content = applyEdits(content, edits);

		return content;
	}

	private validate(target: ConfigurationTarget, operation: IConfigurationEditOperation): TPromise<IValidationResult> {

		// Any key must be a known setting from the registry (unless this is a standalone config)
		if (!operation.isWorkspaceStandalone) {
			const validKeys = this.configurationService.keys().default;
			if (validKeys.indexOf(operation.key) < 0) {
				return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY });
			}
		}

		// Target cannot be user if is standalone
		if (operation.isWorkspaceStandalone && target === ConfigurationTarget.USER) {
			return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_INVALID_TARGET });
		}

		// Target cannot be workspace if no workspace opened
		if (target === ConfigurationTarget.WORKSPACE && !this.contextService.getWorkspace()) {
			return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED });
		}

		// Target cannot be dirty
		const resource = operation.target;
		if (this.textFileService.isDirty(resource)) {
			return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY });
		}

		return this.fileService.existsFile(resource).then(exists => {
			if (!exists) {
				return { exists };
			}

			return this.fileService.resolveContent(resource, { acceptTextOnly: true, encoding: encoding.UTF8 }).then(content => {

				// If we write to a workspace standalone file and replace the entire contents (no key provided)
				// we can return here because any parse errors can safely be ignored since all contents are replaced
				if (operation.isWorkspaceStandalone && !operation.key) {
					return { exists, contents: content.value };
				}

				// Target cannot contain JSON errors
				const parseErrors = [];
				json.parse(content.value, parseErrors);
				if (parseErrors.length > 0) {
					return { error: ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION };
				}

				return { exists, contents: content.value };
			});
		});
	}

	private getConfigurationEditOperation(target: ConfigurationTarget, config: IConfigurationValue): IConfigurationEditOperation {

		// Check for standalone workspace configurations
		if (config.key) {
			const standaloneConfigurationKeys = Object.keys(WORKSPACE_STANDALONE_CONFIGURATIONS);
			for (let i = 0; i < standaloneConfigurationKeys.length; i++) {
				const key = standaloneConfigurationKeys[i];
				const target = this.contextService.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[key]);

				// Check for prefix
				if (config.key === key) {
					return { key: '', value: config.value, target, isWorkspaceStandalone: true };
				}

				// Check for prefix.<setting>
				const keyPrefix = `${key}.`;
				if (config.key.indexOf(keyPrefix) === 0) {
					return { key: config.key.substr(keyPrefix.length), value: config.value, target, isWorkspaceStandalone: true };
				}
			}
		}

		if (target === ConfigurationTarget.USER) {
			return { key: config.key, value: config.value, target: URI.file(this.environmentService.appSettingsPath) };
		}

		return { key: config.key, value: config.value, target: this.contextService.toResource(WORKSPACE_CONFIG_DEFAULT_PATH) };
	}
}