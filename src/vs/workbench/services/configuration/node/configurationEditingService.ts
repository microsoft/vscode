/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import * as paths from 'vs/base/common/paths';
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
import { IConfigurationService, IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { keyFromOverrideIdentifier } from 'vs/platform/configuration/common/model';
import { WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS } from 'vs/workbench/services/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationEditingService, ConfigurationEditingErrorCode, ConfigurationEditingError, ConfigurationTarget, IConfigurationValue, IConfigurationEditingOptions } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';
import { IChoiceService, IMessageService, Severity } from 'vs/platform/message/common/message';
import { ICommandService } from 'vs/platform/commands/common/commands';

interface IConfigurationEditOperation extends IConfigurationValue {
	jsonPath: json.JSONPath;
	resource: URI;
	isWorkspaceStandalone?: boolean;
}

interface IValidationResult {
	error?: ConfigurationEditingErrorCode;
	exists?: boolean;
}

interface ConfigurationEditingOptions extends IConfigurationEditingOptions {
	force?: boolean;
}

export class ConfigurationEditingService implements IConfigurationEditingService {

	public _serviceBrand: any;

	private queue: Queue<void>;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@ITextFileService private textFileService: ITextFileService,
		@IChoiceService private choiceService: IChoiceService,
		@IMessageService private messageService: IMessageService,
		@ICommandService private commandService: ICommandService
	) {
		this.queue = new Queue<void>();
	}

	writeConfiguration(target: ConfigurationTarget, value: IConfigurationValue, options: IConfigurationEditingOptions = {}): TPromise<void> {
		return this.queue.queue(() => this.doWriteConfiguration(target, value, options) // queue up writes to prevent race conditions
			.then(() => null,
			error => {
				if (!options.donotNotifyError) {
					this.onError(error, target, value, options.scopes);
				}
				return TPromise.wrapError(error);
			}));
	}

	private doWriteConfiguration(target: ConfigurationTarget, value: IConfigurationValue, options: ConfigurationEditingOptions): TPromise<void> {
		const operation = this.getConfigurationEditOperation(target, value, options.scopes || {});

		const checkDirtyConfiguration = !(options.force || options.donotSave);
		const saveConfiguration = options.force || !options.donotSave;
		return this.resolveAndValidate(target, operation, checkDirtyConfiguration)
			.then(reference => this.writeToBuffer(reference.object.textEditorModel, operation, saveConfiguration));
	}

	private writeToBuffer(model: editorCommon.IModel, operation: IConfigurationEditOperation, save: boolean): TPromise<any> {
		const edit = this.getEdits(model, operation)[0];
		if (this.applyEditsToBuffer(edit, model) && save) {
			return this.textFileService.save(operation.resource)
				// Reload the configuration so that we make sure all parties are updated
				.then(() => this.configurationService.reloadConfiguration());
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

	private onError(error: ConfigurationEditingError, target: ConfigurationTarget, value: IConfigurationValue, scopes: IConfigurationOverrides): void {
		switch (error.code) {
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION:
				this.onInvalidConfigurationError(error, target);
				break;
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY:
				this.onConfigurationFileDirtyError(error, target, value, scopes);
				break;
			default:
				this.messageService.show(Severity.Error, error.message);
		}
	}

	private onInvalidConfigurationError(error: ConfigurationEditingError, target: ConfigurationTarget): void {
		this.choiceService.choose(Severity.Error, error.message, [nls.localize('open', "Open Settings"), nls.localize('close', "Close")], 1)
			.then(option => {
				switch (option) {
					case 0:
						this.openSettings(target);
				}
			});
	}

	private onConfigurationFileDirtyError(error: ConfigurationEditingError, target: ConfigurationTarget, value: IConfigurationValue, scopes: IConfigurationOverrides): void {
		this.choiceService.choose(Severity.Error, error.message, [nls.localize('saveAndRetry', "Save Settings and Retry"), nls.localize('open', "Open Settings"), nls.localize('close', "Close")], 2)
			.then(option => {
				switch (option) {
					case 0:
						this.writeConfiguration(target, value, <ConfigurationEditingOptions>{ force: true, scopes });
						break;
					case 1:
						this.openSettings(target);
						break;
				}
			});
	}

	private openSettings(target: ConfigurationTarget): void {
		this.commandService.executeCommand(ConfigurationTarget.USER === target ? 'workbench.action.openGlobalSettings' : 'workbench.action.openWorkspaceSettings');
	}

	private wrapError(code: ConfigurationEditingErrorCode, target: ConfigurationTarget): TPromise<never> {
		const message = this.toErrorMessage(code, target);

		return TPromise.wrapError<never>(new ConfigurationEditingError(message, code));
	}

	private toErrorMessage(error: ConfigurationEditingErrorCode, target: ConfigurationTarget): string {
		switch (error) {

			// API constraints
			case ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY: return nls.localize('errorUnknownKey', "Unable to write to the configuration file (Unknown Key)");
			case ConfigurationEditingErrorCode.ERROR_INVALID_TARGET: return nls.localize('errorInvalidTarget', "Unable to write to the configuration file (Invalid Target)");

			// User issues
			case ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED: return nls.localize('errorNoWorkspaceOpened', "Unable to write into settings because no folder is opened. Please open a folder first and try again.");
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION: {
				if (target === ConfigurationTarget.USER) {
					return nls.localize('errorInvalidConfiguration', "Unable to write into settings. Please open **User Settings** to correct errors/warnings in the file and try again.");
				}

				return nls.localize('errorInvalidConfigurationWorkspace', "Unable to write into settings. Please open **Workspace Settings** to correct errors/warnings in the file and try again.");
			};
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY: {
				if (target === ConfigurationTarget.USER) {
					return nls.localize('errorConfigurationFileDirty', "Unable to write into settings because the file is dirty. Please save the **User Settings** file and try again.");
				}

				return nls.localize('errorConfigurationFileDirtyWorkspace', "Unable to write into settings because the file is dirty. Please save the **Workspace Settings** file and try again.");
			};
		}
	}

	private getEdits(model: editorCommon.IModel, edit: IConfigurationEditOperation): Edit[] {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		const { value, jsonPath } = edit;

		// Without jsonPath, the entire configuration file is being replaced, so we just use JSON.stringify
		if (!jsonPath.length) {
			const content = JSON.stringify(value, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t');
			return [{
				content,
				length: content.length,
				offset: 0
			}];
		}

		return setProperty(model.getValue(), jsonPath, value, { tabSize, insertSpaces, eol });
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

	private resolveAndValidate(target: ConfigurationTarget, operation: IConfigurationEditOperation, checkDirty: boolean): TPromise<IReference<ITextEditorModel>> {

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

		return this.resolveModelReference(operation.resource)
			.then(reference => {
				const model = reference.object.textEditorModel;

				if (this.hasParseErrors(model, operation)) {
					return this.wrapError(ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION, target);
				}

				// Target cannot be dirty if not writing into buffer
				if (checkDirty && this.textFileService.isDirty(operation.resource)) {
					return this.wrapError(ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY, target);
				}
				return TPromise.wrap(reference);
			});
	}

	private getConfigurationEditOperation(target: ConfigurationTarget, config: IConfigurationValue, overrides: IConfigurationOverrides): IConfigurationEditOperation {

		const workspace = this.contextService.getWorkspace();

		// Check for standalone workspace configurations
		if (config.key) {
			const standaloneConfigurationKeys = Object.keys(WORKSPACE_STANDALONE_CONFIGURATIONS);
			for (let i = 0; i < standaloneConfigurationKeys.length; i++) {
				const key = standaloneConfigurationKeys[i];
				const resource = this.getConfigurationFileResource(WORKSPACE_STANDALONE_CONFIGURATIONS[key], overrides.resource);

				// Check for prefix
				if (config.key === key) {
					const jsonPath = workspace && workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath ? [key] : [];
					return { key: jsonPath[jsonPath.length - 1], jsonPath, value: config.value, resource, isWorkspaceStandalone: true };
				}

				// Check for prefix.<setting>
				const keyPrefix = `${key}.`;
				if (config.key.indexOf(keyPrefix) === 0) {
					const jsonPath = workspace && workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath ? [key, config.key.substr(keyPrefix.length)] : [config.key.substr(keyPrefix.length)];
					return { key: jsonPath[jsonPath.length - 1], jsonPath, value: config.value, resource, isWorkspaceStandalone: true };
				}
			}
		}

		let key = config.key;
		let jsonPath = overrides.overrideIdentifier ? [keyFromOverrideIdentifier(overrides.overrideIdentifier), key] : [key];
		if (target === ConfigurationTarget.USER) {
			return { key, jsonPath, value: config.value, resource: URI.file(this.environmentService.appSettingsPath) };
		}

		const resource = this.getConfigurationFileResource(WORKSPACE_CONFIG_DEFAULT_PATH, overrides.resource);
		if (workspace && workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath) {
			jsonPath = ['settings', ...jsonPath];
		}
		return { key, jsonPath, value: config.value, resource };
	}

	private getConfigurationFileResource(relativePath: string, resource: URI): URI {
		const workspace = this.contextService.getWorkspace();
		if (workspace) {
			if (resource) {
				const root = this.contextService.getRoot(resource);
				if (root) {
					return this.toResource(relativePath, root);
				}
			}
			return workspace.configuration || this.toResource(relativePath, workspace.roots[0]);
		}
		return null;
	}

	private toResource(relativePath: string, root: URI): URI {
		return URI.file(paths.join(root.fsPath, relativePath));
	}
}
