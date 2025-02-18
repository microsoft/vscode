/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from '../../../../../base/common/lifecycle.js';
import { ITransaction } from '../../../../../base/common/observable.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { SaveReason } from '../../../../common/editor.js';
import { IResolvedTextFileEditorModel, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ChatEditKind } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingModifiedFileEntry, IModifiedEntryTelemetryInfo } from './chatEditingModifiedFileEntry.js';

export class ChatEditingModifiedNotebookEntry extends ChatEditingModifiedFileEntry {
	private readonly resolveTextFileEditorModel: IResolvedTextFileEditorModel;

	constructor(
		resourceRef: IReference<IResolvedTextEditorModel>,
		_multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		_telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string | undefined,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IChatService _chatService: IChatService,
		@IEditorWorkerService _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService _undoRedoService: IUndoRedoService,
		@IFileService _fileService: IFileService,
		@IConfigurationService configService: IConfigurationService,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IInstantiationService instaService: IInstantiationService
	) {
		super(resourceRef, _multiDiffEntryDelegate, _telemetryInfo, kind, initialContent, modelService, textModelService, languageService, configService, _chatService, _editorWorkerService, _undoRedoService, _fileService, textFileService, labelService, instaService);
		this.resolveTextFileEditorModel = resourceRef.object as IResolvedTextFileEditorModel;
	}

	async saveMirrorDocument(): Promise<void> {
		await this.resolveTextFileEditorModel.save({ reason: SaveReason.EXPLICIT, ignoreModifiedSince: true });
	}

	async revertMirrorDocument(): Promise<void> {
		await this.resolveTextFileEditorModel.revert({ soft: true });
	}
}
