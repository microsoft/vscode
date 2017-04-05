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
import { Edit } from 'vs/base/common/jsonFormatter';
import { IReference } from 'vs/base/common/lifecycle';
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
import { IConfigurationEditingService, ConfigurationEditingErrorCode, IConfigurationEditingError, ConfigurationTarget, IConfigurationValue } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ITextModelResolverService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';

interface IConfigurationEditOperation extends IConfigurationValue {
	resource: URI;
	isWorkspaceStandalone?: boolean;
}

interface IValidationResult {
	error?: ConfigurationEditingErrorCode;
	exists?: boolean;
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

	writeConfiguration(target: ConfigurationTarget, value: IConfigurationValue, save: boolean = true): TPromise<void> {
		return this.queue.queue(() => this.doWriteConfiguration(target, value, save)); // queue up writes to prevent race conditions
	}

	private doWriteConfiguration(target: ConfigurationTarget, value: IConfigurationValue, save: boolean): TPromise<void> {
		const operation = this.getConfigurationEditOperation(target, value);

		return this.resolveAndValidate(target, operation, save)
			.then(reference => this.writeToBuffer(reference.object.textEditorModel, operation, save)
				.then(() => reference.dispose()));
	}

	private writeToBuffer(model: editorCommon.IModel, operation: IConfigurationEditOperation, save: boolean): TPromise<any> {
		const edit = this.getEdits(model, operation)[0];
		if (this.applyEditsToBuffer(edit, model) && save) {
			return this.textFileService.save(operation.resource);
		}
		return TPromise.as(null);
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

	private getEdits(model: editorCommon.IModel, edit: IConfigurationEditOperation): Edit[] {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		const {key, value, overrideIdentifier} = edit;

		// Without key, the entire settings file is being replaced, so we just use JSON.stringify
		if (!key) {
			const content = JSON.stringify(value, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t');
			return [{
				content,
				length: content.length,
				offset: 0
			}];
		}

		return setProperty(model.getValue(), overrideIdentifier ? [keyFromOverrideIdentifier(overrideIdentifier), key] : [key], value, { tabSize, insertSpaces, eol });
	}

	private resolveModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {
		return this.fileService.existsFile(resource)
			.then(exists => {
				const result = exists ? TPromise.as(null) : this.fileService.updateContent(resource, '{}', { encoding: encoding.UTF8 });
				return result.then(() => this.textModelResolverService.createModelReference(resource));
			});
	}

	private hasParseErrors(model: editorCommon.IModel, operation: IConfigurationEditOperation): boolean {
		// If we write to a workspace standalone file and replace the entire contents (no key provided)
		// we can return here because any parse errors can safely be ignored since all contents are replaced
		if (operation.isWorkspaceStandalone && !operation.key) {
			return false;
		}
		const parseErrors: json.ParseError[] = [];
		json.parse(model.getValue(), parseErrors, { allowTrailingComma: true });
		return parseErrors.length > 0;
	}

	private resolveAndValidate(target: ConfigurationTarget, operation: IConfigurationEditOperation, save: boolean): TPromise<IReference<ITextEditorModel>> {

		// Any key must be a known setting from the registry (unless this is a standalone config)
		if (!operation.isWorkspaceStandalone) {
			const validKeys = this.configurationService.keys().default;
			if (validKeys.indexOf(operation.key) < 0 && !OVERRIDE_PROPERTY_PATTERN.test(operation.key)) {
				return this.wrapError(ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY, target);
			}
		}

		// Target cannot be user if is standalone
		if (operation.isWorkspaceStandalone && target === ConfigurationTarget.USER) {
			return this.wrapError(ConfigurationEditingErrorCode.ERROR_INVALID_TARGET, target);
		}

		// Target cannot be workspace if no workspace opened
		if (target === ConfigurationTarget.WORKSPACE && !this.contextService.hasWorkspace()) {
			return this.wrapError(ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED, target);
		}

		// Target cannot be dirty if not writing into buffer
		const resource = operation.resource;
		if (save && this.textFileService.isDirty(resource)) {
			return this.wrapError(ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY, target);
		}

		return this.resolveModelReference(operation.resource)
			.then(reference => {
				const model = reference.object.textEditorModel;
				if (this.hasParseErrors(model, operation)) {
					return this.wrapError(ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION, target);
				}
				return reference;
			});
	}

	private getConfigurationEditOperation(target: ConfigurationTarget, config: IConfigurationValue): IConfigurationEditOperation {

		// Check for standalone workspace configurations
		if (config.key) {
			const standaloneConfigurationKeys = Object.keys(WORKSPACE_STANDALONE_CONFIGURATIONS);
			for (let i = 0; i < standaloneConfigurationKeys.length; i++) {
				const key = standaloneConfigurationKeys[i];
				const resource = this.contextService.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[key]);

				// Check for prefix
				if (config.key === key) {
					return { key: '', value: config.value, resource, isWorkspaceStandalone: true };
				}

				// Check for prefix.<setting>
				const keyPrefix = `${key}.`;
				if (config.key.indexOf(keyPrefix) === 0) {
					return { key: config.key.substr(keyPrefix.length), value: config.value, resource, isWorkspaceStandalone: true };
				}
			}
		}

		if (target === ConfigurationTarget.USER) {
			return { key: config.key, value: config.value, overrideIdentifier: config.overrideIdentifier, resource: URI.file(this.environmentService.appSettingsPath) };
		}

		return { key: config.key, value: config.value, overrideIdentifier: config.overrideIdentifier, resource: this.contextService.toResource(WORKSPACE_CONFIG_DEFAULT_PATH) };
	}
}