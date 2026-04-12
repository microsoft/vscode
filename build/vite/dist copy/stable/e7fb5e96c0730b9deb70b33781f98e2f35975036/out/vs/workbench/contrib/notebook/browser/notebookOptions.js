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
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { FontMeasurements } from '../../../../editor/browser/config/fontMeasurements.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { createBareFontInfoFromRawSettings } from '../../../../editor/common/config/fontInfoFromSettings.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { NotebookSetting } from '../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../common/notebookExecutionStateService.js';
const SCROLLABLE_ELEMENT_PADDING_TOP = 18;
export const OutputInnerContainerTopPadding = 4;
const defaultConfigConstants = Object.freeze({
    codeCellLeftMargin: 28,
    cellRunGutter: 32,
    markdownCellTopMargin: 8,
    markdownCellBottomMargin: 8,
    markdownCellLeftMargin: 0,
    markdownCellGutter: 32,
    focusIndicatorLeftMargin: 4
});
const compactConfigConstants = Object.freeze({
    codeCellLeftMargin: 8,
    cellRunGutter: 36,
    markdownCellTopMargin: 6,
    markdownCellBottomMargin: 6,
    markdownCellLeftMargin: 8,
    markdownCellGutter: 36,
    focusIndicatorLeftMargin: 4
});
let NotebookOptions = class NotebookOptions extends Disposable {
    constructor(targetWindow, isReadonly, overrides, configurationService, notebookExecutionStateService, codeEditorService) {
        super();
        this.targetWindow = targetWindow;
        this.isReadonly = isReadonly;
        this.overrides = overrides;
        this.configurationService = configurationService;
        this.notebookExecutionStateService = notebookExecutionStateService;
        this.codeEditorService = codeEditorService;
        this._onDidChangeOptions = this._register(new Emitter());
        this.onDidChangeOptions = this._onDidChangeOptions.event;
        this._editorTopPadding = 12;
        this.previousModelToCompare = observableValue('previousModelToCompare', undefined);
        const showCellStatusBar = this.configurationService.getValue(NotebookSetting.showCellStatusBar);
        const globalToolbar = overrides?.globalToolbar ?? this.configurationService.getValue(NotebookSetting.globalToolbar) ?? true;
        const stickyScrollEnabled = overrides?.stickyScrollEnabled ?? this.configurationService.getValue(NotebookSetting.stickyScrollEnabled) ?? false;
        const stickyScrollMode = this._computeStickyScrollModeOption();
        const consolidatedOutputButton = this.configurationService.getValue(NotebookSetting.consolidatedOutputButton) ?? true;
        const consolidatedRunButton = this.configurationService.getValue(NotebookSetting.consolidatedRunButton) ?? false;
        const dragAndDropEnabled = overrides?.dragAndDropEnabled ?? this.configurationService.getValue(NotebookSetting.dragAndDropEnabled) ?? true;
        const cellToolbarLocation = this.configurationService.getValue(NotebookSetting.cellToolbarLocation) ?? { 'default': 'right' };
        const cellToolbarInteraction = overrides?.cellToolbarInteraction ?? this.configurationService.getValue(NotebookSetting.cellToolbarVisibility);
        const compactView = this.configurationService.getValue(NotebookSetting.compactView) ?? true;
        const focusIndicator = this._computeFocusIndicatorOption();
        const insertToolbarPosition = this._computeInsertToolbarPositionOption(this.isReadonly);
        const insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
        const showFoldingControls = this._computeShowFoldingControlsOption();
        // const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(compactView, insertToolbarPosition, insertToolbarAlignment);
        const fontSize = this.configurationService.getValue('editor.fontSize');
        const markupFontSize = this.configurationService.getValue(NotebookSetting.markupFontSize);
        const markdownLineHeight = this.configurationService.getValue(NotebookSetting.markdownLineHeight);
        let editorOptionsCustomizations = this.configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) ?? {};
        editorOptionsCustomizations = isObject(editorOptionsCustomizations) ? editorOptionsCustomizations : {};
        const interactiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);
        // TOOD @rebornix remove after a few iterations of deprecated setting
        let outputLineHeightSettingValue;
        const deprecatedOutputLineHeightSetting = this.configurationService.getValue(NotebookSetting.outputLineHeightDeprecated);
        if (deprecatedOutputLineHeightSetting !== undefined) {
            this._migrateDeprecatedSetting(NotebookSetting.outputLineHeightDeprecated, NotebookSetting.outputLineHeight);
            outputLineHeightSettingValue = deprecatedOutputLineHeightSetting;
        }
        else {
            outputLineHeightSettingValue = this.configurationService.getValue(NotebookSetting.outputLineHeight);
        }
        let outputFontSize;
        const deprecatedOutputFontSizeSetting = this.configurationService.getValue(NotebookSetting.outputFontSizeDeprecated);
        if (deprecatedOutputFontSizeSetting !== undefined) {
            this._migrateDeprecatedSetting(NotebookSetting.outputFontSizeDeprecated, NotebookSetting.outputFontSize);
            outputFontSize = deprecatedOutputFontSizeSetting;
        }
        else {
            outputFontSize = this.configurationService.getValue(NotebookSetting.outputFontSize) || fontSize;
        }
        let outputFontFamily;
        const deprecatedOutputFontFamilySetting = this.configurationService.getValue(NotebookSetting.outputFontFamilyDeprecated);
        if (deprecatedOutputFontFamilySetting !== undefined) {
            this._migrateDeprecatedSetting(NotebookSetting.outputFontFamilyDeprecated, NotebookSetting.outputFontFamily);
            outputFontFamily = deprecatedOutputFontFamilySetting;
        }
        else {
            outputFontFamily = this.configurationService.getValue(NotebookSetting.outputFontFamily);
        }
        let outputScrolling;
        const deprecatedOutputScrollingSetting = this.configurationService.getValue(NotebookSetting.outputScrollingDeprecated);
        if (deprecatedOutputScrollingSetting !== undefined) {
            this._migrateDeprecatedSetting(NotebookSetting.outputScrollingDeprecated, NotebookSetting.outputScrolling);
            outputScrolling = deprecatedOutputScrollingSetting;
        }
        else {
            outputScrolling = this.configurationService.getValue(NotebookSetting.outputScrolling);
        }
        const outputLineHeight = this._computeOutputLineHeight(outputLineHeightSettingValue, outputFontSize);
        const outputWordWrap = this.configurationService.getValue(NotebookSetting.outputWordWrap);
        const outputLineLimit = this.configurationService.getValue(NotebookSetting.textOutputLineLimit) ?? 30;
        const linkifyFilePaths = this.configurationService.getValue(NotebookSetting.LinkifyOutputFilePaths) ?? true;
        const minimalErrors = this.configurationService.getValue(NotebookSetting.minimalErrorRendering);
        const markupFontFamily = this.configurationService.getValue(NotebookSetting.markupFontFamily);
        const editorTopPadding = this._computeEditorTopPadding();
        this._layoutConfiguration = {
            ...(compactView ? compactConfigConstants : defaultConfigConstants),
            cellTopMargin: 6,
            cellBottomMargin: 6,
            cellRightMargin: 16,
            cellStatusBarHeight: 22,
            cellOutputPadding: 8,
            markdownPreviewPadding: 8,
            // bottomToolbarHeight: bottomToolbarHeight,
            // bottomToolbarGap: bottomToolbarGap,
            editorToolbarHeight: 0,
            editorTopPadding: editorTopPadding,
            editorBottomPadding: 4,
            editorBottomPaddingWithoutStatusBar: 12,
            collapsedIndicatorHeight: 28,
            showCellStatusBar,
            globalToolbar,
            stickyScrollEnabled,
            stickyScrollMode,
            consolidatedOutputButton,
            consolidatedRunButton,
            dragAndDropEnabled,
            cellToolbarLocation,
            cellToolbarInteraction,
            compactView,
            focusIndicator,
            insertToolbarPosition,
            insertToolbarAlignment,
            showFoldingControls,
            fontSize,
            outputFontSize,
            outputFontFamily,
            outputLineHeight,
            markupFontSize,
            markdownLineHeight,
            editorOptionsCustomizations,
            focusIndicatorGap: 3,
            interactiveWindowCollapseCodeCells,
            markdownFoldHintHeight: 22,
            outputScrolling: outputScrolling,
            outputWordWrap: outputWordWrap,
            outputLineLimit: outputLineLimit,
            outputLinkifyFilePaths: linkifyFilePaths,
            outputMinimalError: minimalErrors,
            markupFontFamily,
            disableRulers: overrides?.disableRulers,
        };
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            this._updateConfiguration(e);
        }));
    }
    updateOptions(isReadonly) {
        if (this.isReadonly !== isReadonly) {
            this.isReadonly = isReadonly;
            this._updateConfiguration({
                affectsConfiguration(configuration) {
                    return configuration === NotebookSetting.insertToolbarLocation;
                },
                source: 7 /* ConfigurationTarget.DEFAULT */,
                affectedKeys: new Set([NotebookSetting.insertToolbarLocation]),
                change: { keys: [NotebookSetting.insertToolbarLocation], overrides: [] },
            });
        }
    }
    _computeEditorTopPadding() {
        let decorationTriggeredAdjustment = false;
        const updateEditorTopPadding = (top) => {
            this._editorTopPadding = top;
            const configuration = Object.assign({}, this._layoutConfiguration);
            configuration.editorTopPadding = this._editorTopPadding;
            this._layoutConfiguration = configuration;
            this._onDidChangeOptions.fire({ editorTopPadding: true });
        };
        const decorationCheckSet = new Set();
        const onDidAddDecorationType = (e) => {
            if (decorationTriggeredAdjustment) {
                return;
            }
            if (decorationCheckSet.has(e)) {
                return;
            }
            try {
                const options = this.codeEditorService.resolveDecorationOptions(e, true);
                if (options.afterContentClassName || options.beforeContentClassName) {
                    const cssRules = this.codeEditorService.resolveDecorationCSSRules(e);
                    if (cssRules !== null) {
                        for (let i = 0; i < cssRules.length; i++) {
                            // The following ways to index into the list are equivalent
                            if ((cssRules[i].selectorText.endsWith('::after') || cssRules[i].selectorText.endsWith('::after'))
                                && cssRules[i].cssText.indexOf('top:') > -1) {
                                // there is a `::before` or `::after` text decoration whose position is above or below current line
                                // we at least make sure that the editor top padding is at least one line
                                const editorOptions = this.configurationService.getValue('editor');
                                updateEditorTopPadding(createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value).lineHeight + 2);
                                decorationTriggeredAdjustment = true;
                                break;
                            }
                        }
                    }
                }
                decorationCheckSet.add(e);
            }
            catch (_ex) {
                // do not throw and break notebook
            }
        };
        this._register(this.codeEditorService.onDecorationTypeRegistered(onDidAddDecorationType));
        this.codeEditorService.listDecorationTypes().forEach(onDidAddDecorationType);
        return this._editorTopPadding;
    }
    _migrateDeprecatedSetting(deprecatedKey, key) {
        const deprecatedSetting = this.configurationService.inspect(deprecatedKey);
        if (deprecatedSetting.application !== undefined) {
            this.configurationService.updateValue(deprecatedKey, undefined, 1 /* ConfigurationTarget.APPLICATION */);
            this.configurationService.updateValue(key, deprecatedSetting.application.value, 1 /* ConfigurationTarget.APPLICATION */);
        }
        if (deprecatedSetting.user !== undefined) {
            this.configurationService.updateValue(deprecatedKey, undefined, 2 /* ConfigurationTarget.USER */);
            this.configurationService.updateValue(key, deprecatedSetting.user.value, 2 /* ConfigurationTarget.USER */);
        }
        if (deprecatedSetting.userLocal !== undefined) {
            this.configurationService.updateValue(deprecatedKey, undefined, 3 /* ConfigurationTarget.USER_LOCAL */);
            this.configurationService.updateValue(key, deprecatedSetting.userLocal.value, 3 /* ConfigurationTarget.USER_LOCAL */);
        }
        if (deprecatedSetting.userRemote !== undefined) {
            this.configurationService.updateValue(deprecatedKey, undefined, 4 /* ConfigurationTarget.USER_REMOTE */);
            this.configurationService.updateValue(key, deprecatedSetting.userRemote.value, 4 /* ConfigurationTarget.USER_REMOTE */);
        }
        if (deprecatedSetting.workspace !== undefined) {
            this.configurationService.updateValue(deprecatedKey, undefined, 5 /* ConfigurationTarget.WORKSPACE */);
            this.configurationService.updateValue(key, deprecatedSetting.workspace.value, 5 /* ConfigurationTarget.WORKSPACE */);
        }
        if (deprecatedSetting.workspaceFolder !== undefined) {
            this.configurationService.updateValue(deprecatedKey, undefined, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
            this.configurationService.updateValue(key, deprecatedSetting.workspaceFolder.value, 6 /* ConfigurationTarget.WORKSPACE_FOLDER */);
        }
    }
    _computeOutputLineHeight(lineHeight, outputFontSize) {
        const minimumLineHeight = 9;
        if (lineHeight === 0) {
            // use editor line height
            const editorOptions = this.configurationService.getValue('editor');
            const fontInfo = FontMeasurements.readFontInfo(this.targetWindow, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value));
            lineHeight = fontInfo.lineHeight;
        }
        else if (lineHeight < minimumLineHeight) {
            // Values too small to be line heights in pixels are in ems.
            let fontSize = outputFontSize;
            if (fontSize === 0) {
                fontSize = this.configurationService.getValue('editor.fontSize');
            }
            lineHeight = lineHeight * fontSize;
        }
        // Enforce integer, minimum constraints
        lineHeight = Math.round(lineHeight);
        if (lineHeight < minimumLineHeight) {
            lineHeight = minimumLineHeight;
        }
        return lineHeight;
    }
    _updateConfiguration(e) {
        const cellStatusBarVisibility = e.affectsConfiguration(NotebookSetting.showCellStatusBar);
        const cellToolbarLocation = e.affectsConfiguration(NotebookSetting.cellToolbarLocation);
        const cellToolbarInteraction = e.affectsConfiguration(NotebookSetting.cellToolbarVisibility);
        const compactView = e.affectsConfiguration(NotebookSetting.compactView);
        const focusIndicator = e.affectsConfiguration(NotebookSetting.focusIndicator);
        const insertToolbarPosition = e.affectsConfiguration(NotebookSetting.insertToolbarLocation);
        const insertToolbarAlignment = e.affectsConfiguration(NotebookSetting.experimentalInsertToolbarAlignment);
        const globalToolbar = e.affectsConfiguration(NotebookSetting.globalToolbar);
        const stickyScrollEnabled = e.affectsConfiguration(NotebookSetting.stickyScrollEnabled);
        const stickyScrollMode = e.affectsConfiguration(NotebookSetting.stickyScrollMode);
        const consolidatedOutputButton = e.affectsConfiguration(NotebookSetting.consolidatedOutputButton);
        const consolidatedRunButton = e.affectsConfiguration(NotebookSetting.consolidatedRunButton);
        const showFoldingControls = e.affectsConfiguration(NotebookSetting.showFoldingControls);
        const dragAndDropEnabled = e.affectsConfiguration(NotebookSetting.dragAndDropEnabled);
        const fontSize = e.affectsConfiguration('editor.fontSize');
        const outputFontSize = e.affectsConfiguration(NotebookSetting.outputFontSize);
        const markupFontSize = e.affectsConfiguration(NotebookSetting.markupFontSize);
        const markdownLineHeight = e.affectsConfiguration(NotebookSetting.markdownLineHeight);
        const fontFamily = e.affectsConfiguration('editor.fontFamily');
        const outputFontFamily = e.affectsConfiguration(NotebookSetting.outputFontFamily);
        const editorOptionsCustomizations = e.affectsConfiguration(NotebookSetting.cellEditorOptionsCustomizations);
        const interactiveWindowCollapseCodeCells = e.affectsConfiguration(NotebookSetting.interactiveWindowCollapseCodeCells);
        const outputLineHeight = e.affectsConfiguration(NotebookSetting.outputLineHeight);
        const outputScrolling = e.affectsConfiguration(NotebookSetting.outputScrolling);
        const outputWordWrap = e.affectsConfiguration(NotebookSetting.outputWordWrap);
        const outputLinkifyFilePaths = e.affectsConfiguration(NotebookSetting.LinkifyOutputFilePaths);
        const minimalError = e.affectsConfiguration(NotebookSetting.minimalErrorRendering);
        const markupFontFamily = e.affectsConfiguration(NotebookSetting.markupFontFamily);
        if (!cellStatusBarVisibility
            && !cellToolbarLocation
            && !cellToolbarInteraction
            && !compactView
            && !focusIndicator
            && !insertToolbarPosition
            && !insertToolbarAlignment
            && !globalToolbar
            && !stickyScrollEnabled
            && !stickyScrollMode
            && !consolidatedOutputButton
            && !consolidatedRunButton
            && !showFoldingControls
            && !dragAndDropEnabled
            && !fontSize
            && !outputFontSize
            && !markupFontSize
            && !markdownLineHeight
            && !fontFamily
            && !outputFontFamily
            && !editorOptionsCustomizations
            && !interactiveWindowCollapseCodeCells
            && !outputLineHeight
            && !outputScrolling
            && !outputWordWrap
            && !outputLinkifyFilePaths
            && !minimalError
            && !markupFontFamily) {
            return;
        }
        let configuration = Object.assign({}, this._layoutConfiguration);
        if (cellStatusBarVisibility) {
            configuration.showCellStatusBar = this.configurationService.getValue(NotebookSetting.showCellStatusBar);
        }
        if (cellToolbarLocation) {
            configuration.cellToolbarLocation = this.configurationService.getValue(NotebookSetting.cellToolbarLocation) ?? { 'default': 'right' };
        }
        if (cellToolbarInteraction && !this.overrides?.cellToolbarInteraction) {
            configuration.cellToolbarInteraction = this.configurationService.getValue(NotebookSetting.cellToolbarVisibility);
        }
        if (focusIndicator) {
            configuration.focusIndicator = this._computeFocusIndicatorOption();
        }
        if (compactView) {
            const compactViewValue = this.configurationService.getValue(NotebookSetting.compactView) ?? true;
            configuration = Object.assign(configuration, {
                ...(compactViewValue ? compactConfigConstants : defaultConfigConstants),
            });
            configuration.compactView = compactViewValue;
        }
        if (insertToolbarAlignment) {
            configuration.insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
        }
        if (insertToolbarPosition) {
            configuration.insertToolbarPosition = this._computeInsertToolbarPositionOption(this.isReadonly);
        }
        if (globalToolbar && this.overrides?.globalToolbar === undefined) {
            configuration.globalToolbar = this.configurationService.getValue(NotebookSetting.globalToolbar) ?? true;
        }
        if (stickyScrollEnabled && this.overrides?.stickyScrollEnabled === undefined) {
            configuration.stickyScrollEnabled = this.configurationService.getValue(NotebookSetting.stickyScrollEnabled) ?? false;
        }
        if (stickyScrollMode) {
            configuration.stickyScrollMode = this.configurationService.getValue(NotebookSetting.stickyScrollMode) ?? 'flat';
        }
        if (consolidatedOutputButton) {
            configuration.consolidatedOutputButton = this.configurationService.getValue(NotebookSetting.consolidatedOutputButton) ?? true;
        }
        if (consolidatedRunButton) {
            configuration.consolidatedRunButton = this.configurationService.getValue(NotebookSetting.consolidatedRunButton) ?? true;
        }
        if (showFoldingControls) {
            configuration.showFoldingControls = this._computeShowFoldingControlsOption();
        }
        if (dragAndDropEnabled) {
            configuration.dragAndDropEnabled = this.configurationService.getValue(NotebookSetting.dragAndDropEnabled) ?? true;
        }
        if (fontSize) {
            configuration.fontSize = this.configurationService.getValue('editor.fontSize');
        }
        if (outputFontSize || fontSize) {
            configuration.outputFontSize = this.configurationService.getValue(NotebookSetting.outputFontSize) || configuration.fontSize;
        }
        if (markupFontSize) {
            configuration.markupFontSize = this.configurationService.getValue(NotebookSetting.markupFontSize);
        }
        if (markdownLineHeight) {
            configuration.markdownLineHeight = this.configurationService.getValue(NotebookSetting.markdownLineHeight);
        }
        if (outputFontFamily) {
            configuration.outputFontFamily = this.configurationService.getValue(NotebookSetting.outputFontFamily);
        }
        if (editorOptionsCustomizations) {
            configuration.editorOptionsCustomizations = this.configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations);
        }
        if (interactiveWindowCollapseCodeCells) {
            configuration.interactiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);
        }
        if (outputLineHeight || fontSize || outputFontSize) {
            const lineHeight = this.configurationService.getValue(NotebookSetting.outputLineHeight);
            configuration.outputLineHeight = this._computeOutputLineHeight(lineHeight, configuration.outputFontSize);
        }
        if (outputWordWrap) {
            configuration.outputWordWrap = this.configurationService.getValue(NotebookSetting.outputWordWrap);
        }
        if (outputScrolling) {
            configuration.outputScrolling = this.configurationService.getValue(NotebookSetting.outputScrolling);
        }
        if (outputLinkifyFilePaths) {
            configuration.outputLinkifyFilePaths = this.configurationService.getValue(NotebookSetting.LinkifyOutputFilePaths);
        }
        if (minimalError) {
            configuration.outputMinimalError = this.configurationService.getValue(NotebookSetting.minimalErrorRendering);
        }
        if (markupFontFamily) {
            configuration.markupFontFamily = this.configurationService.getValue(NotebookSetting.markupFontFamily);
        }
        this._layoutConfiguration = Object.freeze(configuration);
        // trigger event
        this._onDidChangeOptions.fire({
            cellStatusBarVisibility,
            cellToolbarLocation,
            cellToolbarInteraction,
            compactView,
            focusIndicator,
            insertToolbarPosition,
            insertToolbarAlignment,
            globalToolbar,
            stickyScrollEnabled,
            stickyScrollMode,
            showFoldingControls,
            consolidatedOutputButton,
            consolidatedRunButton,
            dragAndDropEnabled,
            fontSize,
            outputFontSize,
            markupFontSize,
            markdownLineHeight,
            fontFamily,
            outputFontFamily,
            editorOptionsCustomizations,
            interactiveWindowCollapseCodeCells,
            outputLineHeight,
            outputScrolling,
            outputWordWrap,
            outputLinkifyFilePaths,
            minimalError,
            markupFontFamily
        });
    }
    _computeInsertToolbarPositionOption(isReadOnly) {
        return isReadOnly ? 'hidden' : this.configurationService.getValue(NotebookSetting.insertToolbarLocation) ?? 'both';
    }
    _computeInsertToolbarAlignmentOption() {
        return this.configurationService.getValue(NotebookSetting.experimentalInsertToolbarAlignment) ?? 'center';
    }
    _computeShowFoldingControlsOption() {
        return this.configurationService.getValue(NotebookSetting.showFoldingControls) ?? 'mouseover';
    }
    _computeFocusIndicatorOption() {
        return this.configurationService.getValue(NotebookSetting.focusIndicator) ?? 'gutter';
    }
    _computeStickyScrollModeOption() {
        return this.configurationService.getValue(NotebookSetting.stickyScrollMode) ?? 'flat';
    }
    getCellCollapseDefault() {
        return this._layoutConfiguration.interactiveWindowCollapseCodeCells === 'never' ?
            {
                codeCell: {
                    inputCollapsed: false
                }
            } : {
            codeCell: {
                inputCollapsed: true
            }
        };
    }
    getLayoutConfiguration() {
        return this._layoutConfiguration;
    }
    getDisplayOptions() {
        return this._layoutConfiguration;
    }
    getCellEditorContainerLeftMargin() {
        const { codeCellLeftMargin, cellRunGutter } = this._layoutConfiguration;
        return codeCellLeftMargin + cellRunGutter;
    }
    computeCollapsedMarkdownCellHeight(viewType) {
        const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
        return this._layoutConfiguration.markdownCellTopMargin
            + this._layoutConfiguration.collapsedIndicatorHeight
            + bottomToolbarGap
            + this._layoutConfiguration.markdownCellBottomMargin;
    }
    computeBottomToolbarOffset(totalHeight, viewType) {
        const { bottomToolbarGap, bottomToolbarHeight } = this.computeBottomToolbarDimensions(viewType);
        return totalHeight
            - bottomToolbarGap
            - bottomToolbarHeight / 2;
    }
    computeCodeCellEditorWidth(outerWidth) {
        return outerWidth - (this._layoutConfiguration.codeCellLeftMargin
            + this._layoutConfiguration.cellRunGutter
            + this._layoutConfiguration.cellRightMargin);
    }
    computeMarkdownCellEditorWidth(outerWidth) {
        return outerWidth
            - this._layoutConfiguration.markdownCellGutter
            - this._layoutConfiguration.markdownCellLeftMargin
            - this._layoutConfiguration.cellRightMargin;
    }
    computeStatusBarHeight() {
        return this._layoutConfiguration.cellStatusBarHeight;
    }
    _computeBottomToolbarDimensions(compactView, insertToolbarPosition, insertToolbarAlignment, cellToolbar) {
        if (insertToolbarAlignment === 'left' || cellToolbar !== 'hidden') {
            return {
                bottomToolbarGap: 18,
                bottomToolbarHeight: 18
            };
        }
        if (insertToolbarPosition === 'betweenCells' || insertToolbarPosition === 'both') {
            return compactView ? {
                bottomToolbarGap: 12,
                bottomToolbarHeight: 20
            } : {
                bottomToolbarGap: 20,
                bottomToolbarHeight: 20
            };
        }
        else {
            return {
                bottomToolbarGap: 0,
                bottomToolbarHeight: 0
            };
        }
    }
    computeBottomToolbarDimensions(viewType) {
        const configuration = this._layoutConfiguration;
        const cellToolbarPosition = this.computeCellToolbarLocation(viewType);
        const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(configuration.compactView, configuration.insertToolbarPosition, configuration.insertToolbarAlignment, cellToolbarPosition);
        return {
            bottomToolbarGap,
            bottomToolbarHeight
        };
    }
    computeCellToolbarLocation(viewType) {
        const cellToolbarLocation = this._layoutConfiguration.cellToolbarLocation;
        if (typeof cellToolbarLocation === 'string') {
            if (cellToolbarLocation === 'left' || cellToolbarLocation === 'right' || cellToolbarLocation === 'hidden') {
                return cellToolbarLocation;
            }
        }
        else {
            if (viewType) {
                const notebookSpecificSetting = cellToolbarLocation[viewType] ?? cellToolbarLocation['default'];
                let cellToolbarLocationForCurrentView = 'right';
                switch (notebookSpecificSetting) {
                    case 'left':
                        cellToolbarLocationForCurrentView = 'left';
                        break;
                    case 'right':
                        cellToolbarLocationForCurrentView = 'right';
                        break;
                    case 'hidden':
                        cellToolbarLocationForCurrentView = 'hidden';
                        break;
                    default:
                        cellToolbarLocationForCurrentView = 'right';
                        break;
                }
                return cellToolbarLocationForCurrentView;
            }
        }
        return 'right';
    }
    computeTopInsertToolbarHeight(viewType) {
        if (this._layoutConfiguration.insertToolbarPosition === 'betweenCells' || this._layoutConfiguration.insertToolbarPosition === 'both') {
            return SCROLLABLE_ELEMENT_PADDING_TOP;
        }
        const cellToolbarLocation = this.computeCellToolbarLocation(viewType);
        if (cellToolbarLocation === 'left' || cellToolbarLocation === 'right') {
            return SCROLLABLE_ELEMENT_PADDING_TOP;
        }
        return 0;
    }
    computeEditorPadding(internalMetadata, cellUri) {
        return {
            top: this._editorTopPadding,
            bottom: this.statusBarIsVisible(internalMetadata, cellUri)
                ? this._layoutConfiguration.editorBottomPadding
                : this._layoutConfiguration.editorBottomPaddingWithoutStatusBar
        };
    }
    computeEditorStatusbarHeight(internalMetadata, cellUri) {
        return this.statusBarIsVisible(internalMetadata, cellUri) ? this.computeStatusBarHeight() : 0;
    }
    statusBarIsVisible(internalMetadata, cellUri) {
        const exe = this.notebookExecutionStateService.getCellExecution(cellUri);
        if (this._layoutConfiguration.showCellStatusBar === 'visible') {
            return true;
        }
        else if (this._layoutConfiguration.showCellStatusBar === 'visibleAfterExecute') {
            return typeof internalMetadata.lastRunSuccess === 'boolean' || exe !== undefined;
        }
        else {
            return false;
        }
    }
    computeWebviewOptions() {
        return {
            outputNodePadding: this._layoutConfiguration.cellOutputPadding,
            outputNodeLeftPadding: this._layoutConfiguration.cellOutputPadding,
            previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
            markdownLeftMargin: this._layoutConfiguration.markdownCellGutter + this._layoutConfiguration.markdownCellLeftMargin,
            leftMargin: this._layoutConfiguration.codeCellLeftMargin,
            rightMargin: this._layoutConfiguration.cellRightMargin,
            runGutter: this._layoutConfiguration.cellRunGutter,
            dragAndDropEnabled: this._layoutConfiguration.dragAndDropEnabled,
            fontSize: this._layoutConfiguration.fontSize,
            outputFontSize: this._layoutConfiguration.outputFontSize,
            outputFontFamily: this._layoutConfiguration.outputFontFamily,
            markupFontSize: this._layoutConfiguration.markupFontSize,
            markdownLineHeight: this._layoutConfiguration.markdownLineHeight,
            outputLineHeight: this._layoutConfiguration.outputLineHeight,
            outputScrolling: this._layoutConfiguration.outputScrolling,
            outputWordWrap: this._layoutConfiguration.outputWordWrap,
            outputLineLimit: this._layoutConfiguration.outputLineLimit,
            outputLinkifyFilePaths: this._layoutConfiguration.outputLinkifyFilePaths,
            minimalError: this._layoutConfiguration.outputMinimalError,
            markupFontFamily: this._layoutConfiguration.markupFontFamily
        };
    }
    computeDiffWebviewOptions() {
        return {
            outputNodePadding: this._layoutConfiguration.cellOutputPadding,
            outputNodeLeftPadding: 0,
            previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
            markdownLeftMargin: 0,
            leftMargin: 32,
            rightMargin: 0,
            runGutter: 0,
            dragAndDropEnabled: false,
            fontSize: this._layoutConfiguration.fontSize,
            outputFontSize: this._layoutConfiguration.outputFontSize,
            outputFontFamily: this._layoutConfiguration.outputFontFamily,
            markupFontSize: this._layoutConfiguration.markupFontSize,
            markdownLineHeight: this._layoutConfiguration.markdownLineHeight,
            outputLineHeight: this._layoutConfiguration.outputLineHeight,
            outputScrolling: this._layoutConfiguration.outputScrolling,
            outputWordWrap: this._layoutConfiguration.outputWordWrap,
            outputLineLimit: this._layoutConfiguration.outputLineLimit,
            outputLinkifyFilePaths: false,
            minimalError: false,
            markupFontFamily: this._layoutConfiguration.markupFontFamily
        };
    }
    computeIndicatorPosition(totalHeight, foldHintHeight, viewType) {
        const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
        return {
            bottomIndicatorTop: totalHeight - bottomToolbarGap - this._layoutConfiguration.cellBottomMargin - foldHintHeight,
            verticalIndicatorHeight: totalHeight - bottomToolbarGap - foldHintHeight
        };
    }
};
NotebookOptions = __decorate([
    __param(3, IConfigurationService),
    __param(4, INotebookExecutionStateService),
    __param(5, ICodeEditorService)
], NotebookOptions);
export { NotebookOptions };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPcHRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va09wdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUU5RixPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RyxPQUFPLEVBQWtELHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkosT0FBTyxFQUF1RyxlQUFlLEVBQXlCLE1BQU0sNkJBQTZCLENBQUM7QUFDMUwsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFNUYsTUFBTSw4QkFBOEIsR0FBRyxFQUFFLENBQUM7QUFFMUMsTUFBTSxDQUFDLE1BQU0sOEJBQThCLEdBQUcsQ0FBQyxDQUFDO0FBOEZoRCxNQUFNLHNCQUFzQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDNUMsa0JBQWtCLEVBQUUsRUFBRTtJQUN0QixhQUFhLEVBQUUsRUFBRTtJQUNqQixxQkFBcUIsRUFBRSxDQUFDO0lBQ3hCLHdCQUF3QixF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