/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { EditorResourceAccessor, AbstractEditorInput, isEditorInput } from '../editor.js';
import { isEqual } from '../../../base/common/resources.js';
/**
 * Editor inputs are lightweight objects that can be passed to the workbench API to open inside the editor part.
 * Each editor input is mapped to an editor that is capable of opening it through the Platform facade.
 */
export class EditorInput extends AbstractEditorInput {
    constructor() {
        super(...arguments);
        this._onDidChangeDirty = this._register(new Emitter());
        this._onDidChangeLabel = this._register(new Emitter());
        this._onDidChangeCapabilities = this._register(new Emitter());
        this._onWillDispose = this._register(new Emitter());
        /**
         * Triggered when this input changes its dirty state.
         */
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        /**
         * Triggered when this input changes its label
         */
        this.onDidChangeLabel = this._onDidChangeLabel.event;
        /**
         * Triggered when this input changes its capabilities.
         */
        this.onDidChangeCapabilities = this._onDidChangeCapabilities.event;
        /**
         * Triggered when this input is about to be disposed.
         */
        this.onWillDispose = this._onWillDispose.event;
    }
    /**
     * Identifies the type of editor this input represents
     * This ID is registered with the {@link EditorResolverService} to allow
     * for resolving an untyped input to a typed one
     */
    get editorId() {
        return undefined;
    }
    /**
     * The capabilities of the input.
     */
    get capabilities() {
        return 2 /* EditorInputCapabilities.Readonly */;
    }
    /**
     * Figure out if the input has the provided capability.
     */
    hasCapability(capability) {
        if (capability === 0 /* EditorInputCapabilities.None */) {
            return this.capabilities === 0 /* EditorInputCapabilities.None */;
        }
        return (this.capabilities & capability) !== 0;
    }
    isReadonly() {
        return this.hasCapability(2 /* EditorInputCapabilities.Readonly */);
    }
    /**
     * Returns the display name of this input.
     */
    getName() {
        return `Editor ${this.typeId}`;
    }
    /**
     * Returns the display description of this input.
     */
    getDescription(verbosity) {
        return undefined;
    }
    /**
     * Returns the display title of this input.
     */
    getTitle(verbosity) {
        return this.getName();
    }
    /**
     * Returns the extra classes to apply to the label of this input.
     */
    getLabelExtraClasses() {
        return [];
    }
    /**
     * Returns the aria label to be read out by a screen reader.
     */
    getAriaLabel() {
        return this.getTitle(0 /* Verbosity.SHORT */);
    }
    /**
     * Returns the icon which represents this editor input.
     * If undefined, the default icon will be used.
     */
    getIcon() {
        return undefined;
    }
    /**
     * Returns a descriptor suitable for telemetry events.
     *
     * Subclasses should extend if they can contribute.
     */
    getTelemetryDescriptor() {
        /* __GDPR__FRAGMENT__
            "EditorTelemetryDescriptor" : {
                "typeId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        return { typeId: this.typeId };
    }
    /**
     * Returns if this input is dirty or not.
     */
    isDirty() {
        return false;
    }
    /**
     * Returns if the input has unsaved changes.
     */
    isModified() {
        return this.isDirty();
    }
    /**
     * Returns if this input is currently being saved or soon to be
     * saved. Based on this assumption the editor may for example
     * decide to not signal the dirty state to the user assuming that
     * the save is scheduled to happen anyway.
     */
    isSaving() {
        return false;
    }
    /**
     * Returns a type of `IDisposable` that represents the resolved input.
     * Subclasses should override to provide a meaningful model or return
     * `null` if the editor does not require a model.
     *
     * The `options` parameter are passed down from the editor when the
     * input is resolved as part of it.
     */
    async resolve() {
        return null;
    }
    /**
     * Saves the editor. The provided groupId helps implementors
     * to e.g. preserve view state of the editor and re-open it
     * in the correct group after saving.
     *
     * @returns the resulting editor input (typically the same) of
     * this operation or `undefined` to indicate that the operation
     * failed or was canceled.
     */
    async save(group, options) {
        return this;
    }
    /**
     * Saves the editor to a different location. The provided `group`
     * helps implementors to e.g. preserve view state of the editor
     * and re-open it in the correct group after saving.
     *
     * @returns the resulting editor input (typically a different one)
     * of this operation or `undefined` to indicate that the operation
     * failed or was canceled.
     */
    async saveAs(group, options) {
        return this;
    }
    /**
     * Reverts this input from the provided group.
     */
    async revert(group, options) { }
    /**
     * Called to determine how to handle a resource that is renamed that matches
     * the editors resource (or is a child of).
     *
     * Implementors are free to not implement this method to signal no intent
     * to participate. If an editor is returned though, it will replace the
     * current one with that editor and optional options.
     */
    async rename(group, target) {
        return undefined;
    }
    /**
     * Returns a copy of the current editor input. Used when we can't just reuse the input
     */
    copy() {
        return this;
    }
    /**
     * Indicates if this editor can be moved to another group. By default
     * editors can freely be moved around groups. If an editor cannot be
     * moved, a message should be returned to show to the user.
     *
     * @returns `true` if the editor can be moved to the target group, or
     * a string with a message to show to the user if the editor cannot be
     * moved.
     */
    canMove(sourceGroup, targetGroup) {
        return true;
    }
    /**
     * Indicates if this editor can be reopened after being closed. By default
     * editors can be reopened. Subclasses can override to prevent this.
     *
     * @returns `true` if the editor can be reopened after being closed.
     */
    canReopen() {
        return true;
    }
    /**
     * Returns if the other object matches this input.
     */
    matches(otherInput) {
        // Typed inputs: via  === check
        if (isEditorInput(otherInput)) {
            return this === otherInput;
        }
        // Untyped inputs: go into properties
        const otherInputEditorId = otherInput.options?.override;
        // If the overrides are both defined and don't match that means they're separate inputs
        if (this.editorId !== otherInputEditorId && otherInputEditorId !== undefined && this.editorId !== undefined) {
            return false;
        }
        return isEqual(this.resource, EditorResourceAccessor.getCanonicalUri(otherInput));
    }
    /**
     * If a editor was registered onto multiple editor panes, this method
     * will be asked to return the preferred one to use.
     *
     * @param editorPanes a list of editor pane descriptors that are candidates
     * for the editor to open in.
     */
    prefersEditorPane(editorPanes) {
        return editorPanes.at(0);
    }
    /**
     * Returns a representation of this typed editor input as untyped
     * resource editor input that e.g. can be used to serialize the
     * editor input into a form that it can be restored.
     *
     * May return `undefined` if an untyped representation is not supported.
     */
    toUntyped(options) {
        return undefined;
    }
    /**
     * Returns if this editor is disposed.
     */
    isDisposed() {
        return this._store.isDisposed;
    }
    dispose() {
        if (!this.isDisposed()) {
            this._onWillDispose.fire();
        }
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFeEQsT0FBTyxFQUF1SixzQkFBc0IsRUFBRSxtQkFBbUIsRUFBRSxhQUFhLEVBQXFCLE1BQU0sY0FBYyxDQUFDO0FBQ2xRLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQWdENUQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFnQixXQUFZLFNBQVEsbUJBQW1CO0lBQTdEOztRQUVvQixzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN4RCxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN4RCw2QkFBd0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUVqRSxtQkFBYyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBRXRFOztXQUVHO1FBQ00scUJBQWdCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQztRQUV6RDs7V0FFRztRQUNNLHFCQUFnQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFFekQ7O1dBRUc7UUFDTSw0QkFBdUIsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDO1FBRXZFOztXQUVHO1FBQ00sa0JBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztJQTJScEQsQ0FBQztJQTlQ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