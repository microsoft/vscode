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
var SideBySideEditorInput_1;
import { Event } from '../../../base/common/event.js';
import { localize } from '../../../nls.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { EditorExtensions, isResourceSideBySideEditorInput, isDiffEditorInput, isResourceDiffEditorInput, findViewStateForEditor, isEditorInput, isResourceEditorInput, isResourceMergeEditorInput, isResourceMultiDiffEditorInput } from '../editor.js';
import { EditorInput } from './editorInput.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
/**
 * Side by side editor inputs that have a primary and secondary side.
 */
let SideBySideEditorInput = class SideBySideEditorInput extends EditorInput {
    static { SideBySideEditorInput_1 = this; }
    static { this.ID = 'workbench.editorinputs.sidebysideEditorInput'; }
    get typeId() {
        return SideBySideEditorInput_1.ID;
    }
    get capabilities() {
        // Use primary capabilities as main capabilities...
        let capabilities = this.primary.capabilities;
        // ...with the exception of `CanSplitInGroup` which
        // is only relevant to single editors.
        capabilities &= ~32 /* EditorInputCapabilities.CanSplitInGroup */;
        // Trust: should be considered for both sides
        if (this.secondary.hasCapability(16 /* EditorInputCapabilities.RequiresTrust */)) {
            capabilities |= 16 /* EditorInputCapabilities.RequiresTrust */;
        }
        // Singleton: should be considered for both sides
        if (this.secondary.hasCapability(8 /* EditorInputCapabilities.Singleton */)) {
            capabilities |= 8 /* EditorInputCapabilities.Singleton */;
        }
        // ForceReveal: should be considered for both sides
        if (this.secondary.hasCapability(1024 /* EditorInputCapabilities.ForceReveal */)) {
            capabilities |= 1024 /* EditorInputCapabilities.ForceReveal */;
        }
        // Indicate we show more than one editor
        capabilities |= 256 /* EditorInputCapabilities.MultipleEditors */;
        return capabilities;
    }
    get resource() {
        if (this.hasIdenticalSides) {
            // pretend to be just primary side when being asked for a resource
            // in case both sides are the same. this can help when components
            // want to identify this input among others (e.g. in history).
            return this.primary.resource;
        }
        return undefined;
    }
    constructor(preferredName, preferredDescription, secondary, primary, editorService) {
        super();
        this.preferredName = preferredName;
        this.preferredDescription = preferredDescription;
        this.secondary = secondary;
        this.primary = primary;
        this.editorService = editorService;
        this.hasIdenticalSides = this.primary.matches(this.secondary);
        this.registerListeners();
    }
    registerListeners() {
        // When the primary or secondary input gets disposed, dispose this diff editor input
        this._register(Event.once(Event.any(this.primary.onWillDispose, this.secondary.onWillDispose))(() => {
            if (!this.isDisposed()) {
                this.dispose();
            }
        }));
        // Re-emit some events from the primary side to the outside
        this._register(this.primary.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
        // Re-emit some events from both sides to the outside
        this._register(this.primary.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
        this._register(this.secondary.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
        this._register(this.primary.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
        this._register(this.secondary.onDidChangeLabel(() => this._onDidChangeLabel.fire()));
    }
    getName() {
        const preferredName = this.getPreferredName();
        if (preferredName) {
            return preferredName;
        }
        if (this.hasIdenticalSides) {
            return this.primary.getName(); // keep name concise when same editor is opened side by side
        }
        return localize('sideBySideLabels', "{0} - {1}", this.secondary.getName(), this.primary.getName());
    }
    getPreferredName() {
        return this.preferredName;
    }
    getDescription(verbosity) {
        const preferredDescription = this.getPreferredDescription();
        if (preferredDescription) {
            return preferredDescription;
        }
        if (this.hasIdenticalSides) {
            return this.primary.getDescription(verbosity);
        }
        return super.getDescription(verbosity);
    }
    getPreferredDescription() {
        return this.preferredDescription;
    }
    getTitle(verbosity) {
        let title;
        if (this.hasIdenticalSides) {
            title = this.primary.getTitle(verbosity) ?? this.getName();
        }
        else {
            title = super.getTitle(verbosity);
        }
        const preferredTitle = this.getPreferredTitle();
        if (preferredTitle) {
            title = `${preferredTitle} (${title})`;
        }
        return title;
    }
    getPreferredTitle() {
        if (this.preferredName && this.preferredDescription) {
            return `${this.preferredName} ${this.preferredDescription}`;
        }
        if (this.preferredName || this.preferredDescription) {
            return this.preferredName ?? this.preferredDescription;
        }
        return undefined;
    }
    getLabelExtraClasses() {
        if (this.hasIdenticalSides) {
            return this.primary.getLabelExtraClasses();
        }
        return super.getLabelExtraClasses();
    }
    getAriaLabel() {
        if (this.hasIdenticalSides) {
            return this.primary.getAriaLabel();
        }
        return super.getAriaLabel();
    }
    getTelemetryDescriptor() {
        const descriptor = this.primary.getTelemetryDescriptor();
        return { ...descriptor, ...super.getTelemetryDescriptor() };
    }
    isDirty() {
        return this.primary.isDirty();
    }
    isSaving() {
        return this.primary.isSaving();
    }
    async save(group, options) {
        const primarySaveResult = await this.primary.save(group, options);
        return this.saveResultToEditor(primarySaveResult);
    }
    async saveAs(group, options) {
        const primarySaveResult = await this.primary.saveAs(group, options);
        return this.saveResultToEditor(primarySaveResult);
    }
    saveResultToEditor(primarySaveResult) {
        if (!primarySaveResult || !this.hasIdenticalSides) {
            return primarySaveResult;
        }
        if (this.primary.matches(primarySaveResult)) {
            return this;
        }
        if (primarySaveResult instanceof EditorInput) {
            return new SideBySideEditorInput_1(this.preferredName, this.preferredDescription, primarySaveResult, primarySaveResult, this.editorService);
        }
        if (!isResourceDiffEditorInput(primarySaveResult) && !isResourceMultiDiffEditorInput(primarySaveResult) && !isResourceSideBySideEditorInput(primarySaveResult) && !isResourceMergeEditorInput(primarySaveResult)) {
            return {
                primary: primarySaveResult,
                secondary: primarySaveResult,
                label: this.preferredName,
                description: this.preferredDescription
            };
        }
        return undefined;
    }
    revert(group, options) {
        return this.primary.revert(group, options);
    }
    async rename(group, target) {
        if (!this.hasIdenticalSides) {
            return; // currently only enabled when both sides are identical
        }
        // Forward rename to primary side
        const renameResult = await this.primary.rename(group, target);
        if (!renameResult) {
            return undefined;
        }
        // Build a side-by-side result from the rename result
        if (isEditorInput(renameResult.editor)) {
            return {
                editor: new SideBySideEditorInput_1(this.preferredName, this.preferredDescription, renameResult.editor, renameResult.editor, this.editorService),
                options: {
                    ...renameResult.options,
                    viewState: findViewStateForEditor(this, group, this.editorService)
                }
            };
        }
        if (isResourceEditorInput(renameResult.editor)) {
            return {
                editor: {
                    label: this.preferredName,
                    description: this.preferredDescription,
                    primary: renameResult.editor,
                    secondary: renameResult.editor,
                    options: {
                        ...renameResult.options,
                        viewState: findViewStateForEditor(this, group, this.editorService)
                    }
                }
            };
        }
        return undefined;
    }
    isReadonly() {
        return this.primary.isReadonly();
    }
    toUntyped(options) {
        const primaryResourceEditorInput = this.primary.toUntyped(options);
        const secondaryResourceEditorInput = this.secondary.toUntyped(options);
        // Prevent nested side by side editors which are unsupported
        if (primaryResourceEditorInput && secondaryResourceEditorInput &&
            !isResourceDiffEditorInput(primaryResourceEditorInput) && !isResourceDiffEditorInput(secondaryResourceEditorInput) &&
            !isResourceMultiDiffEditorInput(primaryResourceEditorInput) && !isResourceMultiDiffEditorInput(secondaryResourceEditorInput) &&
            !isResourceSideBySideEditorInput(primaryResourceEditorInput) && !isResourceSideBySideEditorInput(secondaryResourceEditorInput) &&
            !isResourceMergeEditorInput(primaryResourceEditorInput) && !isResourceMergeEditorInput(secondaryResourceEditorInput)) {
            const untypedInput = {
                label: this.preferredName,
                description: this.preferredDescription,
                primary: primaryResourceEditorInput,
                secondary: secondaryResourceEditorInput
            };
            if (typeof options?.preserveViewState === 'number') {
                untypedInput.options = {
                    viewState: findViewStateForEditor(this, options.preserveViewState, this.editorService)
                };
            }
            return untypedInput;
        }
        return undefined;
    }
    matches(otherInput) {
        if (this === otherInput) {
            return true;
        }
        if (isDiffEditorInput(otherInput) || isResourceDiffEditorInput(otherInput)) {
            return false; // prevent subclass from matching
        }
        if (otherInput instanceof SideBySideEditorInput_1) {
            return this.primary.matches(otherInput.primary) && this.secondary.matches(otherInput.secondary);
        }
        if (isResourceSideBySideEditorInput(otherInput)) {
            return this.primary.matches(otherInput.primary) && this.secondary.matches(otherInput.secondary);
        }
        return false;
    }
};
SideBySideEditorInput = SideBySideEditorInput_1 = __decorate([
    __param(4, IEditorService)
], SideBySideEditorInput);
export { SideBySideEditorInput };
export class AbstractSideBySideEditorInputSerializer {
    canSerialize(editorInput) {
        const input = editorInput;
        if (input.primary && input.secondary) {
            const [secondaryInputSerializer, primaryInputSerializer] = this.getSerializers(input.secondary.typeId, input.primary.typeId);
            return !!(secondaryInputSerializer?.canSerialize(input.secondary) && primaryInputSerializer?.canSerialize(input.primary));
        }
        return false;
    }
    serialize(editorInput) {
        const input = editorInput;
        if (input.primary && input.secondary) {
            const [secondaryInputSerializer, primaryInputSerializer] = this.getSerializers(input.secondary.typeId, input.primary.typeId);
            if (primaryInputSerializer && secondaryInputSerializer) {
                const primarySerialized = primaryInputSerializer.serialize(input.primary);
                const secondarySerialized = secondaryInputSerializer.serialize(input.secondary);
                if (primarySerialized && secondarySerialized) {
                    const serializedEditorInput = {
                        name: input.getPreferredName(),
                        description: input.getPreferredDescription(),
                        primarySerialized,
                        secondarySerialized,
                        primaryTypeId: input.primary.typeId,
                        secondaryTypeId: input.secondary.typeId
                    };
                    return JSON.stringify(serializedEditorInput);
                }
            }
        }
        return undefined;
    }
    deserialize(instantiationService, serializedEditorInput) {
        const deserialized = JSON.parse(serializedEditorInput);
        const [secondaryInputSerializer, primaryInputSerializer] = this.getSerializers(deserialized.secondaryTypeId, deserialized.primaryTypeId);
        if (primaryInputSerializer && secondaryInputSerializer) {
            const primaryInput = primaryInputSerializer.deserialize(instantiationService, deserialized.primarySerialized);
            const secondaryInput = secondaryInputSerializer.deserialize(instantiationService, deserialized.secondarySerialized);
            if (primaryInput instanceof EditorInput && secondaryInput instanceof EditorInput) {
                return this.createEditorInput(instantiationService, deserialized.name, deserialized.description, secondaryInput, primaryInput);
            }
        }
        return undefined;
    }
    getSerializers(secondaryEditorInputTypeId, primaryEditorInputTypeId) {
        const registry = Registry.as(EditorExtensions.EditorFactory);
        return [registry.getEditorSerializer(secondaryEditorInputTypeId), registry.getEditorSerializer(primaryEditorInputTypeId)];
    }
}
export class SideBySideEditorInputSerializer extends AbstractSideBySideEditorInputSerializer {
    createEditorInput(instantiationService, name, description, secondaryInput, primaryInput) {
        return instantiationService.createInstance(SideBySideEditorInput, name, description, secondaryInput, primaryInput);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHdEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTNDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQTBFLGdCQUFnQixFQUEwRiwrQkFBK0IsRUFBRSxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBa0Msc0JBQXNCLEVBQWUsYUFBYSxFQUFFLHFCQUFxQixFQUFhLDBCQUEwQixFQUFFLDhCQUE4QixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ2pkLE9BQU8sRUFBRSxXQUFXLEVBQXlCLE1BQU0sa0JBQWtCLENBQUM7QUFDdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRS9FOztHQUVHO0FBQ0ksSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBc0IsU0FBUSxXQUFXOzthQUVyQyxPQUFFLEdBQVcsOENBQThDLEFBQXpELENBQTBEO0lBRTVFLElBQWEsTUFBTTtRQUNsQixPQUFPLHVCQUFxQixDQUFDLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBYSxZQUFZO1FBRXhCLG1EQUFtRDtRQUNuRCxJQUFJLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUU3QyxtREFBbUQ7UUFDbkQsc0NBQXNDO1FBQ3RDLFlBQVksSUFBSSxpREFBd0MsQ0FBQztRQUV6RCw2Q0FBNkM7UUFDN0MsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFD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