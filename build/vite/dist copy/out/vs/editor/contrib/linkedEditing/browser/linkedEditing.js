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
var LinkedEditingContribution_1;
import * as arrays from '../../../../base/common/arrays.js';
import { Delayer, first } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Color } from '../../../../base/common/color.js';
import { isCancellationError, onUnexpectedError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import * as nls from '../../../../nls.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import './linkedEditing.css';
export const CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE = new RawContextKey('LinkedEditingInputVisible', false);
const DECORATION_CLASS_NAME = 'linked-editing-decoration';
let LinkedEditingContribution = class LinkedEditingContribution extends Disposable {
    static { LinkedEditingContribution_1 = this; }
    static { this.ID = 'editor.contrib.linkedEditing'; }
    static { this.DECORATION = ModelDecorationOptions.register({
        description: 'linked-editing',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        className: DECORATION_CLASS_NAME
    }); }
    static get(editor) {
        return editor.getContribution(LinkedEditingContribution_1.ID);
    }
    constructor(editor, contextKeyService, languageFeaturesService, languageConfigurationService, languageFeatureDebounceService) {
        super();
        this.languageConfigurationService = languageConfigurationService;
        this._syncRangesToken = 0;
        this._localToDispose = this._register(new DisposableStore());
        this._editor = editor;
        this._providers = languageFeaturesService.linkedEditingRangeProvider;
        this._enabled = false;
        this._visibleContextKey = CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
        this._debounceInformation = languageFeatureDebounceService.for(this._providers, 'Linked Editing', { max: 200 });
        this._currentDecorations = this._editor.createDecorationsCollection();
        this._languageWordPattern = null;
        this._currentWordPattern = null;
        this._ignoreChangeEvent = false;
        this._localToDispose = this._register(new DisposableStore());
        this._rangeUpdateTriggerPromise = null;
        this._rangeSyncTriggerPromise = null;
        this._currentRequestCts = null;
        this._currentRequestPosition = null;
        this._currentRequestModelVersion = null;
        this._register(this._editor.onDidChangeModel(() => this.reinitialize(true)));
        this._register(this._editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(78 /* EditorOption.linkedEditing */) || e.hasChanged(106 /* EditorOption.renameOnType */)) {
                this.reinitialize(false);
            }
        }));
        this._register(this._providers.onDidChange(() => this.reinitialize(false)));
        this._register(this._editor.onDidChangeModelLanguage(() => this.reinitialize(true)));
        this.reinitialize(true);
    }
    reinitialize(forceRefresh) {
        const model = this._editor.getModel();
        const isEnabled = model !== null && (this._editor.getOption(78 /* EditorOption.linkedEditing */) || this._editor.getOption(106 /* EditorOption.renameOnType */)) && this._providers.has(model);
        if (isEnabled === this._enabled && !forceRefresh) {
            return;
        }
        this._enabled = isEnabled;
        this.clearRanges();
        this._localToDispose.clear();
        if (!isEnabled || model === null) {
            return;
        }
        this._localToDispose.add(Event.runAndSubscribe(model.onDidChangeLanguageConfiguration, () => {
            this._languageWordPattern = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
        }));
        const rangeUpdateScheduler = new Delayer(this._debounceInformation.get(model));
        const triggerRangeUpdate = () => {
            this._rangeUpdateTriggerPromise = rangeUpdateScheduler.trigger(() => this.updateRanges(), this._debounceDuration ?? this._debounceInformation.get(model));
        };
        const rangeSyncScheduler = new Delayer(0);
        const triggerRangeSync = (token) => {
            this._rangeSyncTriggerPromise = rangeSyncScheduler.trigger(() => this._syncRanges(token));
        };
        this._localToDispose.add(this._editor.onDidChangeCursorPosition(() => {
            triggerRangeUpdate();
        }));
        this._localToDispose.add(this._editor.onDidChangeModelContent((e) => {
            if (!this._ignoreChangeEvent) {
                if (this._currentDecorations.length > 0) {
                    const referenceRange = this._currentDecorations.getRange(0);
                    if (referenceRange && e.changes.every(c => referenceRange.intersectRanges(c.range))) {
                        triggerRangeSync(this._syncRangesToken);
                        return;
                    }
                }
            }
            triggerRangeUpdate();
        }));
        this._localToDispose.add({
            dispose: () => {
                rangeUpdateScheduler.dispose();
                rangeSyncScheduler.dispose();
            }
        });
        this.updateRanges();
    }
    _syncRanges(token) {
        // delayed invocation, make sure we're still on
        if (!this._editor.hasModel() || token !== this._syncRangesToken || this._currentDecorations.length === 0) {
            // nothing to do
            return;
        }
        const model = this._editor.getModel();
        const referenceRange = this._currentDecorations.getRange(0);
        if (!referenceRange || referenceRange.startLineNumber !== referenceRange.endLineNumber) {
            return this.clearRanges();
        }
        const referenceValue = model.getValueInRange(referenceRange);
        if (this._currentWordPattern) {
            const match = referenceValue.match(this._currentWordPattern);
            const matchLength = match ? match[0].length : 0;
            if (matchLength !== referenceValue.length) {
                return this.clearRanges();
            }
        }
        const edits = [];
        for (let i = 1, len = this._currentDecorations.length; i < len; i++) {
            const mirrorRange = this._currentDecorations.getRange(i);
            if (!mirrorRange) {
                continue;
            }
            if (mirrorRange.startLineNumber !== mirrorRange.endLineNumber) {
                edits.push({
                    range: mirrorRange,
                    text: referenceValue
                });
            }
            else {
                let oldValue = model.getValueInRange(mirrorRange);
                let newValue = referenceValue;
                let rangeStartColumn = mirrorRange.startColumn;
                let rangeEndColumn = mirrorRange.endColumn;
                const commonPrefixLength = strings.commonPrefixLength(oldValue, newValue);
                rangeStartColumn += commonPrefixLength;
                oldValue = oldValue.substr(commonPrefixLength);
                newValue = newValue.substr(commonPrefixLength);
                const commonSuffixLength = strings.commonSuffixLength(oldValue, newValue);
                rangeEndColumn -= commonSuffixLength;
                oldValue = oldValue.substr(0, oldValue.length - commonSuffixLength);
                newValue = newValue.substr(0, newValue.length - commonSuffixLength);
                if (rangeStartColumn !== rangeEndColumn || newValue.length !== 0) {
                    edits.push({
                        range: new Range(mirrorRange.startLineNumber, rangeStartColumn, mirrorRange.endLineNumber, rangeEndColumn),
                        text: newValue
                    });
                }
            }
        }
        if (edits.length === 0) {
            return;
        }
        try {
            this._editor.popUndoStop();
            this._ignoreChangeEvent = true;
            const prevEditOperationType = this._editor._getViewModel().getPrevEditOperationType();
            this._editor.executeEdits('linkedEditing', edits);
            this._editor._getViewModel().setPrevEditOperationType(prevEditOperationType);
        }
        finally {
            this._ignoreChangeEvent = false;
        }
    }
    dispose() {
        this.clearRanges();
        super.dispose();
    }
    clearRanges() {
        this._visibleContextKey.set(false);
        this._currentDecorations.clear();
        if (this._currentRequestCts) {
            this._currentRequestCts.cancel();
            this._currentRequestCts = null;
            this._currentRequestPosition = null;
        }
    }
    get currentUpdateTriggerPromise() {
        return this._rangeUpdateTriggerPromise || Promise.resolve();
    }
    get currentSyncTriggerPromise() {
        return this._rangeSyncTriggerPromise || Promise.resolve();
    }
    async updateRanges(force = false) {
        if (!this._editor.hasModel()) {
            this.clearRanges();
            return;
        }
        const position = this._editor.getPosition();
        if (!this._enabled && !force || this._editor.getSelections().length > 1) {
            // disabled or multicursor
            this.clearRanges();
            return;
        }
        const model = this._editor.getModel();
        const modelVersionId = model.getVersionId();
        if (this._currentRequestPosition && this._currentRequestModelVersion === modelVersionId) {
            if (position.equals(this._currentRequestPosition)) {
                return; // same position
            }
            if (this._currentDecorations.length > 0) {
                const range = this._currentDecorations.getRange(0);
                if (range && range.containsPosition(position)) {
                    return; // just moving inside the existing primary range
                }
            }
        }
        if (!this._currentRequestPosition?.equals(position)) {
            // Get the current range of the first decoration (reference range)
            const currentRange = this._currentDecorations.getRange(0);
            // If there is no current range or the current range does not contain the new position, clear the ranges
            if (!currentRange?.containsPosition(position)) {
                // Clear existing decorations while we compute new ones
                this.clearRanges();
            }
        }
        this._currentRequestPosition = position;
        this._currentRequestModelVersion = modelVersionId;
        const currentRequestCts = this._currentRequestCts = new CancellationTokenSource();
        try {
            const sw = new StopWatch(false);
            const response = await getLinkedEditingRanges(this._providers, model, position, currentRequestCts.token);
            this._debounceInformation.update(model, sw.elapsed());
            if (currentRequestCts !== this._currentRequestCts) {
                return;
            }
            this._currentRequestCts = null;
            if (modelVersionId !== model.getVersionId()) {
                return;
            }
            let ranges = [];
            if (response?.ranges) {
                ranges = response.ranges;
            }
            this._currentWordPattern = response?.wordPattern || this._languageWordPattern;
            let foundReferenceRange = false;
            for (let i = 0, len = ranges.length; i < len; i++) {
                if (Range.containsPosition(ranges[i], position)) {
                    foundReferenceRange = true;
                    if (i !== 0) {
                        const referenceRange = ranges[i];
                        ranges.splice(i, 1);
                        ranges.unshift(referenceRange);
                    }
                    break;
                }
            }
            if (!foundReferenceRange) {
                // Cannot do linked editing if the ranges are not where the cursor is...
                this.clearRanges();
                return;
            }
            const decorations = ranges.map(range => ({ range: range, options: LinkedEditingContribution_1.DECORATION }));
            this._visibleContextKey.set(true);
            this._currentDecorations.set(decorations);
            this._syncRangesToken++; // cancel any pending syncRanges call
        }
        catch (err) {
            if (!isCancellationError(err)) {
                onUnexpectedError(err);
            }
            if (this._currentRequestCts === currentRequestCts || !this._currentRequestCts) {
                // stop if we are still the latest request
                this.clearRanges();
            }
        }
    }
    // for testing
    setDebounceDuration(timeInMS) {
        this._debounceDuration = timeInMS;
    }
};
LinkedEditingContribution = LinkedEditingContribution_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, ILanguageFeaturesService),
    __param(3, ILanguageConfigurationService),
    __param(4, ILanguageFeatureDebounceService)
], LinkedEditingContribution);
export { LinkedEditingContribution };
export class LinkedEditingAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.linkedEditing',
            label: nls.localize2('linkedEditing.label', "Start Linked Editing"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 60 /* KeyCode.F2 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    runCommand(accessor, args) {
        const editorService = accessor.get(ICodeEditorService);
        const [uri, pos] = Array.isArray(args) && args || [undefined, undefined];
        if (URI.isUri(uri) && Position.isIPosition(pos)) {
            return editorService.openCodeEditor({ resource: uri }, editorService.getActiveCodeEditor()).then(editor => {
                if (!editor) {
                    return;
                }
                editor.setPosition(pos);
                editor.invokeWithinContext(accessor => {
                    this.reportTelemetry(accessor, editor);
                    return this.run(accessor, editor);
                });
            }, onUnexpectedError);
        }
        return super.runCommand(accessor, args);
    }
    run(_accessor, editor) {
        const controller = LinkedEditingContribution.get(editor);
        if (controller) {
            return Promise.resolve(controller.updateRanges(true));
        }
        return Promise.resolve();
    }
}
const LinkedEditingCommand = EditorCommand.bindToContribution(LinkedEditingContribution.get);
registerEditorCommand(new LinkedEditingCommand({
    id: 'cancelLinkedEditingInput',
    precondition: CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE,
    handler: x => x.clearRanges(),
    kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: 100 /* KeybindingWeight.EditorContrib */ + 99,
        primary: 9 /* KeyCode.Escape */,
        secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */]
    }
}));
function getLinkedEditingRanges(providers, model, position, token) {
    const orderedByScore = providers.ordered(model);
    // in order of score ask the linked editing range provider
    // until someone response with a good result
    // (good = not null)
    return first(orderedByScore.map(provider => async () => {
        try {
            return await provider.provideLinkedEditingRanges(model, position, token);
        }
        catch (e) {
            onUnexpectedExternalError(e);
            return undefined;
        }
    }), result => !!result && arrays.isNonEmptyArray(result?.ranges));
}
export const editorLinkedEditingBackground = registerColor('editor.linkedEditingBackground', { dark: Color.fromHex('#f00').transparent(0.3), light: Color.fromHex('#f00').transparent(0.3), hcDark: Color.fromHex('#f00').transparent(0.3), hcLight: Color.white }, nls.localize('editorLinkedEditingBackground', 'Background color when the editor auto renames on type.'));
registerModelAndPositionCommand('_executeLinkedEditingProvider', (_accessor, model, position) => {
    const { linkedEditingRangeProvider } = _accessor.get(ILanguageFeaturesService);
    return getLinkedEditingRanges(linkedEditingRangeProvider, model, position, CancellationToken.None);
});
registerEditorContribution(LinkedEditingContribution.ID, LinkedEditingContribution, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorAction(LinkedEditingAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua2VkRWRpdGluZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2xpbmtlZEVkaXRpbmcvYnJvd3Nlci9saW5rZWRFZGl0aW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFtQyxvQkFBb0IsRUFBRSxxQkFBcUIsRUFBRSwwQkFBMEIsRUFBRSwrQkFBK0IsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoUCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVwRixPQUFPLEVBQWEsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdkUsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTlELE9BQU8sRUFBRSxp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