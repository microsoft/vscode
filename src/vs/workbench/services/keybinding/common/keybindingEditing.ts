/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { isArray } from 'vs/base/common/types';
import { Queue } from 'vs/base/common/async';
import { IReference, Disposable } from 'vs/base/common/lifecycle';
import * as json from 'vs/base/common/json';
import { Edit } from 'vs/base/common/jsonFormatter';
import { setProperty } from 'vs/base/common/jsonEdit';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextModelResolverService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';


export const IKeybindingEditingService = createDecorator<IKeybindingEditingService>('keybindingEditingService');

export interface IKeybindingEditingService {

	_serviceBrand: ServiceIdentifier<any>;

	editKeybinding(key: string, keybindingItem: ResolvedKeybindingItem): TPromise<void>;

	removeKeybinding(keybindingItem: ResolvedKeybindingItem): TPromise<void>;

	resetKeybinding(keybindingItem: ResolvedKeybindingItem): TPromise<void>;
}

export class KeybindingsEditingService extends Disposable implements IKeybindingEditingService {

	public _serviceBrand: any;
	private queue: Queue<void>;

	private resource: URI = URI.file(this.environmentService.appKeybindingsPath);

	constructor(
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@ITextFileService private textFileService: ITextFileService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super();
		this.queue = new Queue<void>();
	}

	editKeybinding(key: string, keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.queue.queue(() => this.doEditKeybinding(key, keybindingItem)); // queue up writes to prevent race conditions
	}

	resetKeybinding(keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.queue.queue(() => this.doResetKeybinding(keybindingItem)); // queue up writes to prevent race conditions
	}

	removeKeybinding(keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.queue.queue(() => this.doRemoveKeybinding(keybindingItem)); // queue up writes to prevent race conditions
	}

	private doEditKeybinding(key: string, keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.resolveAndValidate()
			.then(reference => {
				const model = reference.object.textEditorModel;
				if (keybindingItem.isDefault) {
					this.updateDefaultKeybinding(key, keybindingItem, model);
				} else {
					this.updateUserKeybinding(key, keybindingItem, model);
				}
				return this.save().then(() => reference.dispose());
			});
	}

	private doRemoveKeybinding(keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.resolveAndValidate()
			.then(reference => {
				const model = reference.object.textEditorModel;
				if (keybindingItem.isDefault) {
					this.removeDefaultKeybinding(keybindingItem, model);
				} else {
					this.removeUserKeybinding(keybindingItem, model);
				}
				return this.save().then(() => reference.dispose());
			});
	}

	private doResetKeybinding(keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.resolveAndValidate()
			.then(reference => {
				const model = reference.object.textEditorModel;
				if (!keybindingItem.isDefault) {
					this.removeUserKeybinding(keybindingItem, model);
					this.removeUnassignedDefaultKeybinding(keybindingItem, model);
				}
				return this.save().then(() => reference.dispose());
			});
	}

	private save(): TPromise<any> {
		return this.textFileService.save(this.resource);
	}

	private updateUserKeybinding(newKey: string, keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const userKeybindingEntryIndex = this.findUserKeybindingEntryIndex(keybindingItem, userKeybindingEntries);
		if (userKeybindingEntryIndex !== -1) {
			this.applyEditsToBuffer(setProperty(model.getValue(), [userKeybindingEntryIndex, 'key'], newKey, { tabSize, insertSpaces, eol })[0], model);
		}
	}

	private updateDefaultKeybinding(newKey: string, keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const userKeybindingEntryIndex = this.findUserKeybindingEntryIndex(keybindingItem, userKeybindingEntries);
		if (userKeybindingEntryIndex !== -1) {
			// Update the keybinding with new key
			this.applyEditsToBuffer(setProperty(model.getValue(), [userKeybindingEntryIndex, 'key'], newKey, { tabSize, insertSpaces, eol })[0], model);
		} else {
			// Add the new keybinidng with new key
			this.applyEditsToBuffer(setProperty(model.getValue(), [-1], this.asObject(newKey, keybindingItem.command, keybindingItem.when, false), { tabSize, insertSpaces, eol })[0], model);
		}
		if (keybindingItem.resolvedKeybinding) {
			// Unassign the default keybinding
			this.applyEditsToBuffer(setProperty(model.getValue(), [-1], this.asObject(keybindingItem.resolvedKeybinding.getUserSettingsLabel(), keybindingItem.command, keybindingItem.when, true), { tabSize, insertSpaces, eol })[0], model);
		}
	}

	private removeUserKeybinding(keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const userKeybindingEntryIndex = this.findUserKeybindingEntryIndex(keybindingItem, userKeybindingEntries);
		if (userKeybindingEntryIndex !== -1) {
			this.applyEditsToBuffer(setProperty(model.getValue(), [userKeybindingEntryIndex], void 0, { tabSize, insertSpaces, eol })[0], model);
		}
	}

	private removeDefaultKeybinding(keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		this.applyEditsToBuffer(setProperty(model.getValue(), [-1], this.asObject(keybindingItem.resolvedKeybinding.getUserSettingsLabel(), keybindingItem.command, keybindingItem.when, true), { tabSize, insertSpaces, eol })[0], model);
	}

	private removeUnassignedDefaultKeybinding(keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const index = this.findUnassignedDefaultKeybindingEntryIndex(keybindingItem, userKeybindingEntries);
		if (index !== -1) {
			this.applyEditsToBuffer(setProperty(model.getValue(), [index], void 0, { tabSize, insertSpaces, eol })[0], model);
		}
	}

	private findUserKeybindingEntryIndex(keybindingItem: ResolvedKeybindingItem, userKeybindingEntries: IUserFriendlyKeybinding[]): number {
		for (let index = 0; index < userKeybindingEntries.length; index++) {
			const keybinding = userKeybindingEntries[index];
			if (keybinding.command === keybindingItem.command) {
				if (!keybinding.when && !keybindingItem.when) {
					return index;
				}
				if (keybinding.when && keybindingItem.when) {
					if (ContextKeyExpr.deserialize(keybinding.when).serialize() === keybindingItem.when.serialize()) {
						return index;
					}
				}
			}
		}
		return -1;
	}

	private findUnassignedDefaultKeybindingEntryIndex(keybindingItem: ResolvedKeybindingItem, userKeybindingEntries: IUserFriendlyKeybinding[]): number {
		for (let index = 0; index < userKeybindingEntries.length; index++) {
			if (userKeybindingEntries[index].command === `-${keybindingItem.command}`) {
				return index;
			}
		}
		return -1;
	}

	private asObject(key: string, command: string, when: ContextKeyExpr, negate: boolean): any {
		const object = { key };
		object['command'] = negate ? `-${command}` : command;
		if (when) {
			object['when'] = when.serialize();
		}
		return object;
	}


	private applyEditsToBuffer(edit: Edit, model: editorCommon.IModel): void {
		const startPosition = model.getPositionAt(edit.offset);
		const endPosition = model.getPositionAt(edit.offset + edit.length);
		const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		let currentText = model.getValueInRange(range);
		const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
		model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
	}


	private resolveModelReference(): TPromise<IReference<ITextEditorModel>> {
		return this.fileService.existsFile(this.resource)
			.then(exists => {
				const EOL = this.configurationService.getConfiguration({ section: 'files', overrideIdentifier: 'json' })['eol'];
				const result = exists ? TPromise.as(null) : this.fileService.updateContent(this.resource, this.getEmptyContent(EOL), { encoding: 'utf8' });
				return result.then(() => this.textModelResolverService.createModelReference(this.resource));
			});
	}

	private resolveAndValidate(): TPromise<IReference<ITextEditorModel>> {

		// Target cannot be dirty if not writing into buffer
		if (this.textFileService.isDirty(this.resource)) {
			return TPromise.wrapError(localize('errorKeybindingsFileDirty', "Unable to write because the file is dirty. Please save the **Keybindings** file and try again."));
		}

		return this.resolveModelReference()
			.then(reference => {
				const model = reference.object.textEditorModel;
				const EOL = model.getEOL();
				if (model.getValue()) {
					const parsed = this.parse(model);
					if (parsed.parseErrors.length) {
						return TPromise.wrapError(localize('parseErrors', "Unable to write keybindings. Please open **Keybindings file** to correct errors/warnings in the file and try again."));
					}
					if (parsed.result) {
						if (!isArray(parsed.result)) {
							return TPromise.wrapError(localize('errorInvalidConfiguration', "Unable to write keybindings. **Keybindings file** has an object which is not of type Array. Please open the file to clean up and try again."));
						}
					} else {
						const content = EOL + '[]';
						this.applyEditsToBuffer({ content, length: content.length, offset: model.getValue().length }, model);
					}
				} else {
					const content = this.getEmptyContent(EOL);
					this.applyEditsToBuffer({ content, length: content.length, offset: 0 }, model);
				}
				return reference;
			});
	}

	private parse(model: editorCommon.IModel): { result: IUserFriendlyKeybinding[], parseErrors: json.ParseError[] } {
		const parseErrors: json.ParseError[] = [];
		const result = json.parse(model.getValue(), parseErrors, { allowTrailingComma: true });
		return { result, parseErrors };
	}

	private getEmptyContent(EOL: string): string {
		return '// ' + localize('emptyKeybindingsHeader', "Place your key bindings in this file to overwrite the defaults") + EOL + '[]';
	}
}