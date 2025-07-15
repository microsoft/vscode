/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { FontMeasurements } from '../../../../editor/browser/config/fontMeasurements.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { BareFontInfo } from '../../../../editor/common/config/fontInfo.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { NotebookTextModel } from '../common/model/notebookTextModel.js';
import { InteractiveWindowCollapseCodeCells, NotebookCellDefaultCollapseConfig, NotebookCellInternalMetadata, NotebookSetting, ShowCellStatusBarType } from '../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../common/notebookExecutionStateService.js';

const SCROLLABLE_ELEMENT_PADDING_TOP = 18;

export const OutputInnerContainerTopPadding = 4;

export interface NotebookDisplayOptions { // TODO @Yoyokrazy rename to a more generic name, not display
	showCellStatusBar: ShowCellStatusBarType;
	cellToolbarLocation: string | { [key: string]: string };
	cellToolbarInteraction: string;
	compactView: boolean;
	focusIndicator: 'border' | 'gutter';
	insertToolbarPosition: 'betweenCells' | 'notebookToolbar' | 'both' | 'hidden';
	insertToolbarAlignment: 'left' | 'center';
	globalToolbar: boolean;
	stickyScrollEnabled: boolean;
	stickyScrollMode: 'flat' | 'indented';
	consolidatedOutputButton: boolean;
	consolidatedRunButton: boolean;
	showFoldingControls: 'always' | 'never' | 'mouseover';
	dragAndDropEnabled: boolean;
	interactiveWindowCollapseCodeCells: InteractiveWindowCollapseCodeCells;
	outputScrolling: boolean;
	outputWordWrap: boolean;
	outputLineLimit: number;
	outputLinkifyFilePaths: boolean;
	outputMinimalError: boolean;
	fontSize: number;
	outputFontSize: number;
	outputFontFamily: string;
	outputLineHeight: number;
	markupFontSize: number;
	markdownLineHeight: number;
	editorOptionsCustomizations: Partial<{
		'editor.indentSize': 'tabSize' | number;
		'editor.tabSize': number;
		'editor.insertSpaces': boolean;
	}> | undefined;
	markupFontFamily: string;
	disableRulers: boolean | undefined;
}

export interface NotebookLayoutConfiguration {
	cellRightMargin: number;
	cellRunGutter: number;
	cellTopMargin: number;
	cellBottomMargin: number;
	cellOutputPadding: number;
	codeCellLeftMargin: number;
	markdownCellLeftMargin: number;
	markdownCellGutter: number;
	markdownCellTopMargin: number;
	markdownCellBottomMargin: number;
	markdownPreviewPadding: number;
	markdownFoldHintHeight: number;
	editorToolbarHeight: number;
	editorTopPadding: number;
	editorBottomPadding: number;
	editorBottomPaddingWithoutStatusBar: number;
	collapsedIndicatorHeight: number;
	cellStatusBarHeight: number;
	focusIndicatorLeftMargin: number;
	focusIndicatorGap: number;
}

export interface NotebookOptionsChangeEvent {
	readonly cellStatusBarVisibility?: boolean;
	readonly cellToolbarLocation?: boolean;
	readonly cellToolbarInteraction?: boolean;
	readonly editorTopPadding?: boolean;
	readonly compactView?: boolean;
	readonly focusIndicator?: boolean;
	readonly insertToolbarPosition?: boolean;
	readonly insertToolbarAlignment?: boolean;
	readonly globalToolbar?: boolean;
	readonly stickyScrollEnabled?: boolean;
	readonly stickyScrollMode?: boolean;
	readonly showFoldingControls?: boolean;
	readonly consolidatedOutputButton?: boolean;
	readonly consolidatedRunButton?: boolean;
	readonly dragAndDropEnabled?: boolean;
	readonly fontSize?: boolean;
	readonly outputFontSize?: boolean;
	readonly markupFontSize?: boolean;
	readonly markdownLineHeight?: boolean;
	readonly fontFamily?: boolean;
	readonly outputFontFamily?: boolean;
	readonly editorOptionsCustomizations?: boolean;
	readonly interactiveWindowCollapseCodeCells?: boolean;
	readonly outputLineHeight?: boolean;
	readonly outputWordWrap?: boolean;
	readonly outputScrolling?: boolean;
	readonly outputLinkifyFilePaths?: boolean;
	readonly minimalError?: boolean;
	readonly readonly?: boolean;
	readonly markupFontFamily?: boolean;
}

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

export class NotebookOptions extends Disposable {
	private _layoutConfiguration: NotebookLayoutConfiguration & NotebookDisplayOptions;
	protected readonly _onDidChangeOptions = this._register(new Emitter<NotebookOptionsChangeEvent>());
	readonly onDidChangeOptions = this._onDidChangeOptions.event;
	private _editorTopPadding: number = 12;

	readonly previousModelToCompare = observableValue<NotebookTextModel | undefined>('previousModelToCompare', undefined);

	constructor(
		readonly targetWindow: CodeWindow,
		private isReadonly: boolean,
		private readonly overrides: { cellToolbarInteraction: string; globalToolbar: boolean; stickyScrollEnabled: boolean; dragAndDropEnabled: boolean; disableRulers: boolean } | undefined,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();
		const showCellStatusBar = this.configurationService.getValue<ShowCellStatusBarType>(NotebookSetting.showCellStatusBar);
		const globalToolbar = overrides?.globalToolbar ?? this.configurationService.getValue<boolean | undefined>(NotebookSetting.globalToolbar) ?? true;
		const stickyScrollEnabled = overrides?.stickyScrollEnabled ?? this.configurationService.getValue<boolean | undefined>(NotebookSetting.stickyScrollEnabled) ?? false;
		const stickyScrollMode = this._computeStickyScrollModeOption();
		const consolidatedOutputButton = this.configurationService.getValue<boolean | undefined>(NotebookSetting.consolidatedOutputButton) ?? true;
		const consolidatedRunButton = this.configurationService.getValue<boolean | undefined>(NotebookSetting.consolidatedRunButton) ?? false;
		const dragAndDropEnabled = overrides?.dragAndDropEnabled ?? this.configurationService.getValue<boolean | undefined>(NotebookSetting.dragAndDropEnabled) ?? true;
		const cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string }>(NotebookSetting.cellToolbarLocation) ?? { 'default': 'right' };
		const cellToolbarInteraction = overrides?.cellToolbarInteraction ?? this.configurationService.getValue<string>(NotebookSetting.cellToolbarVisibility);
		const compactView = this.configurationService.getValue<boolean | undefined>(NotebookSetting.compactView) ?? true;
		const focusIndicator = this._computeFocusIndicatorOption();
		const insertToolbarPosition = this._computeInsertToolbarPositionOption(this.isReadonly);
		const insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
		const showFoldingControls = this._computeShowFoldingControlsOption();
		// const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(compactView, insertToolbarPosition, insertToolbarAlignment);
		const fontSize = this.configurationService.getValue<number>('editor.fontSize');
		const markupFontSize = this.configurationService.getValue<number>(NotebookSetting.markupFontSize);
		const markdownLineHeight = this.configurationService.getValue<number>(NotebookSetting.markdownLineHeight);
		let editorOptionsCustomizations = this.configurationService.getValue<Partial<{
			'editor.indentSize': 'tabSize' | number;
			'editor.tabSize': number;
			'editor.insertSpaces': boolean;
		}>>(NotebookSetting.cellEditorOptionsCustomizations) ?? {};
		editorOptionsCustomizations = isObject(editorOptionsCustomizations) ? editorOptionsCustomizations : {};
		const interactiveWindowCollapseCodeCells: InteractiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);

		// TOOD @rebornix remove after a few iterations of deprecated setting
		let outputLineHeightSettingValue: number;
		const deprecatedOutputLineHeightSetting = this.configurationService.getValue<number>(NotebookSetting.outputLineHeightDeprecated);
		if (deprecatedOutputLineHeightSetting !== undefined) {
			this._migrateDeprecatedSetting(NotebookSetting.outputLineHeightDeprecated, NotebookSetting.outputLineHeight);
			outputLineHeightSettingValue = deprecatedOutputLineHeightSetting;
		} else {
			outputLineHeightSettingValue = this.configurationService.getValue<number>(NotebookSetting.outputLineHeight);
		}

		let outputFontSize: number;
		const deprecatedOutputFontSizeSetting = this.configurationService.getValue<number>(NotebookSetting.outputFontSizeDeprecated);
		if (deprecatedOutputFontSizeSetting !== undefined) {
			this._migrateDeprecatedSetting(NotebookSetting.outputFontSizeDeprecated, NotebookSetting.outputFontSize);
			outputFontSize = deprecatedOutputFontSizeSetting;
		} else {
			outputFontSize = this.configurationService.getValue<number>(NotebookSetting.outputFontSize) || fontSize;
		}

		let outputFontFamily: string;
		const deprecatedOutputFontFamilySetting = this.configurationService.getValue<string>(NotebookSetting.outputFontFamilyDeprecated);
		if (deprecatedOutputFontFamilySetting !== undefined) {
			this._migrateDeprecatedSetting(NotebookSetting.outputFontFamilyDeprecated, NotebookSetting.outputFontFamily);
			outputFontFamily = deprecatedOutputFontFamilySetting;
		} else {
			outputFontFamily = this.configurationService.getValue<string>(NotebookSetting.outputFontFamily);
		}

		let outputScrolling: boolean;
		const deprecatedOutputScrollingSetting = this.configurationService.getValue<boolean>(NotebookSetting.outputScrollingDeprecated);
		if (deprecatedOutputScrollingSetting !== undefined) {
			this._migrateDeprecatedSetting(NotebookSetting.outputScrollingDeprecated, NotebookSetting.outputScrolling);
			outputScrolling = deprecatedOutputScrollingSetting;
		} else {
			outputScrolling = this.configurationService.getValue<boolean>(NotebookSetting.outputScrolling);
		}

		const outputLineHeight = this._computeOutputLineHeight(outputLineHeightSettingValue, outputFontSize);
		const outputWordWrap = this.configurationService.getValue<boolean>(NotebookSetting.outputWordWrap);
		const outputLineLimit = this.configurationService.getValue<number>(NotebookSetting.textOutputLineLimit) ?? 30;
		const linkifyFilePaths = this.configurationService.getValue<boolean>(NotebookSetting.LinkifyOutputFilePaths) ?? true;
		const minimalErrors = this.configurationService.getValue<boolean>(NotebookSetting.minimalErrorRendering);
		const markupFontFamily = this.configurationService.getValue<string>(NotebookSetting.markupFontFamily);

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

	updateOptions(isReadonly: boolean) {
		if (this.isReadonly !== isReadonly) {
			this.isReadonly = isReadonly;

			this._updateConfiguration({
				affectsConfiguration(configuration: string): boolean {
					return configuration === NotebookSetting.insertToolbarLocation;
				},
				source: ConfigurationTarget.DEFAULT,
				affectedKeys: new Set([NotebookSetting.insertToolbarLocation]),
				change: { keys: [NotebookSetting.insertToolbarLocation], overrides: [] },
			});
		}
	}

	private _computeEditorTopPadding(): number {
		let decorationTriggeredAdjustment = false;

		const updateEditorTopPadding = (top: number) => {
			this._editorTopPadding = top;
			const configuration = Object.assign({}, this._layoutConfiguration);
			configuration.editorTopPadding = this._editorTopPadding;
			this._layoutConfiguration = configuration;
			this._onDidChangeOptions.fire({ editorTopPadding: true });
		};

		const decorationCheckSet = new Set<string>();
		const onDidAddDecorationType = (e: string) => {
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
							if (
								((cssRules[i] as CSSStyleRule).selectorText.endsWith('::after') || (cssRules[i] as CSSStyleRule).selectorText.endsWith('::after'))
								&& (cssRules[i] as CSSStyleRule).cssText.indexOf('top:') > -1
							) {
								// there is a `::before` or `::after` text decoration whose position is above or below current line
								// we at least make sure that the editor top padding is at least one line
								const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
								updateEditorTopPadding(BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value).lineHeight + 2);
								decorationTriggeredAdjustment = true;
								break;
							}
						}
					}
				}

				decorationCheckSet.add(e);
			} catch (_ex) {
				// do not throw and break notebook
			}

		};
		this._register(this.codeEditorService.onDecorationTypeRegistered(onDidAddDecorationType));
		this.codeEditorService.listDecorationTypes().forEach(onDidAddDecorationType);

		return this._editorTopPadding;
	}

	private _migrateDeprecatedSetting(deprecatedKey: string, key: string): void {
		const deprecatedSetting = this.configurationService.inspect(deprecatedKey);

		if (deprecatedSetting.application !== undefined) {
			this.configurationService.updateValue(deprecatedKey, undefined, ConfigurationTarget.APPLICATION);
			this.configurationService.updateValue(key, deprecatedSetting.application.value, ConfigurationTarget.APPLICATION);
		}

		if (deprecatedSetting.user !== undefined) {
			this.configurationService.updateValue(deprecatedKey, undefined, ConfigurationTarget.USER);
			this.configurationService.updateValue(key, deprecatedSetting.user.value, ConfigurationTarget.USER);
		}

		if (deprecatedSetting.userLocal !== undefined) {
			this.configurationService.updateValue(deprecatedKey, undefined, ConfigurationTarget.USER_LOCAL);
			this.configurationService.updateValue(key, deprecatedSetting.userLocal.value, ConfigurationTarget.USER_LOCAL);
		}

		if (deprecatedSetting.userRemote !== undefined) {
			this.configurationService.updateValue(deprecatedKey, undefined, ConfigurationTarget.USER_REMOTE);
			this.configurationService.updateValue(key, deprecatedSetting.userRemote.value, ConfigurationTarget.USER_REMOTE);
		}

		if (deprecatedSetting.workspace !== undefined) {
			this.configurationService.updateValue(deprecatedKey, undefined, ConfigurationTarget.WORKSPACE);
			this.configurationService.updateValue(key, deprecatedSetting.workspace.value, ConfigurationTarget.WORKSPACE);
		}

		if (deprecatedSetting.workspaceFolder !== undefined) {
			this.configurationService.updateValue(deprecatedKey, undefined, ConfigurationTarget.WORKSPACE_FOLDER);
			this.configurationService.updateValue(key, deprecatedSetting.workspaceFolder.value, ConfigurationTarget.WORKSPACE_FOLDER);
		}
	}

	private _computeOutputLineHeight(lineHeight: number, outputFontSize: number): number {
		const minimumLineHeight = 9;

		if (lineHeight === 0) {
			// use editor line height
			const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
			const fontInfo = FontMeasurements.readFontInfo(this.targetWindow, BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value));
			lineHeight = fontInfo.lineHeight;
		} else if (lineHeight < minimumLineHeight) {
			// Values too small to be line heights in pixels are in ems.
			let fontSize = outputFontSize;
			if (fontSize === 0) {
				fontSize = this.configurationService.getValue<number>('editor.fontSize');
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

	private _updateConfiguration(e: IConfigurationChangeEvent) {
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

		if (
			!cellStatusBarVisibility
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
			configuration.showCellStatusBar = this.configurationService.getValue<ShowCellStatusBarType>(NotebookSetting.showCellStatusBar);
		}

		if (cellToolbarLocation) {
			configuration.cellToolbarLocation = this.configurationService.getValue<string | { [key: string]: string }>(NotebookSetting.cellToolbarLocation) ?? { 'default': 'right' };
		}

		if (cellToolbarInteraction && !this.overrides?.cellToolbarInteraction) {
			configuration.cellToolbarInteraction = this.configurationService.getValue<string>(NotebookSetting.cellToolbarVisibility);
		}

		if (focusIndicator) {
			configuration.focusIndicator = this._computeFocusIndicatorOption();
		}

		if (compactView) {
			const compactViewValue = this.configurationService.getValue<boolean | undefined>(NotebookSetting.compactView) ?? true;
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
			configuration.globalToolbar = this.configurationService.getValue<boolean>(NotebookSetting.globalToolbar) ?? true;
		}

		if (stickyScrollEnabled && this.overrides?.stickyScrollEnabled === undefined) {
			configuration.stickyScrollEnabled = this.configurationService.getValue<boolean>(NotebookSetting.stickyScrollEnabled) ?? false;
		}

		if (stickyScrollMode) {
			configuration.stickyScrollMode = this.configurationService.getValue<'flat' | 'indented'>(NotebookSetting.stickyScrollMode) ?? 'flat';
		}

		if (consolidatedOutputButton) {
			configuration.consolidatedOutputButton = this.configurationService.getValue<boolean>(NotebookSetting.consolidatedOutputButton) ?? true;
		}

		if (consolidatedRunButton) {
			configuration.consolidatedRunButton = this.configurationService.getValue<boolean>(NotebookSetting.consolidatedRunButton) ?? true;
		}

		if (showFoldingControls) {
			configuration.showFoldingControls = this._computeShowFoldingControlsOption();
		}

		if (dragAndDropEnabled) {
			configuration.dragAndDropEnabled = this.configurationService.getValue<boolean>(NotebookSetting.dragAndDropEnabled) ?? true;
		}

		if (fontSize) {
			configuration.fontSize = this.configurationService.getValue<number>('editor.fontSize');
		}

		if (outputFontSize || fontSize) {
			configuration.outputFontSize = this.configurationService.getValue<number>(NotebookSetting.outputFontSize) || configuration.fontSize;
		}

		if (markupFontSize) {
			configuration.markupFontSize = this.configurationService.getValue<number>(NotebookSetting.markupFontSize);
		}

		if (markdownLineHeight) {
			configuration.markdownLineHeight = this.configurationService.getValue<number>(NotebookSetting.markdownLineHeight);
		}

		if (outputFontFamily) {
			configuration.outputFontFamily = this.configurationService.getValue<string>(NotebookSetting.outputFontFamily);
		}

		if (editorOptionsCustomizations) {
			configuration.editorOptionsCustomizations = this.configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations);
		}

		if (interactiveWindowCollapseCodeCells) {
			configuration.interactiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);
		}

		if (outputLineHeight || fontSize || outputFontSize) {
			const lineHeight = this.configurationService.getValue<number>(NotebookSetting.outputLineHeight);
			configuration.outputLineHeight = this._computeOutputLineHeight(lineHeight, configuration.outputFontSize);
		}

		if (outputWordWrap) {
			configuration.outputWordWrap = this.configurationService.getValue<boolean>(NotebookSetting.outputWordWrap);
		}

		if (outputScrolling) {
			configuration.outputScrolling = this.configurationService.getValue<boolean>(NotebookSetting.outputScrolling);
		}

		if (outputLinkifyFilePaths) {
			configuration.outputLinkifyFilePaths = this.configurationService.getValue<boolean>(NotebookSetting.LinkifyOutputFilePaths);
		}

		if (minimalError) {
			configuration.outputMinimalError = this.configurationService.getValue<boolean>(NotebookSetting.minimalErrorRendering);
		}

		if (markupFontFamily) {
			configuration.markupFontFamily = this.configurationService.getValue<string>(NotebookSetting.markupFontFamily);
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

	private _computeInsertToolbarPositionOption(isReadOnly: boolean) {
		return isReadOnly ? 'hidden' : this.configurationService.getValue<'betweenCells' | 'notebookToolbar' | 'both' | 'hidden'>(NotebookSetting.insertToolbarLocation) ?? 'both';
	}

	private _computeInsertToolbarAlignmentOption() {
		return this.configurationService.getValue<'left' | 'center'>(NotebookSetting.experimentalInsertToolbarAlignment) ?? 'center';
	}

	private _computeShowFoldingControlsOption() {
		return this.configurationService.getValue<'always' | 'never' | 'mouseover'>(NotebookSetting.showFoldingControls) ?? 'mouseover';
	}

	private _computeFocusIndicatorOption() {
		return this.configurationService.getValue<'border' | 'gutter'>(NotebookSetting.focusIndicator) ?? 'gutter';
	}

	private _computeStickyScrollModeOption() {
		return this.configurationService.getValue<'flat' | 'indented'>(NotebookSetting.stickyScrollMode) ?? 'flat';
	}

	getCellCollapseDefault(): NotebookCellDefaultCollapseConfig {
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

	getLayoutConfiguration(): NotebookLayoutConfiguration & NotebookDisplayOptions {
		return this._layoutConfiguration;
	}

	getDisplayOptions(): NotebookDisplayOptions {
		return this._layoutConfiguration;
	}

	getCellEditorContainerLeftMargin() {
		const {
			codeCellLeftMargin,
			cellRunGutter
		} = this._layoutConfiguration;
		return codeCellLeftMargin + cellRunGutter;
	}

	computeCollapsedMarkdownCellHeight(viewType: string): number {
		const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
		return this._layoutConfiguration.markdownCellTopMargin
			+ this._layoutConfiguration.collapsedIndicatorHeight
			+ bottomToolbarGap
			+ this._layoutConfiguration.markdownCellBottomMargin;
	}

	computeBottomToolbarOffset(totalHeight: number, viewType: string) {
		const { bottomToolbarGap, bottomToolbarHeight } = this.computeBottomToolbarDimensions(viewType);

		return totalHeight
			- bottomToolbarGap
			- bottomToolbarHeight / 2;
	}

	computeCodeCellEditorWidth(outerWidth: number): number {
		return outerWidth - (
			this._layoutConfiguration.codeCellLeftMargin
			+ this._layoutConfiguration.cellRunGutter
			+ this._layoutConfiguration.cellRightMargin
		);
	}

	computeMarkdownCellEditorWidth(outerWidth: number): number {
		return outerWidth
			- this._layoutConfiguration.markdownCellGutter
			- this._layoutConfiguration.markdownCellLeftMargin
			- this._layoutConfiguration.cellRightMargin;
	}

	computeStatusBarHeight(): number {
		return this._layoutConfiguration.cellStatusBarHeight;
	}

	private _computeBottomToolbarDimensions(compactView: boolean, insertToolbarPosition: 'betweenCells' | 'notebookToolbar' | 'both' | 'hidden', insertToolbarAlignment: 'left' | 'center', cellToolbar: 'right' | 'left' | 'hidden'): { bottomToolbarGap: number; bottomToolbarHeight: number } {
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
		} else {
			return {
				bottomToolbarGap: 0,
				bottomToolbarHeight: 0
			};
		}
	}

	computeBottomToolbarDimensions(viewType?: string): { bottomToolbarGap: number; bottomToolbarHeight: number } {
		const configuration = this._layoutConfiguration;
		const cellToolbarPosition = this.computeCellToolbarLocation(viewType);
		const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(configuration.compactView, configuration.insertToolbarPosition, configuration.insertToolbarAlignment, cellToolbarPosition);
		return {
			bottomToolbarGap,
			bottomToolbarHeight
		};
	}

	computeCellToolbarLocation(viewType?: string): 'right' | 'left' | 'hidden' {
		const cellToolbarLocation = this._layoutConfiguration.cellToolbarLocation;

		if (typeof cellToolbarLocation === 'string') {
			if (cellToolbarLocation === 'left' || cellToolbarLocation === 'right' || cellToolbarLocation === 'hidden') {
				return cellToolbarLocation;
			}
		} else {
			if (viewType) {
				const notebookSpecificSetting = cellToolbarLocation[viewType] ?? cellToolbarLocation['default'];
				let cellToolbarLocationForCurrentView: 'right' | 'left' | 'hidden' = 'right';

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

	computeTopInsertToolbarHeight(viewType?: string): number {
		if (this._layoutConfiguration.insertToolbarPosition === 'betweenCells' || this._layoutConfiguration.insertToolbarPosition === 'both') {
			return SCROLLABLE_ELEMENT_PADDING_TOP;
		}

		const cellToolbarLocation = this.computeCellToolbarLocation(viewType);

		if (cellToolbarLocation === 'left' || cellToolbarLocation === 'right') {
			return SCROLLABLE_ELEMENT_PADDING_TOP;
		}

		return 0;
	}

	computeEditorPadding(internalMetadata: NotebookCellInternalMetadata, cellUri: URI) {
		return {
			top: this._editorTopPadding,
			bottom: this.statusBarIsVisible(internalMetadata, cellUri)
				? this._layoutConfiguration.editorBottomPadding
				: this._layoutConfiguration.editorBottomPaddingWithoutStatusBar
		};
	}


	computeEditorStatusbarHeight(internalMetadata: NotebookCellInternalMetadata, cellUri: URI) {
		return this.statusBarIsVisible(internalMetadata, cellUri) ? this.computeStatusBarHeight() : 0;
	}

	private statusBarIsVisible(internalMetadata: NotebookCellInternalMetadata, cellUri: URI): boolean {
		const exe = this.notebookExecutionStateService.getCellExecution(cellUri);
		if (this._layoutConfiguration.showCellStatusBar === 'visible') {
			return true;
		} else if (this._layoutConfiguration.showCellStatusBar === 'visibleAfterExecute') {
			return typeof internalMetadata.lastRunSuccess === 'boolean' || exe !== undefined;
		} else {
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

	computeIndicatorPosition(totalHeight: number, foldHintHeight: number, viewType?: string) {
		const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);

		return {
			bottomIndicatorTop: totalHeight - bottomToolbarGap - this._layoutConfiguration.cellBottomMargin - foldHintHeight,
			verticalIndicatorHeight: totalHeight - bottomToolbarGap - foldHintHeight
		};
	}
}
