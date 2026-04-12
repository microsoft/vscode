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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorunWithStore, observableFromEvent } from '../../../../base/common/observable.js';
import { registerDiffEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { EmbeddedDiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { FloatingEditorClickWidget } from '../../../browser/codeeditor.js';
import { Extensions } from '../../../common/configuration.js';
import { DiffEditorAccessibilityHelp } from './diffEditorAccessibilityHelp.js';
let DiffEditorHelperContribution = class DiffEditorHelperContribution extends Disposable {
    static { this.ID = 'editor.contrib.diffEditorHelper'; }
    constructor(_diffEditor, _instantiationService, _textResourceConfigurationService, _notificationService) {
        super();
        this._diffEditor = _diffEditor;
        this._instantiationService = _instantiationService;
        this._textResourceConfigurationService = _textResourceConfigurationService;
        this._notificationService = _notificationService;
        const isEmbeddedDiffEditor = this._diffEditor instanceof EmbeddedDiffEditorWidget;
        if (!isEmbeddedDiffEditor) {
            const computationResult = observableFromEvent(this, e => this._diffEditor.onDidUpdateDiff(e), () => /** @description diffEditor.diffComputationResult */ this._diffEditor.getDiffComputationResult());
            const onlyWhiteSpaceChange = computationResult.map(r => r && !r.identical && r.changes2.length === 0);
            this._register(autorunWithStore((reader, store) => {
                /** @description update state */
                if (onlyWhiteSpaceChange.read(reader)) {
                    const helperWidget = store.add(this._instantiationService.createInstance(FloatingEditorClickWidget, this._diffEditor.getModifiedEditor(), localize('hintWhitespace', "Show Whitespace Differences"), null));
                    store.add(helperWidget.onClick(() => {
                        this._textResourceConfigurationService.updateValue(this._diffEditor.getModel().modified.uri, 'diffEditor.ignoreTrimWhitespace', false);
                    }));
                    helperWidget.render();
                }
            }));
            this._register(this._diffEditor.onDidUpdateDiff(() => {
                const diffComputationResult = this._diffEditor.getDiffComputationResult();
                if (diffComputationResult && diffComputationResult.quitEarly) {
                    this._notificationService.prompt(Severity.Warning, localize('hintTimeout', "The diff algorithm was stopped early (after {0} ms.)", this._diffEditor.maxComputationTime), [{
                            label: localize('removeTimeout', "Remove Limit"),
                            run: () => {
                                this._textResourceConfigurationService.updateValue(this._diffEditor.getModel().modified.uri, 'diffEditor.maxComputationTime', 0);
                            }
                        }], {});
                }
            }));
        }
    }
};
DiffEditorHelperContribution = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITextResourceConfigurationService),
    __param(3, INotificationService)
], DiffEditorHelperContribution);
registerDiffEditorContribution(DiffEditorHelperContribution.ID, DiffEditorHelperContribution);
Registry.as(Extensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: 'diffEditor.experimental.collapseUnchangedRegions',
        migrateFn: (value, accessor) => {
            return [
                ['diffEditor.hideUnchangedRegions.enabled', { value }],
                ['diffEditor.experimental.collapseUnchangedRegions', { value: undefined }]
            ];
        }
    }]);
AccessibleViewRegistry.register(new DiffEditorAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvckhlbHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9kaWZmRWRpdG9ySGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUU5RixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUVwSCxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDOUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsVUFBVSxFQUFtQyxNQUFNLGtDQUFrQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRS9FLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTthQUM3QixPQUFFLEdBQUcsaUNBQWlDLEFBQXBDLENBQXFDO0lB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