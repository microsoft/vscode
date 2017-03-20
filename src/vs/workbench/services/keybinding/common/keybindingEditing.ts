/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Queue } from 'vs/base/common/async';
import { IReference, Disposable } from 'vs/base/common/lifecycle';
import * as json from 'vs/base/common/json';
import { Edit } from 'vs/base/common/jsonFormatter';
import { setProperty } from 'vs/base/common/jsonEdit';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
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
}

export class KeybindingsEditingService extends Disposable implements IKeybindingEditingService {

	public _serviceBrand: any;
	private queue: Queue<void>;

	private resource: URI = URI.file(this.environmentService.appKeybindingsPath);

	constructor(
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@ITextFileService private textFileService: ITextFileService,
		@IFileService private fileService: IFileService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super();
		this.queue = new Queue<void>();
	}

	editKeybinding(key: string, keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.queue.queue(() => this.doEditKeybinding(key, keybindingItem)); // queue up writes to prevent race conditions
	}

	removeKeybinding(keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.queue.queue(() => this.doRemoveKeybinding(keybindingItem)); // queue up writes to prevent race conditions
	}

	private doEditKeybinding(key: string, keybindingItem: ResolvedKeybindingItem): TPromise<void> {
		return this.resolveAndValidate()
			.then(reference => {
				key = new RegExp(/\\/g).test(key) ? key.slice(0, -1) + '\\\\' : key;
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

	private save(): TPromise<any> {
		return this.textFileService.save(this.resource);
	}

	private updateUserKeybinding(newKey: string, keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const userKeybindingEntry = this.findUserKeybindingEntry(keybindingItem, userKeybindingEntries);
		if (userKeybindingEntry) {
			this.applyEditsToBuffer(setProperty(model.getValue(), [userKeybindingEntries.indexOf(userKeybindingEntry), 'key'], newKey, { tabSize, insertSpaces, eol })[0], model);
		}
	}

	private updateDefaultKeybinding(newKey: string, keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const userKeybindingEntry = this.findUserKeybindingEntry(keybindingItem, userKeybindingEntries);
		if (userKeybindingEntry) {
			// Update the keybinding with new key
			this.applyEditsToBuffer(setProperty(model.getValue(), [userKeybindingEntries.indexOf(userKeybindingEntry), 'key'], newKey, { tabSize, insertSpaces, eol })[0], model);
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
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const userKeybindingEntry = this.findUserKeybindingEntry(keybindingItem, userKeybindingEntries);
		if (userKeybindingEntry) {
			userKeybindingEntries.splice(userKeybindingEntries.indexOf(userKeybindingEntry), 1);
			model.setValue(JSON.stringify(userKeybindingEntries, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t'));
		}
	}

	private removeDefaultKeybinding(keybindingItem: ResolvedKeybindingItem, model: editorCommon.IModel): void {
		const {tabSize, insertSpaces} = model.getOptions();
		const eol = model.getEOL();
		this.applyEditsToBuffer(setProperty(model.getValue(), [-1], this.asObject(keybindingItem.resolvedKeybinding.getUserSettingsLabel(), keybindingItem.command, keybindingItem.when, true), { tabSize, insertSpaces, eol })[0], model);
	}

	private findUserKeybindingEntry(keybindingItem: ResolvedKeybindingItem, userKeybindingEntries: IUserFriendlyKeybinding[]): IUserFriendlyKeybinding {
		return userKeybindingEntries.filter(keybinding => {
			if (keybinding.command !== keybindingItem.command) {
				return false;
			}
			if (!keybinding.when && !keybindingItem.when) {
				return true;
			}
			if (keybinding.when && keybindingItem.when) {
				return ContextKeyExpr.deserialize(keybinding.when).serialize() === keybindingItem.when.serialize();
			}
			return false;
		})[0];
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
				const result = exists ? TPromise.as(null) : this.fileService.updateContent(this.resource, '{}', { encoding: 'utf8' });
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
				if (this.hasParseErrors(model)) {
					return TPromise.wrapError(localize('errorInvalidConfiguration', "Unable to write keybindings. Please open **Keybindings file** to correct errors/warnings in the file and try again."));
				}
				return reference;
			});
	}

	private hasParseErrors(model: editorCommon.IModel): boolean {
		const parseErrors: json.ParseError[] = [];
		json.parse(model.getValue(), parseErrors, { allowTrailingComma: true });
		return parseErrors.length > 0;
	}
}