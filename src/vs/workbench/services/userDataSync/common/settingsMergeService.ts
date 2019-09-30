/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { parse, findNodeAtLocation, parseTree } from 'vs/base/common/json';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModel } from 'vs/editor/common/model';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Position } from 'vs/editor/common/core/position';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ISettingsMergeService } from 'vs/platform/userDataSync/common/userDataSync';
import { values } from 'vs/base/common/map';
import { IStringDictionary } from 'vs/base/common/collections';

class SettingsMergeService implements ISettingsMergeService {

	_serviceBrand: undefined;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) { }

	async merge(localContent: string, remoteContent: string, baseContent: string | null, ignoredSettings: string[]): Promise<{ mergeContent: string, hasChanges: boolean, hasConflicts: boolean }> {
		const local = parse(localContent);
		const remote = parse(remoteContent);
		const base = baseContent ? parse(baseContent) : null;
		const ignored = ignoredSettings.reduce((set, key) => { set.add(key); return set; }, new Set<string>());

		const localToRemote = this.compare(local, remote, ignored);
		if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
			// No changes found between local and remote.
			return { mergeContent: localContent, hasChanges: false, hasConflicts: false };
		}

		const conflicts: Set<string> = new Set<string>();
		const baseToLocal = base ? this.compare(base, local, ignored) : { added: Object.keys(local).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		const baseToRemote = base ? this.compare(base, remote, ignored) : { added: Object.keys(remote).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		const settingsPreviewModel = this.modelService.createModel(localContent, this.modeService.create('jsonc'));

		// Removed settings in Local
		for (const key of values(baseToLocal.removed)) {
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				conflicts.add(key);
			}
		}

		// Removed settings in Remote
		for (const key of values(baseToRemote.removed)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				conflicts.add(key);
			} else {
				this.editSetting(settingsPreviewModel, key, undefined);
			}
		}

		// Added settings in Local
		for (const key of values(baseToLocal.added)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got added in remote
			if (baseToRemote.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			}
		}

		// Added settings in remote
		for (const key of values(baseToRemote.added)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got added in local
			if (baseToLocal.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				this.editSetting(settingsPreviewModel, key, remote[key]);
			}
		}

		// Updated settings in Local
		for (const key of values(baseToLocal.updated)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			}
		}

		// Updated settings in Remote
		for (const key of values(baseToRemote.updated)) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				this.editSetting(settingsPreviewModel, key, remote[key]);
			}
		}

		for (const key of values(conflicts)) {
			const tree = parseTree(settingsPreviewModel.getValue());
			const valueNode = findNodeAtLocation(tree, [key]);
			const eol = settingsPreviewModel.getEOL();
			const remoteEdit = setProperty(`{${eol}\t${eol}}`, [key], remote[key], { tabSize: 4, insertSpaces: false, eol: eol })[0];
			const remoteContent = remoteEdit ? `${remoteEdit.content.substring(remoteEdit.offset + remoteEdit.length + 1)},${eol}` : '';
			if (valueNode) {
				// Updated in Local and Remote with different value
				const keyPosition = settingsPreviewModel.getPositionAt(valueNode.parent!.offset);
				const valuePosition = settingsPreviewModel.getPositionAt(valueNode.offset + valueNode.length);
				const editOperations = [
					EditOperation.insert(new Position(keyPosition.lineNumber - 1, settingsPreviewModel.getLineMaxColumn(keyPosition.lineNumber - 1)), `${eol}<<<<<<< local`),
					EditOperation.insert(new Position(valuePosition.lineNumber, settingsPreviewModel.getLineMaxColumn(valuePosition.lineNumber)), `${eol}=======${eol}${remoteContent}>>>>>>> remote`)
				];
				settingsPreviewModel.pushEditOperations([new Selection(keyPosition.lineNumber, keyPosition.column, keyPosition.lineNumber, keyPosition.column)], editOperations, () => []);
			} else {
				// Removed in Local, but updated in Remote
				const position = new Position(settingsPreviewModel.getLineCount() - 1, settingsPreviewModel.getLineMaxColumn(settingsPreviewModel.getLineCount() - 1));
				const editOperations = [
					EditOperation.insert(position, `${eol}<<<<<<< local${eol}=======${eol}${remoteContent}>>>>>>> remote`)
				];
				settingsPreviewModel.pushEditOperations([new Selection(position.lineNumber, position.column, position.lineNumber, position.column)], editOperations, () => []);
			}
		}
		return { mergeContent: settingsPreviewModel.getValue(), hasChanges: true, hasConflicts: conflicts.size > 0 };
	}

	async computeRemoteContent(localContent: string, remoteContent: string, ignoredSettings: string[]): Promise<string> {
		const remote = parse(remoteContent);
		const remoteModel = this.modelService.createModel(localContent, this.modeService.create('jsonc'));
		const ignored = ignoredSettings.reduce((set, key) => { set.add(key); return set; }, new Set<string>());
		for (const key of Object.keys(ignoredSettings)) {
			if (ignored.has(key)) {
				this.editSetting(remoteModel, key, undefined);
				this.editSetting(remoteModel, key, remote[key]);
			}
		}
		return remoteModel.getValue();
	}

	private editSetting(model: ITextModel, key: string, value: any | undefined): void {
		const insertSpaces = false;
		const tabSize = 4;
		const eol = model.getEOL();
		const edit = setProperty(model.getValue(), [key], value, { tabSize, insertSpaces, eol })[0];
		if (edit) {
			const startPosition = model.getPositionAt(edit.offset);
			const endPosition = model.getPositionAt(edit.offset + edit.length);
			const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
			let currentText = model.getValueInRange(range);
			if (edit.content !== currentText) {
				const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
				model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
			}
		}
	}

	private compare(from: IStringDictionary<any>, to: IStringDictionary<any>, ignored: Set<string>): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
		const fromKeys = Object.keys(from).filter(key => !ignored.has(key));
		const toKeys = Object.keys(to).filter(key => !ignored.has(key));
		const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const updated: Set<string> = new Set<string>();

		for (const key of fromKeys) {
			if (removed.has(key)) {
				continue;
			}
			const value1 = from[key];
			const value2 = to[key];
			if (!objects.equals(value1, value2)) {
				updated.add(key);
			}
		}

		return { added, removed, updated };
	}

}

registerSingleton(ISettingsMergeService, SettingsMergeService);
