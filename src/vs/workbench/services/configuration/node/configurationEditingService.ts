/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as json from 'vs/base/common/json';
import { assign } from 'vs/base/common/objects';
import * as encoding from 'vs/base/node/encoding';
import strings = require('vs/base/common/strings');
import { setProperty } from 'vs/base/common/jsonEdit';
import { Queue } from 'vs/base/common/async';
import { applyEdits, Edit } from 'vs/base/common/jsonFormatter';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { keyFromOverrideIdentifier } from 'vs/platform/configuration/common/model';
import { WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationEditingService, ConfigurationEditingErrorCode, IConfigurationEditingError, ConfigurationTarget, IConfigurationValue, IConfigurationEditingOptions } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';

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
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@ITextFileService private textFileService: ITextFileService

	) {
		this.queue = new Queue<void>();
	}

	public writeConfiguration(target: ConfigurationTarget, value: IConfigurationValue, options: IConfigurationEditingOptions = null): TPromise<void> {
		const defaultOptions: IConfigurationEditingOptions = { writeToBuffer: false, autoSave: false };
		options = assign(defaultOptions, options || {});
		return this.queue.queue(() => this.doWriteConfiguration(target, value, options)); // queue up writes to prevent race conditions
	}

	private doWriteConfiguration(target: ConfigurationTarget, value: IConfigurationValue, options: IConfigurationEditingOptions): TPromise<void> {
		const operation = this.getConfigurationEditOperation(target, value);

		// First validate before making any edits
		return this.validate(target, operation, options).then(validation => {
			if (typeof validation.error === 'number') {
				// Target cannot contain JSON errors if writing to disk
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
				if (options.writeToBuffer) {
					return this.writeToBuffer(contents, operation, resource, options);
				} else {
					return this.writeToDisk(contents, operation, resource);
				}
			});
		});
	}

	private writeToBuffer(contents: string, operation: IConfigurationEditOperation, resource: URI, options: IConfigurationEditingOptions): TPromise<void> {
		const isDirtyBefore = this.textFileService.isDirty(resource);
		const edit = this.getEdits(contents, operation)[0];
		return this.textModelResolverService.createModelReference(resource).
			then(reference => {
				if (this.applyEditsToBuffer(edit, reference.object.textEditorModel)) {
					if (options.autoSave && !isDirtyBefore) {
						this.textFileService.save(resource);
					}
				}
				reference.dispose();
			});
	}

	private applyEditsToBuffer(edit: Edit, model: editorCommon.IModel): boolean {
		const startPosition = model.getPositionAt(edit.offset);
		const endPosition = model.getPositionAt(edit.offset + edit.length);
		const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		let currentText = model.getValueInRange(range);
		if (edit.content !== currentText) {
			const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
			model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
			return true;
		}
		return false;
	}

	private writeToDisk(contents: string, operation: IConfigurationEditOperation, resource: URI): TPromise<void> {
		// Apply all edits to the configuration file
		const result = this.applyEdits(contents, operation);

		return this.fileService.updateContent(resource, result, { encoding: encoding.UTF8 }).then(() => {

			// Reload the configuration so that we make sure all parties are updated
			return this.configurationService.reloadConfiguration().then(() => void 0);
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
		const {key, value} = edit;
		// Without key, the entire settings file is being replaced, so we just use JSON.stringify
		if (!key) {
			return JSON.stringify(value, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t');
		}

		const edits = this.getEdits(content, edit);
		content = applyEdits(content, edits);

		return content;
	}

	private getEdits(content: string, edit: IConfigurationEditOperation): Edit[] {
		const {tabSize, insertSpaces} = this.configurationService.getConfiguration<{ tabSize: number; insertSpaces: boolean }>('editor');
		const {eol} = this.configurationService.getConfiguration<{ eol: string }>('files');

		const {key, value, overrideIdentifier} = edit;
		return setProperty(content, overrideIdentifier ? [keyFromOverrideIdentifier(overrideIdentifier), key] : [key], value, { tabSize, insertSpaces, eol });
	}

	private validate(target: ConfigurationTarget, operation: IConfigurationEditOperation, options: IConfigurationEditingOptions): TPromise<IValidationResult> {

		// Any key must be a known setting from the registry (unless this is a standalone config)
		if (!operation.isWorkspaceStandalone) {
			const validKeys = this.configurationService.keys().default;
			if (validKeys.indexOf(operation.key) < 0 && !OVERRIDE_PROPERTY_PATTERN.test(operation.key)) {
				return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY });
			}
		}

		// Target cannot be user if is standalone
		if (operation.isWorkspaceStandalone && target === ConfigurationTarget.USER) {
			return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_INVALID_TARGET });
		}

		// Target cannot be workspace if no workspace opened
		if (target === ConfigurationTarget.WORKSPACE && !this.contextService.hasWorkspace()) {
			return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED });
		}

		// Target cannot be dirty if not writing into buffer
		const resource = operation.target;
		if (!options.writeToBuffer && this.textFileService.isDirty(resource)) {
			return TPromise.as({ error: ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY });
		}

		return this.fileService.existsFile(resource).then(exists => {
			if (!exists) {
				return { exists };
			}

			return this.resolveContent(resource, options).then(content => {

				// If we write to a workspace standalone file and replace the entire contents (no key provided)
				// we can return here because any parse errors can safely be ignored since all contents are replaced
				if (operation.isWorkspaceStandalone && !operation.key) {
					return { exists, contents: content };
				}

				let error = void 0;
				const parseErrors: json.ParseError[] = [];
				json.parse(content, parseErrors, { allowTrailingComma: true });
				if (!options.writeToBuffer && parseErrors.length > 0) {
					error = ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION;
				}

				return { exists, contents: content, error };
			});
		});
	}

	private resolveContent(resource: URI, options: IConfigurationEditingOptions): TPromise<string> {
		if (options.writeToBuffer) {
			return this.textModelResolverService.createModelReference(resource).then(reference => reference.object.textEditorModel.getValue());
		}
		return this.fileService.resolveContent(resource, { acceptTextOnly: true, encoding: encoding.UTF8 }).then(content => content.value);
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
			return { key: config.key, value: config.value, overrideIdentifier: config.overrideIdentifier, target: URI.file(this.environmentService.appSettingsPath) };
		}

		return { key: config.key, value: config.value, overrideIdentifier: config.overrideIdentifier, target: this.contextService.toResource(WORKSPACE_CONFIG_DEFAULT_PATH) };
	}
}