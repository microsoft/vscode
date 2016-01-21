/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import actions = require('vs/base/common/actions');
import builder = require('vs/base/browser/builder');
import {IEditorOptions} from 'vs/editor/common/editorCommon';
import {EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {StringEditor} from 'vs/workbench/browser/parts/editor/stringEditor';
import {OUTPUT_PANEL_ID} from 'vs/workbench/parts/output/common/output';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IModeService} from 'vs/editor/common/services/modeService';

export class OutputPanel extends StringEditor {

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IModeService modeService: IModeService
	) {
		super(OUTPUT_PANEL_ID, telemetryService, instantiationService, contextService, storageService,
			messageService, configurationService, eventService, editorService, modeService);
	}

	public getActions(): actions.IAction[] {
		return [];
	}

	protected getCodeEditorOptions(): IEditorOptions {
		const options = super.getCodeEditorOptions();
		options.wrappingColumn = 0;				// all log editors wrap
		options.lineNumbers = false;				// all log editors hide line numbers

		return options;
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => this.revealLastLine());
	}

	public focus(): void {
		super.focus();
		this.revealLastLine();
	}
}
