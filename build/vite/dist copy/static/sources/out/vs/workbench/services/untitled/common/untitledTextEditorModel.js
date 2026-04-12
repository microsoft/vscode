/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var UntitledTextEditorModel_1;
import { BaseTextEditorModel } from '../../../common/editor/textEditorModel.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Emitter } from '../../../../base/common/event.js';
import { IWorkingCopyBackupService } from '../../workingCopy/common/workingCopyBackup.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { createTextBufferFactory, createTextBufferFactoryFromStream } from '../../../../editor/common/model/textModel.js';
import { IWorkingCopyService } from '../../workingCopy/common/workingCopyService.js';
import { NO_TYPE_ID } from '../../workingCopy/common/workingCopy.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ensureValidWordDefinition } from '../../../../editor/common/core/wordHelper.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { getCharContainingOffset } from '../../../../base/common/strings.js';
import { UTF8 } from '../../textfile/common/encoding.js';
import { bufferToReadable, bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { ILanguageDetectionService } from '../../languageDetection/common/languageDetectionWorkerService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
let UntitledTextEditorModel = class UntitledTextEditorModel extends BaseTextEditorModel {
    static { UntitledTextEditorModel_1 = this; }
    static { this.FIRST_LINE_NAME_MAX_LENGTH = 40; }
    static { this.FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH = this.FIRST_LINE_NAME_MAX_LENGTH * 10; }
    // Support the special '${activeEditorLanguage}' language by
    // looking up the language id from the editor that is active
    // before the untitled editor opens. This special id is only
    // used for the initial language and can be changed after the
    // fact (either manually or through auto-detection).
    static { this.ACTIVE_EDITOR_LANGUAGE_ID = '${activeEditorLanguage}'; }
    get name() {
        // Take name from first line if present and only if
        // we have no associated file path. In that case we
        // prefer the file name as title.
        if (this.configuredLabelFormat === 'content' && !this.hasAssociatedFilePath && this.cachedModelFirstLineWords) {
            return this.cachedModelFirstLineWords;
        }
        // Otherwise fallback to resource
        return this.labelService.getUriBasenameLabel(this.resource);
    }
    //#endregion
    constructor(resource, hasAssociatedFilePath, initialValue, preferredLanguageId, preferredEncoding, languageService, modelService, workingCopyBackupService, textResourceConfigurationService, workingCopyService, textFileService, labelService, editorService, languageDetectionService, accessibilityService) {
        super(modelService, languageService, languageDetectionService, accessibilityService);
        this.resource = resource;
        this.hasAssociatedFilePath = hasAssociatedFilePath;
        this.initialValue = initialValue;
        this.preferredLanguageId = preferredLanguageId;
        this.preferredEncoding = preferredEncoding;
        this.workingCopyBackupService = workingCopyBackupService;
        this.textResourceConfigurationService = textResourceConfigurationService;
        this.workingCopyService = workingCopyService;
        this.textFileService = textFileService;
        this.labelService = labelService;
        this.editorService = editorService;
        //#region Events
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidChangeName = this._register(new Emitter());
        this.onDidChangeName = this._onDidChangeName.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidChangeEncoding = this._register(new Emitter());
        this.onDidChangeEncoding = this._onDidChangeEncoding.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._onDidRevert = this._register(new Emitter());
        this.onDidRevert = this._onDidRevert.event;
        //#endregion
        this.typeId = NO_TYPE_ID; // IMPORTANT: never change this to not break existing assumptions (e.g. backups)
        this.capabilities = 2 /* WorkingCopyCapabilities.Untitled */;
        //#region Name
        this.configuredLabelFormat = 'content';
        this.cachedModelFirstLineWords = undefined;
        //#endregion
        //#region Resolve
        this.ignoreDirtyOnModelContentChange = false;
        this.dirty = this.hasAssociatedFilePath || !!this.initialValue;
        // Make known to working copy service
        this._register(this.workingCopyService.registerWorkingCopy(this));
        // This is typically controlled by the setting `files.defaultLanguage`.
        // If that setting is set, we should not detect the language.
        if (preferredLanguageId) {
            this.setLanguageId(preferredLanguageId);
        }
        // Fetch config
        this.onConfigurationChange(undefined, false);
        this.registerListeners();
    }
    registerListeners() {
        // Config Changes
        this._register(this.textResourceConfigurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e, true)));
    }
    onConfigurationChange(e, fromEvent) {
        // Encoding
        if (!e || e.affectsConfiguration(this.resource, 'files.encoding')) {
            const configuredEncoding = this.textResourceConfigurationService.getValue(this.resource, 'files.encoding');
            if (this.configuredEncoding !== configuredEncoding && typeof configuredEncoding === 'string') {
                this.configuredEncoding = configuredEncoding;
                if (fromEvent && !this.preferredEncoding) {
                    this._onDidChangeEncoding.fire(); // do not fire event if we have a preferred encoding set
                }
            }
        }
        // Label Format
        if (!e || e.affectsConfiguration(this.resource, 'workbench.editor.untitled.labelFormat')) {
            const configuredLabelFormat = this.textResourceConfigurationService.getValue(this.resource, 'workbench.editor.untitled.labelFormat');
            if (this.configuredLabelFormat !== configuredLabelFormat && (configuredLabelFormat === 'content' || configuredLabelFormat === 'name')) {
                this.configuredLabelFormat = configuredLabelFormat;
                if (fromEvent) {
                    this._onDidChangeName.fire();
                }
            }
        }
    }
    //#region Language
    setLanguageId(languageId, source) {
        const actualLanguage = languageId === UntitledTextEditorModel_1.ACTIVE_EDITOR_LANGUAGE_ID
            ? this.editorService.activeTextEditorLanguageId
            : languageId;
        this.preferredLanguageId = actualLanguage;
        if (actualLanguage) {
            super.setLanguageId(actualLanguage, source);
        }
    }
    getLanguageId() {
        if (this.textEditorModel) {
            return this.textEditorModel.getLanguageId();
        }
        return this.preferredLanguageId;
    }
    getEncoding() {
        return this.preferredEncoding || this.configuredEncoding;
    }
    async setEncoding(encoding) {
        const oldEncoding = this.getEncoding();
        this.preferredEncoding = encoding;
        // Emit if it changed
        if (oldEncoding !== this.preferredEncoding) {
            this._onDidChangeEncoding.fire();
        }
    }
    isDirty() {
        return this.dirty;
    }
    isModified() {
        return this.isDirty();
    }
    setDirty(dirty) {
        if (this.dirty === dirty) {
            return;
        }
        this.dirty = dirty;
        this._onDidChangeDirty.fire();
    }
    //#endregion
    //#region Save / Revert / Backup
    async save(options) {
        const target = await this.textFileService.save(this.resource, options);
        // Emit as event
        if (target) {
            this._onDidSave.fire({ reason: options?.reason, source: options?.source });
        }
        return !!target;
    }
    async revert() {
        // Reset contents to be empty
        this.ignoreDirtyOnModelContentChange = true;
        try {
            this.updateTextEditorModel(createTextBufferFactory(''));
        }
        finally {
            this.ignoreDirtyOnModelContentChange = false;
        }
        // No longer dirty
        this.setDirty(false);
        // Emit as event
        this._onDidRevert.fire();
    }
    async backup(token) {
        let content = undefined;
        // Make sure to check whether this model has been resolved
        // or not and fallback to the initial value - if any - to
        // prevent backing up an unresolved model and loosing the
        // initial value.
        if (this.isResolved()) {
            // Fill in content the same way we would do when saving the file
            // via the text file service encoding support (hardcode UTF-8)
            content = await this.textFileService.getEncodedReadable(this.resource, this.createSnapshot() ?? undefined, { encoding: UTF8 });
        }
        else if (typeof this.initialValue === 'string') {
            content = bufferToReadable(VSBuffer.fromString(this.initialValue));
        }
        return { content };
    }
    async resolve() {
        // Create text editor model if not yet done
        let createdUntitledModel = false;
        let hasBackup = false;
        if (!this.textEditorModel) {
            let untitledContents;
            // Check for backups or use initial value or empty
            const backup = await this.workingCopyBackupService.resolve(this);
            if (backup) {
                untitledContents = backup.value;
                hasBackup = true;
            }
            else {
                untitledContents = bufferToStream(VSBuffer.fromString(this.initialValue || ''));
            }
            // Determine untitled contents based on backup
            // or initial value. We must use text file service
            // to create the text factory to respect encodings
            // accordingly.
            const untitledContentsFactory = await createTextBufferFactoryFromStream(await this.textFileService.getDecodedStream(this.resource, untitledContents, { encoding: UTF8 }));
            this.createTextEditorModel(untitledContentsFactory, this.resource, this.preferredLanguageId);
            createdUntitledModel = true;
        }
        // Otherwise: the untitled model already exists and we must assume
        // that the value of the model was changed by the user. As such we
        // do not update the contents, only the language if configured.
        else {
            this.updateTextEditorModel(undefined, this.preferredLanguageId);
        }
        // Listen to text model events
        const textEditorModel = assertReturnsDefined(this.textEditorModel);
        this.installModelListeners(textEditorModel);
        // Only adjust name and dirty state etc. if we
        // actually created the untitled model
        if (createdUntitledModel) {
            // Name
            if (hasBackup || this.initialValue) {
                this.updateNameFromFirstLine(textEditorModel);
            }
            // Untitled associated to file path are dirty right away as well as untitled with content
            this.setDirty(this.hasAssociatedFilePath || !!hasBackup || !!this.initialValue);
            // If we have initial contents, make sure to emit this
            // as the appropiate events to the outside.
            if (hasBackup || this.initialValue) {
                this._onDidChangeContent.fire();
            }
        }
        return super.resolve();
    }
    isResolved() {
        return !!this.textEditorModelHandle;
    }
    installModelListeners(model) {
        this._register(model.onDidChangeContent(e => this.onModelContentChanged(model, e)));
        this._register(model.onDidChangeLanguage(() => this.onConfigurationChange(undefined, true))); // language change can have impact on config
        super.installModelListeners(model);
    }
    onModelContentChanged(textEditorModel, e) {
        if (!this.ignoreDirtyOnModelContentChange) {
            // mark the untitled text editor as non-dirty once its content becomes empty and we do
            // not have an associated path set. we never want dirty indicator in that case.
            if (!this.hasAssociatedFilePath && textEditorModel.getLineCount() === 1 && textEditorModel.getLineLength(1) === 0) {
                this.setDirty(false);
            }
            // turn dirty otherwise
            else {
                this.setDirty(true);
            }
        }
        // Check for name change if first line changed in the range of 0-FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH columns
        if (e.changes.some(change => (change.range.startLineNumber === 1 || change.range.endLineNumber === 1) && change.range.startColumn <= UntitledTextEditorModel_1.FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH)) {
            this.updateNameFromFirstLine(textEditorModel);
        }
        // Emit as general content change event
        this._onDidChangeContent.fire();
        // Detect language from content
        this.autoDetectLanguage();
    }
    updateNameFromFirstLine(textEditorModel) {
        if (this.hasAssociatedFilePath) {
            return; // not in case of an associated file path
        }
        // Determine the first words of the model following these rules:
        // - cannot be only whitespace (so we trim())
        // - cannot be only non-alphanumeric characters (so we run word definition regex over it)
        // - cannot be longer than FIRST_LINE_MAX_TITLE_LENGTH
        // - normalize multiple whitespaces to a single whitespace
        let modelFirstWordsCandidate = undefined;
        let firstLineText = textEditorModel
            .getValueInRange({
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 1,
            endColumn: UntitledTextEditorModel_1.FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH + 1 // first cap at FIRST_LINE_NAME_CANDIDATE_MAX_LENGTH
        })
            .trim().replace(/\s+/g, ' ') // normalize whitespaces
            .replace(/\u202E/g, ''); // drop Right-to-Left Override character (#190133)
        firstLineText = firstLineText.substr(0, getCharContainingOffset(// finally cap at FIRST_LINE_NAME_MAX_LENGTH (grapheme aware #111235)
        firstLineText, UntitledTextEditorModel_1.FIRST_LINE_NAME_MAX_LENGTH)[0]);
        if (firstLineText && ensureValidWordDefinition().exec(firstLineText)) {
            modelFirstWordsCandidate = firstLineText;
        }
        if (modelFirstWordsCandidate !== this.cachedModelFirstLineWords) {
            this.cachedModelFirstLineWords = modelFirstWordsCandidate;
            this._onDidChangeName.fire();
        }
    }
    //#endregion
    isReadonly() {
        return false;
    }
};
UntitledTextEditorModel = UntitledTextEditorModel_1 = __decorate([
    __param(5, ILanguageService),
    __param(6, IModelService),
    __param(7, IWorkingCopyBackupService),
    __param(8, ITextResourceConfigurationService),
    __param(9, IWorkingCopyService),
    __param(10, ITextFileService),
    __param(11, ILabelService),
    __param(12, IEditorService),
    __param(13, ILanguageDetectionService),
    __param(14, IAccessibilityService)
], UntitledTextEditorModel);
export { UntitledTextEditorModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW50aXRsZWRUZXh0RWRpdG9yTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvck1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVoRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFTLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFGLE9BQU8sRUFBeUMsaUNBQWlDLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUUzSixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUUxSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNyRixPQUFPLEVBQTZELFVBQVUsRUFBeUIsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2SixPQUFPLEVBQXNDLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFMUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV0RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxv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