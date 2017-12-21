/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { AbstractTextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import URI from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { LOG_SCHEME } from 'vs/workbench/parts/output/common/output';

export const LOG_VIEWER_EDITOR_ID = 'workbench.editors.logViewer';

export class LogViewerInput extends ResourceEditorInput {

	public static readonly ID = 'workbench.editorinputs.output';

	constructor(private file: URI,
		@ITextModelService textModelResolverService: ITextModelService,
		@IHashService hashService: IHashService
	) {
		super(paths.basename(file.fsPath), paths.dirname(file.fsPath), file.with({ scheme: LOG_SCHEME }), textModelResolverService, hashService);
	}

	public getTypeId(): string {
		return LogViewerInput.ID;
	}

	public getResource(): URI {
		return this.file;
	}
}

export class LogViewer extends AbstractTextResourceEditor {

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService baseConfigurationService: IConfigurationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ITextFileService textFileService: ITextFileService
	) {
		super(LOG_VIEWER_EDITOR_ID, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, textFileService);
	}

	public getId(): string {
		return LOG_VIEWER_EDITOR_ID;
	}

	protected getConfigurationOverrides(): IEditorOptions {
		const options = super.getConfigurationOverrides();
		options.wordWrap = 'off'; // all log viewers do not wrap
		options.folding = false;
		options.scrollBeyondLastLine = false;
		return options;
	}
}
