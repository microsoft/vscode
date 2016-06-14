/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {TextFileChangeEvent, EventType} from 'vs/workbench/parts/files/common/files';
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {IPosition, IModel} from 'vs/editor/common/editorCommon';
import {Selection} from 'vs/editor/common/core/selection';
import {trimTrailingWhitespace} from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
export class SaveParticipant implements IWorkbenchContribution {
	private trimTrailingWhitespace: boolean;
	private toUnbind: IDisposable[];

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IEventService private eventService: IEventService,
		@ICodeEditorService private codeEditorService: ICodeEditorService
	) {
		this.toUnbind = [];
		this.trimTrailingWhitespace = false;

		this.registerListeners();
		this.onConfigurationChange(this.configurationService.getConfiguration<IFilesConfiguration>());
	}

	private registerListeners(): void {
		this.toUnbind.push(this.eventService.addListener2(EventType.FILE_SAVING, (e: TextFileChangeEvent) => this.onTextFileSaving(e)));
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config)));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		this.trimTrailingWhitespace = configuration && configuration.files && configuration.files.trimTrailingWhitespace;
	}

	public getId(): string {
		return 'vs.files.saveparticipant';
	}

	private onTextFileSaving(e: TextFileChangeEvent): void {

		// Trim Trailing Whitespace if enabled
		if (this.trimTrailingWhitespace) {
			this.doTrimTrailingWhitespace(e.model, e.isAutoSaved);
		}
	}

	/**
	 * Trim trailing whitespace on a model and ignore lines on which cursors are sitting if triggered via auto save.
	 */
	private doTrimTrailingWhitespace(model: IModel, isAutoSaved: boolean): void {
		let prevSelection: Selection[] = [new Selection(1, 1, 1, 1)];
		let cursors: IPosition[] = [];

		// Find `prevSelection` in any case do ensure a good undo stack when pushing the edit
		// Collect active cursors in `cursors` only if `isAutoSaved` to avoid having the cursors jump
		if (model.isAttachedToEditor()) {
			let allEditors = this.codeEditorService.listCodeEditors();
			for (let i = 0, len = allEditors.length; i < len; i++) {
				let editor = allEditors[i];
				let editorModel = editor.getModel();

				if (!editorModel) {
					continue; // empty editor
				}

				if (model === editorModel) {
					prevSelection = editor.getSelections();
					if (isAutoSaved) {
						cursors.push(...prevSelection.map(s => {
							return {
								lineNumber: s.positionLineNumber,
								column: s.positionColumn
							};
						}));
					}
				}
			}
		}

		let ops = trimTrailingWhitespace(model, cursors);
		if (!ops.length) {
			return; // Nothing to do
		}

		model.pushEditOperations(prevSelection, ops, (edits) => prevSelection);
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}