/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindow, runWhenWindowIdle } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
export class CodeEditorContributions extends Disposable {
    constructor() {
        super();
        this._editor = null;
        this._instantiationService = null;
        /**
         * Contains all instantiated contributions.
         */
        this._instances = this._register(new DisposableMap());
        /**
         * Contains contributions which are not yet instantiated.
         */
        this._pending = new Map();
        /**
         * Tracks which instantiation kinds are still left in `_pending`.
         */
        this._finishedInstantiation = [];
        this._finishedInstantiation[0 /* EditorContributionInstantiation.Eager */] = false;
        this._finishedInstantiation[1 /* EditorContributionInstantiation.AfterFirstRender */] = false;
        this._finishedInstantiation[2 /* EditorContributionInstantiation.BeforeFirstInteraction */] = false;
        this._finishedInstantiation[3 /* EditorContributionInstantiation.Eventually */] = false;
    }
    initialize(editor, contributions, instantiationService) {
        this._editor = editor;
        this._instantiationService = instantiationService;
        for (const desc of contributions) {
            if (this._pending.has(desc.id)) {
                onUnexpectedError(new Error(`Cannot have two contributions with the same id ${desc.id}`));
                continue;
            }
            this._pending.set(desc.id, desc);
        }
        this._instantiateSome(0 /* EditorContributionInstantiation.Eager */);
        // AfterFirstRender
        // - these extensions will be instantiated at the latest 50ms after the first render.
        // - but if there is idle time, we will instantiate them sooner.
        this._register(runWhenWindowIdle(getWindow(this._editor.getDomNode()), () => {
            this._instantiateSome(1 /* EditorContributionInstantiation.AfterFirstRender */);
        }));
        // BeforeFirstInteraction
        // - these extensions will be instantiated at the latest before a mouse or a keyboard event.
        // - but if there is idle time, we will instantiate them sooner.
        this._register(runWhenWindowIdle(getWindow(this._editor.getDomNode()), () => {
            this._instantiateSome(2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
        }));
        // Eventually
        // - these extensions will only be instantiated when there is idle time.
        // - since there is no guarantee that there will ever be idle time, we set a timeout of 5s here.
        this._register(runWhenWindowIdle(getWindow(this._editor.getDomNode()), () => {
            this._instantiateSome(3 /* EditorContributionInstantiation.Eventually */);
        }, 5000));
    }
    saveViewState() {
        const contributionsState = {};
        for (const [id, contribution] of this._instances) {
            if (typeof contribution.saveViewState === 'function') {
                contributionsState[id] = contribution.saveViewState();
            }
        }
        return contributionsState;
    }
    restoreViewState(contributionsState) {
        for (const [id, contribution] of this._instances) {
            if (typeof contribution.restoreViewState === 'function') {
                contribution.restoreViewState(contributionsState[id]);
            }
        }
    }
    get(id) {
        this._instantiateById(id);
        return this._instances.get(id) || null;
    }
    /**
     * used by tests
     */
    set(id, value) {
        this._instances.set(id, value);
    }
    onBeforeInteractionEvent() {
        // this method is called very often by the editor!
        this._instantiateSome(2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
    }
    onAfterModelAttached() {
        return runWhenWindowIdle(getWindow(this._editor?.getDomNode()), () => {
            this._instantiateSome(1 /* EditorContributionInstantiation.AfterFirstRender */);
        }, 50);
    }
    _instantiateSome(instantiation) {
        if (this._finishedInstantiation[instantiation]) {
            // already done with this instantiation!
            return;
        }
        this._finishedInstantiation[instantiation] = true;
        const contribs = this._findPendingContributionsByInstantiation(instantiation);
        for (const contrib of contribs) {
            this._instantiateById(contrib.id);
        }
    }
    _findPendingContributionsByInstantiation(instantiation) {
        const result = [];
        for (const [, desc] of this._pending) {
            if (desc.instantiation === instantiation) {
                result.push(desc);
            }
        }
        return result;
    }
    _instantiateById(id) {
        const desc = this._pending.get(id);
        if (!desc) {
            return;
        }
        this._pending.delete(id);
        if (!this._instantiationService || !this._editor) {
            throw new Error(`Cannot instantiate contributions before being initialized!`);
        }
        try {
            const instance = this._instantiationService.createInstance(desc.ctor, this._editor);
            this._instances.set(desc.id, instance);
            if (typeof instance.restoreViewState === 'function' && desc.instantiation !== 0 /* EditorContributionInstantiation.Eager */) {
                console.warn(`Editor contribution '${desc.id}' should be eager instantiated because it uses saveViewState / restoreViewState.`);
            }
        }
        catch (err) {
            onUnexpectedError(err);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUVkaXRvckNvbnRyaWJ1dGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yQ29udHJpYnV0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQU05RixNQUFNLE9BQU8sdUJBQXdCLFNBQVEsVUFBVTtJQWtCdEQ7UUFHQyxLQUFLLEVBQUUsQ0FBQztRQW5CRCxZQUFPLEdBQXVCLElBQUksQ0FBQztRQUNuQywwQkFBcUIsR0FBaUMsSUFBSSxDQUFDO1FBRW5FOztXQUVHO1FBQ2MsZUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQStCLENBQUMsQ0FBQztRQUMvRjs7V0FFRztRQUNjLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBMEMsQ0FBQztRQUM5RTs7V0FFRztRQUNjLDJCQUFzQixHQUFjLEVBQUUsQ0FBQztRQU92RCxJQUFJLENBQUMsc0JBQXNCLCtDQUF1QyxHQUFHLEtBQUssQ0FBQztRQUMzRSxJQUFJLENBQUMsc0JBQXNCLDBEQUFrRCxHQUFHLEtBQUssQ0FBQztRQUN0RixJQUFJLENBQUMsc0JBQXNCLGdFQUF3RCxHQUFHLEtBQUssQ0FBQztRQUM1RixJQUFJLENBQUMsc0JBQXNCLG9EQUE0QyxHQUFHLEtBQUssQ0FBQztJQUNqRixDQUFDO0lBRU0sVUFBVSxDQUFDLE1BQW1CLEVBQUUsYUFBK0MsRUFBRSxvQkFBMkM7UUFDbEksSUFBSSxDQUFDLE9B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