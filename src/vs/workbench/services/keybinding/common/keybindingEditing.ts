/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Queue } from 'vs/base/common/async';
import * as json from 'vs/base/common/json';
import * as objects from 'vs/base/common/objects';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Edit } from 'vs/base/common/jsonFormatter';
import { Disposable, IReference } from 'vs/base/common/lifecycle';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { ITextModelService, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IUserFriendlyKeybinding } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export const IKeybindingEditingService = createDecorator<IKeybindingEditingService>('keybindingEditingService');

export interface IKeybindingEditingService {

	readonly _serviceBrand: undefined;

	addKeybinding(keybindingItem: ResolvedKeybindingItem, key: string, when: string | undefined): Promise<void>;

	editKeybinding(keybindingItem: ResolvedKeybindingItem, key: string, when: string | undefined): Promise<void>;

	removeKeybinding(keybindingItem: ResolvedKeybindingItem): Promise<void>;

	resetKeybinding(keybindingItem: ResolvedKeybindingItem): Promise<void>;
}

export class KeybindingsEditingService extends Disposable implements IKeybindingEditingService {

	public _serviceBrand: undefined;
	private queue: Queue<void>;

	constructor(
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
	) {
		super();
		this.queue = new Queue<void>();
	}

	addKeybinding(keybindingItem: ResolvedKeybindingItem, key: string, when: string | undefined): Promise<void> {
		return this.queue.queue(() => this.doEditKeybinding(keybindingItem, key, when, true)); // queue up writes to prevent race conditions
	}

	editKeybinding(keybindingItem: ResolvedKeybindingItem, key: string, when: string | undefined): Promise<void> {
		return this.queue.queue(() => this.doEditKeybinding(keybindingItem, key, when, false)); // queue up writes to prevent race conditions
	}

	resetKeybinding(keybindingItem: ResolvedKeybindingItem): Promise<void> {
		return this.queue.queue(() => this.doResetKeybinding(keybindingItem)); // queue up writes to prevent race conditions
	}

	removeKeybinding(keybindingItem: ResolvedKeybindingItem): Promise<void> {
		return this.queue.queue(() => this.doRemoveKeybinding(keybindingItem)); // queue up writes to prevent race conditions
	}

	private async doEditKeybinding(keybindingItem: ResolvedKeybindingItem, key: string, when: string | undefined, add: boolean): Promise<void> {
		const reference = await this.resolveAndValidate();
		const model = reference.object.textEditorModel;
		if (add) {
			this.updateKeybinding(keybindingItem, key, when, model, -1);
		} else {
			const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
			const userKeybindingEntryIndex = this.findUserKeybindingEntryIndex(keybindingItem, userKeybindingEntries);
			this.updateKeybinding(keybindingItem, key, when, model, userKeybindingEntryIndex);
			if (keybindingItem.isDefault && keybindingItem.resolvedKeybinding) {
				this.removeDefaultKeybinding(keybindingItem, model);
			}
		}
		try {
			await this.save();
		} finally {
			reference.dispose();
		}
	}

	private async doRemoveKeybinding(keybindingItem: ResolvedKeybindingItem): Promise<void> {
		const reference = await this.resolveAndValidate();
		const model = reference.object.textEditorModel;
		if (keybindingItem.isDefault) {
			this.removeDefaultKeybinding(keybindingItem, model);
		} else {
			this.removeUserKeybinding(keybindingItem, model);
		}
		try {
			return await this.save();
		} finally {
			reference.dispose();
		}
	}

	private async doResetKeybinding(keybindingItem: ResolvedKeybindingItem): Promise<void> {
		const reference = await this.resolveAndValidate();
		const model = reference.object.textEditorModel;
		if (!keybindingItem.isDefault) {
			this.removeUserKeybinding(keybindingItem, model);
			this.removeUnassignedDefaultKeybinding(keybindingItem, model);
		}
		try {
			return await this.save();
		} finally {
			reference.dispose();
		}
	}

	private save(): Promise<any> {
		return this.textFileService.save(this.userDataProfileService.currentProfile.keybindingsResource);
	}

	private updateKeybinding(keybindingItem: ResolvedKeybindingItem, newKey: string, when: string | undefined, model: ITextModel, userKeybindingEntryIndex: number): void {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		if (userKeybindingEntryIndex !== -1) {
			// Update the keybinding with new key
			this.applyEditsToBuffer(setProperty(model.getValue(), [userKeybindingEntryIndex, 'key'], newKey, { tabSize, insertSpaces, eol })[0], model);
			const edits = setProperty(model.getValue(), [userKeybindingEntryIndex, 'when'], when, { tabSize, insertSpaces, eol });
			if (edits.length > 0) {
				this.applyEditsToBuffer(edits[0], model);
			}
		} else {
			// Add the new keybinding with new key
			this.applyEditsToBuffer(setProperty(model.getValue(), [-1], this.asObject(newKey, keybindingItem.command, when, false), { tabSize, insertSpaces, eol })[0], model);
		}
	}

	private removeUserKeybinding(keybindingItem: ResolvedKeybindingItem, model: ITextModel): void {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const userKeybindingEntryIndex = this.findUserKeybindingEntryIndex(keybindingItem, userKeybindingEntries);
		if (userKeybindingEntryIndex !== -1) {
			this.applyEditsToBuffer(setProperty(model.getValue(), [userKeybindingEntryIndex], undefined, { tabSize, insertSpaces, eol })[0], model);
		}
	}

	private removeDefaultKeybinding(keybindingItem: ResolvedKeybindingItem, model: ITextModel): void {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		const key = keybindingItem.resolvedKeybinding ? keybindingItem.resolvedKeybinding.getUserSettingsLabel() : null;
		if (key) {
			const entry: IUserFriendlyKeybinding = this.asObject(key, keybindingItem.command, keybindingItem.when ? keybindingItem.when.serialize() : undefined, true);
			const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
			if (userKeybindingEntries.every(e => !this.areSame(e, entry))) {
				this.applyEditsToBuffer(setProperty(model.getValue(), [-1], entry, { tabSize, insertSpaces, eol })[0], model);
			}
		}
	}

	private removeUnassignedDefaultKeybinding(keybindingItem: ResolvedKeybindingItem, model: ITextModel): void {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		const userKeybindingEntries = <IUserFriendlyKeybinding[]>json.parse(model.getValue());
		const indices = this.findUnassignedDefaultKeybindingEntryIndex(keybindingItem, userKeybindingEntries).reverse();
		for (const index of indices) {
			this.applyEditsToBuffer(setProperty(model.getValue(), [index], undefined, { tabSize, insertSpaces, eol })[0], model);
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
					const contextKeyExpr = ContextKeyExpr.deserialize(keybinding.when);
					if (contextKeyExpr && contextKeyExpr.serialize() === keybindingItem.when.serialize()) {
						return index;
					}
				}
			}
		}
		return -1;
	}

	private findUnassignedDefaultKeybindingEntryIndex(keybindingItem: ResolvedKeybindingItem, userKeybindingEntries: IUserFriendlyKeybinding[]): number[] {
		const indices: number[] = [];
		for (let index = 0; index < userKeybindingEntries.length; index++) {
			if (userKeybindingEntries[index].command === `-${keybindingItem.command}`) {
				indices.push(index);
			}
		}
		return indices;
	}

	private asObject(key: string, command: string | null, when: string | undefined, negate: boolean): any {
		const object: any = { key };
		if (command) {
			object['command'] = negate ? `-${command}` : command;
		}
		if (when) {
			object['when'] = when;
		}
		return object;
	}

	private areSame(a: IUserFriendlyKeybinding, b: IUserFriendlyKeybinding): boolean {
		if (a.command !== b.command) {
			return false;
		}
		if (a.key !== b.key) {
			return false;
		}
		const whenA = ContextKeyExpr.deserialize(a.when);
		const whenB = ContextKeyExpr.deserialize(b.when);
		if ((whenA && !whenB) || (!whenA && whenB)) {
			return false;
		}
		if (whenA && whenB && !whenA.equals(whenB)) {
			return false;
		}
		if (!objects.equals(a.args, b.args)) {
			return false;
		}
		return true;
	}

	private applyEditsToBuffer(edit: Edit, model: ITextModel): void {
		const startPosition = model.getPositionAt(edit.offset);
		const endPosition = model.getPositionAt(edit.offset + edit.length);
		const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		const currentText = model.getValueInRange(range);
		const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
		model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
	}

	private async resolveModelReference(): Promise<IReference<IResolvedTextEditorModel>> {
		const exists = await this.fileService.exists(this.userDataProfileService.currentProfile.keybindingsResource);
		if (!exists) {
			await this.textFileService.write(this.userDataProfileService.currentProfile.keybindingsResource, this.getEmptyContent(), { encoding: 'utf8' });
		}
		return this.textModelResolverService.createModelReference(this.userDataProfileService.currentProfile.keybindingsResource);
	}

	private async resolveAndValidate(): Promise<IReference<IResolvedTextEditorModel>> {

		// Target cannot be dirty if not writing into buffer
		if (this.textFileService.isDirty(this.userDataProfileService.currentProfile.keybindingsResource)) {
			throw new Error(localize('errorKeybindingsFileDirty', "Unable to write because the keybindings configuration file has unsaved changes. Please save it first and then try again."));
		}

		const reference = await this.resolveModelReference();
		const model = reference.object.textEditorModel;
		const EOL = model.getEOL();
		if (model.getValue()) {
			const parsed = this.parse(model);
			if (parsed.parseErrors.length) {
				reference.dispose();
				throw new Error(localize('parseErrors', "Unable to write to the keybindings configuration file. Please open it to correct errors/warnings in the file and try again."));
			}
			if (parsed.result) {
				if (!Array.isArray(parsed.result)) {
					reference.dispose();
					throw new Error(localize('errorInvalidConfiguration', "Unable to write to the keybindings configuration file. It has an object which is not of type Array. Please open the file to clean up and try again."));
				}
			} else {
				const content = EOL + '[]';
				this.applyEditsToBuffer({ content, length: content.length, offset: model.getValue().length }, model);
			}
		} else {
			const content = this.getEmptyContent();
			this.applyEditsToBuffer({ content, length: content.length, offset: 0 }, model);
		}
		return reference;
	}

	private parse(model: ITextModel): { result: IUserFriendlyKeybinding[]; parseErrors: json.ParseError[] } {
		const parseErrors: json.ParseError[] = [];
		const result = json.parse(model.getValue(), parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
		return { result, parseErrors };
	}

	private getEmptyContent(): string {
		return '// ' + localize('emptyKeybindingsHeader', "Place your key bindings in this file to override the defaults") + '\n[\n]';
	}
}

registerSingleton(IKeybindingEditingService, KeybindingsEditingService, InstantiationType.Delayed);
