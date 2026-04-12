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
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, observableFromEvent, observableFromPromise, observableFromValueWithChangeEvent, observableSignalFromEvent, wasEventTriggeredRecently } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { FoldingController } from '../../../../editor/contrib/folding/browser/folding.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IDebugService } from '../../debug/common/debug.js';
let EditorTextPropertySignalsContribution = class EditorTextPropertySignalsContribution extends Disposable {
    constructor(_editorService, _instantiationService, _accessibilitySignalService) {
        super();
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._textProperties = [
            this._instantiationService.createInstance(MarkerTextProperty, AccessibilitySignal.errorAtPosition, AccessibilitySignal.errorOnLine, MarkerSeverity.Error),
            this._instantiationService.createInstance(MarkerTextProperty, AccessibilitySignal.warningAtPosition, AccessibilitySignal.warningOnLine, MarkerSeverity.Warning),
            this._instantiationService.createInstance(FoldedAreaTextProperty),
            this._instantiationService.createInstance(BreakpointTextProperty),
        ];
        this._someAccessibilitySignalIsEnabled = derived(this, reader => this._textProperties
            .flatMap(p => [p.lineSignal, p.positionSignal])
            .filter(isDefined)
            .some(signal => observableFromValueWithChangeEvent(this, this._accessibilitySignalService.getEnabledState(signal, false)).read(reader)));
        this._activeEditorObservable = observableFromEvent(this, this._editorService.onDidActiveEditorChange, (_) => {
            const activeTextEditorControl = this._editorService.activeTextEditorControl;
            const editor = isDiffEditor(activeTextEditorControl)
                ? activeTextEditorControl.getOriginalEditor()
                : isCodeEditor(activeTextEditorControl)
                    ? activeTextEditorControl
                    : undefined;
            return editor && editor.hasModel() ? { editor, model: editor.getModel() } : undefined;
        });
        this._register(autorunWithStore((reader, store) => {
            /** @description updateSignalsEnabled */
            if (!this._someAccessibilitySignalIsEnabled.read(reader)) {
                return;
            }
            const activeEditor = this._activeEditorObservable.read(reader);
            if (activeEditor) {
                this._registerAccessibilitySignalsForEditor(activeEditor.editor, activeEditor.model, store);
            }
        }));
    }
    _registerAccessibilitySignalsForEditor(editor, editorModel, store) {
        let lastLine = -1;
        const ignoredLineSignalsForCurrentLine = new Set();
        const timeouts = store.add(new DisposableStore());
        const propertySources = this._textProperties.map(p => ({ source: p.createSource(editor, editorModel), property: p }));
        const didType = wasEventTriggeredRecently(editor.onDidChangeModelContent, 100, store);
        store.add(editor.onDidChangeCursorPosition(args => {
            timeouts.clear();
            if (args &&
                args.reason !== 3 /* CursorChangeReason.Explicit */ &&
                args.reason !== 0 /* CursorChangeReason.NotSet */) {
                // Ignore cursor changes caused by navigation (e.g. which happens when execution is paused).
                ignoredLineSignalsForCurrentLine.clear();
                return;
            }
            const trigger = (property, source, mode) => {
                const signal = mode === 'line' ? property.lineSignal : property.positionSignal;
                if (!signal
                    || !this._accessibilitySignalService.getEnabledState(signal, false).value
                    || !source.isPresent(position, mode, undefined)) {
                    return;
                }
                for (const modality of ['sound', 'announcement']) {
                    if (this._accessibilitySignalService.getEnabledState(signal, false, modality).value) {
                        const delay = this._accessibilitySignalService.getDelayMs(signal, modality, mode) + (didType.get() ? 1000 : 0);
                        timeouts.add(disposableTimeout(() => {
                            if (source.isPresent(position, mode, undefined)) {
                                if (!(mode === 'line') || !ignoredLineSignalsForCurrentLine.has(property)) {
                                    this._accessibilitySignalService.playSignal(signal, { modality });
                                }
                                ignoredLineSignalsForCurrentLine.add(property);
                            }
                        }, delay));
                    }
                }
            };
            // React to cursor changes
            const position = args.position;
            const lineNumber = position.lineNumber;
            if (lineNumber !== lastLine) {
                ignoredLineSignalsForCurrentLine.clear();
                lastLine = lineNumber;
                for (const p of propertySources) {
                    trigger(p.property, p.source, 'line');
                }
            }
            for (const p of propertySources) {
                trigger(p.property, p.source, 'positional');
            }
            // React to property state changes for the current cursor position
            for (const s of propertySources) {
                if (![s.property.lineSignal, s.property.positionSignal]
                    .some(s => s && this._accessibilitySignalService.getEnabledState(s, false).value)) {
                    return;
                }
                let lastValueAtPosition = undefined;
                let lastValueOnLine = undefined;
                timeouts.add(autorun(reader => {
                    const newValueAtPosition = s.source.isPresentAtPosition(args.position, reader);
                    const newValueOnLine = s.source.isPresentOnLine(args.position.lineNumber, reader);
                    if (lastValueAtPosition !== undefined && lastValueAtPosition !== undefined) {
                        if (!lastValueAtPosition && newValueAtPosition) {
                            trigger(s.property, s.source, 'positional');
                        }
                        if (!lastValueOnLine && newValueOnLine) {
                            trigger(s.property, s.source, 'line');
                        }
                    }
                    lastValueAtPosition = newValueAtPosition;
                    lastValueOnLine = newValueOnLine;
                }));
            }
        }));
    }
};
EditorTextPropertySignalsContribution = __decorate([
    __param(0, IEditorService),
    __param(1, IInstantiationService),
    __param(2, IAccessibilitySignalService)
], EditorTextPropertySignalsContribution);
export { EditorTextPropertySignalsContribution };
class TextPropertySource {
    static { this.notPresent = new TextPropertySource({ isPresentAtPosition: () => false, isPresentOnLine: () => false }); }
    constructor(options) {
        this.isPresentOnLine = options.isPresentOnLine;
        this.isPresentAtPosition = options.isPresentAtPosition ?? (() => false);
    }
    isPresent(position, mode, reader) {
        return mode === 'line' ? this.isPresentOnLine(position.lineNumber, reader) : this.isPresentAtPosition(position, reader);
    }
}
let MarkerTextProperty = class MarkerTextProperty {
    constructor(positionSignal, lineSignal, severity, markerService) {
        this.positionSignal = positionSignal;
        this.lineSignal = lineSignal;
        this.severity = severity;
        this.markerService = markerService;
        this.debounceWhileTyping = true;
    }
    createSource(editor, model) {
        const obs = observableSignalFromEvent('onMarkerChanged', this.markerService.onMarkerChanged);
        return new TextPropertySource({
            isPresentAtPosition: (position, reader) => {
                obs.read(reader);
                const hasMarker = this.markerService
                    .read({ resource: model.uri })
                    .some((m) => m.severity === this.severity &&
                    m.startLineNumber <= position.lineNumber &&
                    position.lineNumber <= m.endLineNumber &&
                    m.startColumn <= position.column &&
                    position.column <= m.endColumn);
                return hasMarker;
            },
            isPresentOnLine: (lineNumber, reader) => {
                obs.read(reader);
                const hasMarker = this.markerService
                    .read({ resource: model.uri })
                    .some((m) => m.severity === this.severity &&
                    m.startLineNumber <= lineNumber &&
                    lineNumber <= m.endLineNumber);
                return hasMarker;
            }
        });
    }
};
MarkerTextProperty = __decorate([
    __param(3, IMarkerService)
], MarkerTextProperty);
class FoldedAreaTextProperty {
    constructor() {
        this.lineSignal = AccessibilitySignal.foldedArea;
    }
    createSource(editor, _model) {
        const foldingController = FoldingController.get(editor);
        if (!foldingController) {
            return TextPropertySource.notPresent;
        }
        const foldingModel = observableFromPromise(foldingController.getFoldingModel() ?? Promise.resolve(undefined));
        return new TextPropertySource({
            isPresentOnLine(lineNumber, reader) {
                const m = foldingModel.read(reader);
                const regionAtLine = m.value?.getRegionAtLine(lineNumber);
                const hasFolding = !regionAtLine
                    ? false
                    : regionAtLine.isCollapsed &&
                        regionAtLine.startLineNumber === lineNumber;
                return hasFolding;
            }
        });
    }
}
let BreakpointTextProperty = class BreakpointTextProperty {
    constructor(debugService) {
        this.debugService = debugService;
        this.lineSignal = AccessibilitySignal.break;
    }
    createSource(editor, model) {
        const signal = observableSignalFromEvent('onDidChangeBreakpoints', this.debugService.getModel().onDidChangeBreakpoints);
        const debugService = this.debugService;
        return new TextPropertySource({
            isPresentOnLine(lineNumber, reader) {
                signal.read(reader);
                const breakpoints = debugService
                    .getModel()
                    .getBreakpoints({ uri: model.uri, lineNumber });
                const hasBreakpoints = breakpoints.length > 0;
                return hasBreakpoints;
            }
        });
    }
};
BreakpointTextProperty = __decorate([
    __param(0, IDebugService)
], BreakpointTextProperty);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yVGV4dFByb3BlcnR5U2lnbmFsc0NvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2FjY2Vzc2liaWxpdHlTaWduYWxzL2Jyb3dzZXIvZWRpdG9yVGV4dFByb3BlcnR5U2lnbmFsc0NvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBVyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLGtDQUFrQyxFQUFFLHlCQUF5QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMU8sT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBZSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFJdEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUF5QixtQkFBbUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGdGQUFnRixDQUFDO0FBQ3pLLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVyRCxJQUFNLHFDQUFxQyxHQUEzQyxN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