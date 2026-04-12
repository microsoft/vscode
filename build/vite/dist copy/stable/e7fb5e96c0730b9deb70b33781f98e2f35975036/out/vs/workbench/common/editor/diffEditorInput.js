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
var DiffEditorInput_1;
import { localize } from '../../../nls.js';
import { AbstractSideBySideEditorInputSerializer, SideBySideEditorInput } from './sideBySideEditorInput.js';
import { TEXT_DIFF_EDITOR_ID, BINARY_DIFF_EDITOR_ID, isResourceDiffEditorInput } from '../editor.js';
import { BaseTextEditorModel } from './textEditorModel.js';
import { DiffEditorModel } from './diffEditorModel.js';
import { TextDiffEditorModel } from './textDiffEditorModel.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { shorten } from '../../../base/common/labels.js';
import { isResolvedEditorModel } from '../../../platform/editor/common/editor.js';
/**
 * The base editor input for the diff editor. It is made up of two editor inputs, the original version
 * and the modified version.
 */
let DiffEditorInput = class DiffEditorInput extends SideBySideEditorInput {
    static { DiffEditorInput_1 = this; }
    static { this.ID = 'workbench.editors.diffEditorInput'; }
    get typeId() {
        return DiffEditorInput_1.ID;
    }
    get editorId() {
        return this.modified.editorId === this.original.editorId ? this.modified.editorId : undefined;
    }
    get capabilities() {
        let capabilities = super.capabilities;
        // Force description capability depends on labels
        if (this.labels.forceDescription) {
            capabilities |= 64 /* EditorInputCapabilities.ForceDescription */;
        }
        return capabilities;
    }
    constructor(preferredName, preferredDescription, original, modified, forceOpenAsBinary, editorService) {
        super(preferredName, preferredDescription, original, modified, editorService);
        this.original = original;
        this.modified = modified;
        this.forceOpenAsBinary = forceOpenAsBinary;
        this.cachedModel = undefined;
        this.labels = this.computeLabels();
    }
    computeLabels() {
        // Name
        let name;
        let forceDescription = false;
        if (this.preferredName) {
            name = this.preferredName;
        }
        else {
            const originalName = this.original.getName();
            const modifiedName = this.modified.getName();
            name = localize('sideBySideLabels', "{0} ↔ {1}", originalName, modifiedName);
            // Enforce description when the names are identical
            forceDescription = originalName === modifiedName;
        }
        // Description
        let shortDescription;
        let mediumDescription;
        let longDescription;
        if (this.preferredDescription) {
            shortDescription = this.preferredDescription;
            mediumDescription = this.preferredDescription;
            longDescription = this.preferredDescription;
        }
        else {
            shortDescription = this.computeLabel(this.original.getDescription(0 /* Verbosity.SHORT */), this.modified.getDescription(0 /* Verbosity.SHORT */));
            longDescription = this.computeLabel(this.original.getDescription(2 /* Verbosity.LONG */), this.modified.getDescription(2 /* Verbosity.LONG */));
            // Medium Description: try to be verbose by computing
            // a label that resembles the difference between the two
            const originalMediumDescription = this.original.getDescription(1 /* Verbosity.MEDIUM */);
            const modifiedMediumDescription = this.modified.getDescription(1 /* Verbosity.MEDIUM */);
            if ((typeof originalMediumDescription === 'string' && typeof modifiedMediumDescription === 'string') && // we can only `shorten` when both sides are strings...
                (originalMediumDescription || modifiedMediumDescription) // ...however never when both sides are empty strings
            ) {
                const [shortenedOriginalMediumDescription, shortenedModifiedMediumDescription] = shorten([originalMediumDescription, modifiedMediumDescription]);
                mediumDescription = this.computeLabel(shortenedOriginalMediumDescription, shortenedModifiedMediumDescription);
            }
        }
        // Title
        let shortTitle = this.computeLabel(this.original.getTitle(0 /* Verbosity.SHORT */) ?? this.original.getName(), this.modified.getTitle(0 /* Verbosity.SHORT */) ?? this.modified.getName(), ' ↔ ');
        let mediumTitle = this.computeLabel(this.original.getTitle(1 /* Verbosity.MEDIUM */) ?? this.original.getName(), this.modified.getTitle(1 /* Verbosity.MEDIUM */) ?? this.modified.getName(), ' ↔ ');
        let longTitle = this.computeLabel(this.original.getTitle(2 /* Verbosity.LONG */) ?? this.original.getName(), this.modified.getTitle(2 /* Verbosity.LONG */) ?? this.modified.getName(), ' ↔ ');
        const preferredTitle = this.getPreferredTitle();
        if (preferredTitle) {
            shortTitle = `${preferredTitle} (${shortTitle})`;
            mediumTitle = `${preferredTitle} (${mediumTitle})`;
            longTitle = `${preferredTitle} (${longTitle})`;
        }
        return { name, shortDescription, mediumDescription, longDescription, forceDescription, shortTitle, mediumTitle, longTitle };
    }
    computeLabel(originalLabel, modifiedLabel, separator = ' - ') {
        if (!originalLabel || !modifiedLabel) {
            return undefined;
        }
        if (originalLabel === modifiedLabel) {
            return modifiedLabel;
        }
        return `${originalLabel}${separator}${modifiedLabel}`;
    }
    getName() {
        return this.labels.name;
    }
    getDescription(verbosity = 1 /* Verbosity.MEDIUM */) {
        switch (verbosity) {
            case 0 /* Verbosity.SHORT */:
                return this.labels.shortDescription;
            case 2 /* Verbosity.LONG */:
                return this.labels.longDescription;
            case 1 /* Verbosity.MEDIUM */:
            default:
                return this.labels.mediumDescription;
        }
    }
    getTitle(verbosity) {
        switch (verbosity) {
            case 0 /* Verbosity.SHORT */:
                return this.labels.shortTitle;
            case 2 /* Verbosity.LONG */:
                return this.labels.longTitle;
            default:
            case 1 /* Verbosity.MEDIUM */:
                return this.labels.mediumTitle;
        }
    }
    async resolve() {
        // Create Model - we never reuse our cached model if refresh is true because we cannot
        // decide for the inputs within if the cached model can be reused or not. There may be
        // inputs that need to be loaded again and thus we always recreate the model and dispose
        // the previous one - if any.
        const resolvedModel = await this.createModel();
        this.cachedModel?.dispose();
        this.cachedModel = resolvedModel;
        return this.cachedModel;
    }
    prefersEditorPane(editorPanes) {
        if (this.forceOpenAsBinary) {
            return editorPanes.find(editorPane => editorPane.typeId === BINARY_DIFF_EDITOR_ID);
        }
        return editorPanes.find(editorPane => editorPane.typeId === TEXT_DIFF_EDITOR_ID);
    }
    async createModel() {
        // Join resolve call over two inputs and build diff editor model
        const [originalEditorModel, modifiedEditorModel] = await Promise.all([
            this.original.resolve(),
            this.modified.resolve()
        ]);
        // If both are text models, return textdiffeditor model
        if (modifiedEditorModel instanceof BaseTextEditorModel && originalEditorModel instanceof BaseTextEditorModel) {
            return new TextDiffEditorModel(originalEditorModel, modifiedEditorModel);
        }
        // Otherwise return normal diff model
        return new DiffEditorModel(isResolvedEditorModel(originalEditorModel) ? originalEditorModel : undefined, isResolvedEditorModel(modifiedEditorModel) ? modifiedEditorModel : undefined);
    }
    toUntyped(options) {
        const untyped = super.toUntyped(options);
        if (untyped) {
            return {
                ...untyped,
                modified: untyped.primary,
                original: untyped.secondary
            };
        }
        return undefined;
    }
    matches(otherInput) {
        if (this === otherInput) {
            return true;
        }
        if (otherInput instanceof DiffEditorInput_1) {
            return this.modified.matches(otherInput.modified) && this.original.matches(otherInput.original) && otherInput.forceOpenAsBinary === this.forceOpenAsBinary;
        }
        if (isResourceDiffEditorInput(otherInput)) {
            return this.modified.matches(otherInput.modified) && this.original.matches(otherInput.original);
        }
        return false;
    }
    dispose() {
        // Free the diff editor model but do not propagate the dispose() call to the two inputs
        // We never created the two inputs (original and modified) so we can not dispose
        // them without sideeffects.
        if (this.cachedModel) {
            this.cachedModel.dispose();
            this.cachedModel = undefined;
        }
        super.dispose();
    }
};
DiffEditorInput = DiffEditorInput_1 = __decorate([
    __param(5, IEditorService)
], DiffEditorInput);
export { DiffEditorInput };
export class DiffEditorInputSerializer extends AbstractSideBySideEditorInputSerializer {
    createEditorInput(instantiationService, name, description, secondaryInput, primaryInput) {
        return instantiationService.createInstance(DiffEditorInput, name, description, secondaryInput, primaryInput, undefined);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvcklucHV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFHNUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUE0Rix5QkFBeUIsRUFBNkUsTUFBTSxjQUFjLENBQUM7QUFDMVEsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDM0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRS9ELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDekQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFnQmxGOzs7R0FHRztBQUNJLElBQU0sZUFBZSxHQUFyQixNQUFNLGVBQWdCLFNBQVEscUJBQXFCOzthQUVoQyxPQUFFLEdBQVcsbUNBQW1DLEFBQTlDLENBQStDO0lBRTFFLElBQWEsTUFBTTtRQUNsQixPQUFPLGlCQUFlLENBQUMsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxJQUFhLFFBQVE7UUFDcEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEs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