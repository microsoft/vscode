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
import { CachedFunction } from '../../../../../base/common/cache.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, mapObservableArrayCached, derived, observableValue, derivedWithSetter, observableFromEvent } from '../../../../../base/common/observable.js';
import { DynamicCssRules } from '../../../../../editor/browser/editorDom.js';
import { observableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { EditSourceTrackingImpl } from './editSourceTrackingImpl.js';
import { DataChannelForwardingTelemetryService } from '../../../../../platform/dataChannel/browser/forwardingTelemetryService.js';
import { EDIT_TELEMETRY_DETAILS_SETTING_ID, EDIT_TELEMETRY_SHOW_DECORATIONS, EDIT_TELEMETRY_SHOW_STATUS_BAR } from '../settings.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
let EditTrackingFeature = class EditTrackingFeature extends Disposable {
    constructor(_workspace, _annotatedDocuments, _configurationService, _instantiationService, _statusbarService, _editorService, _extensionService) {
        super();
        this._workspace = _workspace;
        this._annotatedDocuments = _annotatedDocuments;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._statusbarService = _statusbarService;
        this._editorService = _editorService;
        this._extensionService = _extensionService;
        this._showStateInMarkdownDoc = 'editTelemetry.showDebugDetails';
        this._toggleDecorations = 'editTelemetry.toggleDebugDecorations';
        this._editSourceTrackingShowDecorations = makeSettable(observableConfigValue(EDIT_TELEMETRY_SHOW_DECORATIONS, false, this._configurationService));
        this._editSourceTrackingShowStatusBar = observableConfigValue(EDIT_TELEMETRY_SHOW_STATUS_BAR, false, this._configurationService);
        const editSourceDetailsEnabled = observableConfigValue(EDIT_TELEMETRY_DETAILS_SETTING_ID, false, this._configurationService);
        const extensions = observableFromEvent(this._extensionService.onDidChangeExtensions, () => {
            return this._extensionService.extensions;
        });
        const extensionIds = derived(reader => new Set(extensions.read(reader).map(e => e.id?.toLowerCase())));
        function getExtensionInfoObs(extensionId, extensionService) {
            const extIdLowerCase = extensionId.toLowerCase();
            return derived(reader => extensionIds.read(reader).has(extIdLowerCase));
        }
        const copilotInstalled = getExtensionInfoObs('GitHub.copilot', this._extensionService);
        const copilotChatInstalled = getExtensionInfoObs('GitHub.copilot-chat', this._extensionService);
        const shouldSendDetails = derived(reader => editSourceDetailsEnabled.read(reader) || !!copilotInstalled.read(reader) || !!copilotChatInstalled.read(reader));
        const instantiationServiceWithInterceptedTelemetry = this._instantiationService.createChild(new ServiceCollection([ITelemetryService, this._instantiationService.createInstance(DataChannelForwardingTelemetryService)]));
        const impl = this._register(instantiationServiceWithInterceptedTelemetry.createInstance(EditSourceTrackingImpl, shouldSendDetails, this._annotatedDocuments));
        this._register(autorun((reader) => {
            if (!this._editSourceTrackingShowDecorations.read(reader)) {
                return;
            }
            const visibleEditors = observableFromEvent(this, this._editorService.onDidVisibleEditorsChange, () => this._editorService.visibleTextEditorControls);
            mapObservableArrayCached(this, visibleEditors, (editor, store) => {
                if (editor instanceof CodeEditorWidget) {
                    const obsEditor = observableCodeEditor(editor);
                    const cssStyles = new DynamicCssRules(editor);
                    const decorations = new CachedFunction((source) => {
                        const r = store.add(cssStyles.createClassNameRef({
                            backgroundColor: source.getColor(),
                        }));
                        return r.className;
                    });
                    store.add(obsEditor.setDecorations(derived(reader => {
                        const uri = obsEditor.model.read(reader)?.uri;
                        if (!uri) {
                            return [];
                        }
                        const doc = this._workspace.getDocument(uri);
                        if (!doc) {
                            return [];
                        }
                        const docsState = impl.docsState.read(reader).get(doc);
                        if (!docsState) {
                            return [];
                        }
                        const ranges = (docsState.longtermTracker.read(reader)?.getTrackedRanges(reader)) ?? [];
                        return ranges.map(r => ({
                            range: doc.value.read(undefined).getTransformer().getRange(r.range),
                            options: {
                                description: 'editSourceTracking',
                                inlineClassName: decorations.get(r.source),
                            }
                        }));
                    })));
                }
            }).recomputeInitiallyAndOnChange(reader.store);
        }));
        this._register(autorun(reader => {
            if (!this._editSourceTrackingShowStatusBar.read(reader)) {
                return;
            }
            const statusBarItem = reader.store.add(this._statusbarService.addEntry({
                name: '',
                text: '',
                command: this._showStateInMarkdownDoc,
                tooltip: 'Edit Source Tracking',
                ariaLabel: '',
            }, 'editTelemetry', 1 /* StatusbarAlignment.RIGHT */, 100));
            const sumChangedCharacters = derived(reader => {
                const docs = impl.docsState.read(reader);
                let sum = 0;
                for (const state of docs.values()) {
                    const t = state.longtermTracker.read(reader);
                    if (!t) {
                        continue;
                    }
                    const d = state.getTelemetryData(t.getTrackedRanges(reader));
                    sum += d.totalModifiedCharactersInFinalState;
                }
                return sum;
            });
            const tooltipMarkdownString = derived(reader => {
                const docs = impl.docsState.read(reader);
                const docsDataInTooltip = [];
                const editSources = [];
                for (const [doc, state] of docs) {
                    const tracker = state.longtermTracker.read(reader);
                    if (!tracker) {
                        continue;
                    }
                    const trackedRanges = tracker.getTrackedRanges(reader);
                    const data = state.getTelemetryData(trackedRanges);
                    if (data.totalModifiedCharactersInFinalState === 0) {
                        continue; // Don't include unmodified documents in tooltip
                    }
                    editSources.push(...trackedRanges.map(r => r.source));
                    // Filter out unmodified properties as these are not interesting to see in the hover
                    const filteredData = Object.fromEntries(Object.entries(data).filter(([_, value]) => !(typeof value === 'number') || value !== 0));
                    docsDataInTooltip.push([
                        `### ${doc.uri.fsPath}`,
                        '```json',
                        JSON.stringify(filteredData, undefined, '\t'),
                        '```',
                        '\n'
                    ].join('\n'));
                }
                let tooltipContent;
                if (docsDataInTooltip.length === 0) {
                    tooltipContent = 'No modified documents';
                }
                else if (docsDataInTooltip.length <= 3) {
                    tooltipContent = docsDataInTooltip.join('\n\n');
                }
                else {
                    const lastThree = docsDataInTooltip.slice(-3);
                    tooltipContent = '...\n\n' + lastThree.join('\n\n');
                }
                const agenda = this._createEditSourceAgenda(editSources);
                const tooltipWithCommand = new MarkdownString(tooltipContent + '\n\n[View Details](command:' + this._showStateInMarkdownDoc + ')');
                tooltipWithCommand.appendMarkdown('\n\n' + agenda + '\n\nToggle decorations: [Click here](command:' + this._toggleDecorations + ')');
                tooltipWithCommand.isTrusted = { enabledCommands: [this._toggleDecorations] };
                tooltipWithCommand.supportHtml = true;
                return tooltipWithCommand;
            });
            reader.store.add(autorun(reader => {
                statusBarItem.update({
                    name: 'editTelemetry',
                    text: `$(edit) ${sumChangedCharacters.read(reader)} chars inserted`,
                    ariaLabel: `Edit Source Tracking: ${sumChangedCharacters.read(reader)} modified characters`,
                    tooltip: tooltipMarkdownString.read(reader),
                    command: this._showStateInMarkdownDoc,
                });
            }));
            reader.store.add(CommandsRegistry.registerCommand(this._toggleDecorations, () => {
                this._editSourceTrackingShowDecorations.set(!this._editSourceTrackingShowDecorations.read(undefined), undefined);
            }));
        }));
    }
    _createEditSourceAgenda(editSources) {
        // Collect all edit sources from the tracked documents
        const editSourcesSeen = new Set();
        const editSourceInfo = [];
        for (const editSource of editSources) {
            if (!editSourcesSeen.has(editSource.toString())) {
                editSourcesSeen.add(editSource.toString());
                editSourceInfo.push({ name: editSource.toString(), color: editSource.getColor() });
            }
        }
        const agendaItems = editSourceInfo.map(info => `<span style="background-color:${info.color};border-radius:3px;">${info.name}</span>`);
        return agendaItems.join(' ');
    }
};
EditTrackingFeature = __decorate([
    __param(2, IConfigurationService),
    __param(3, IInstantiationService),
    __param(4, IStatusbarService),
    __param(5, IEditorService),
    __param(6, IExtensionService)
], EditTrackingFeature);
export { EditTrackingFeature };
function makeSettable(obs) {
    const overrideObs = observableValue('overrideObs', undefined);
    return derivedWithSetter(overrideObs, (reader) => {
        return overrideObs.read(reader) ?? obs.read(reader);
    }, (value, tx) => {
        overrideObs.set(value, tx);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNvdXJjZVRyYWNraW5nRmVhdHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvZWRpdFNvdXJjZVRyYWNraW5nRmVhdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE9BQU8sRUFBb0MsZUFBZSxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDak0sT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRXZHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxjQUFj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