/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import errors = require('vs/base/common/errors');
import {TextFileChangeEvent, EventType} from 'vs/workbench/parts/files/common/files';
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {IPosition, IEditorSelection, IModel} from 'vs/editor/common/editorCommon';
import {Selection} from 'vs/editor/common/core/selection';
import {trimTrailingWhitespace} from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
export class SaveParticipant implements IWorkbenchContribution {
	private trimTrailingWhitespace: boolean;

	private toUnbind: { (): void; }[];

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IEventService private eventService: IEventService,
		@ICodeEditorService private codeEditorService: ICodeEditorService
	) {
		this.toUnbind = [];
		this.trimTrailingWhitespace = false;

		this.registerListeners();
		this.loadConfiguration();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.eventService.addListener(EventType.FILE_SAVING, (e: TextFileChangeEvent) => this.onTextFileSaving(e)));
		this.toUnbind.push(this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.onConfigurationChange(e.config)));
	}

	private loadConfiguration(): void {
		this.configurationService.loadConfiguration().done((configuration: IFilesConfiguration) => {
			this.onConfigurationChange(configuration);
		}, errors.onUnexpectedError);
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
			this.doTrimTrailingWhitespace(e.model);
		}
	}

	/**
	 * Trim trailing whitespace on a model and ignore lines on which cursors are sitting.
	 */
	private doTrimTrailingWhitespace(model: IModel): void {
		let prevSelection: IEditorSelection[] = [Selection.createSelection(1, 1, 1, 1)],
			cursors: IPosition[] = [];

		if (model.isAttachedToEditor()) {
			// Try to find all editors the current model is attached to
			let allEditors = this.codeEditorService.listCodeEditors();
			for (let i = 0, len = allEditors.length; i < len; i++) {
				let editor = allEditors[i];
				let editorModel = editor.getModel();

				if (!editorModel) {
					// empty editor
					continue;
				}

				if (model === editorModel) {
					// bingo!
					prevSelection = editor.getSelections();
					cursors.push(...prevSelection.map(s => {
						return {
							lineNumber: s.positionLineNumber,
							column: s.positionColumn
						};
					}));
				}
			}
		}

		let ops = trimTrailingWhitespace(model, cursors);
		if (!ops.length) {
			// Nothing to do
			return;
		}

		model.pushEditOperations(prevSelection, ops, (edits) => prevSelection);
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}
}