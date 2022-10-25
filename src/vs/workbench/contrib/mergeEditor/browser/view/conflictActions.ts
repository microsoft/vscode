/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, createStyleSheet, h, isInShadowDOM, reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { hash } from 'vs/base/common/hash';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, IObservable, transaction } from 'vs/base/common/observable';
import { ICodeEditor, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { EditorOption, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { localize } from 'vs/nls';
import { ModifiedBaseRange, ModifiedBaseRangeState, ModifiedBaseRangeStateKind } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { FixedZoneWidget } from 'vs/workbench/contrib/mergeEditor/browser/view/fixedZoneWidget';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';

export class ConflictActionsFactory extends Disposable {
	private readonly _styleClassName: string;
	private readonly _styleElement: HTMLStyleElement;

	constructor(private readonly _editor: ICodeEditor) {
		super();

		this._register(this._editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.codeLensFontSize) || e.hasChanged(EditorOption.codeLensFontFamily)) {
				this._updateLensStyle();
			}
		}));

		this._styleClassName = '_conflictActionsFactory_' + hash(this._editor.getId()).toString(16);
		this._styleElement = createStyleSheet(
			isInShadowDOM(this._editor.getContainerDomNode())
				? this._editor.getContainerDomNode()
				: undefined
		);

		this._register(toDisposable(() => {
			this._styleElement.remove();
		}));

		this._updateLensStyle();
	}

	private _updateLensStyle(): void {
		const { codeLensHeight, fontSize } = this._getLayoutInfo();
		const fontFamily = this._editor.getOption(EditorOption.codeLensFontFamily);
		const editorFontInfo = this._editor.getOption(EditorOption.fontInfo);

		const fontFamilyVar = `--codelens-font-family${this._styleClassName}`;
		const fontFeaturesVar = `--codelens-font-features${this._styleClassName}`;

		let newStyle = `
		.${this._styleClassName} { line-height: ${codeLensHeight}px; font-size: ${fontSize}px; padding-right: ${Math.round(fontSize * 0.5)}px; font-feature-settings: var(${fontFeaturesVar}) }
		.monaco-workbench .${this._styleClassName} span.codicon { line-height: ${codeLensHeight}px; font-size: ${fontSize}px; }
		`;
		if (fontFamily) {
			newStyle += `${this._styleClassName} { font-family: var(${fontFamilyVar}), ${EDITOR_FONT_DEFAULTS.fontFamily}}`;
		}
		this._styleElement.textContent = newStyle;
		this._editor.getContainerDomNode().style.setProperty(fontFamilyVar, fontFamily ?? 'inherit');
		this._editor.getContainerDomNode().style.setProperty(fontFeaturesVar, editorFontInfo.fontFeatureSettings);
	}

	private _getLayoutInfo() {
		const lineHeightFactor = Math.max(1.3, this._editor.getOption(EditorOption.lineHeight) / this._editor.getOption(EditorOption.fontSize));
		let fontSize = this._editor.getOption(EditorOption.codeLensFontSize);
		if (!fontSize || fontSize < 5) {
			fontSize = (this._editor.getOption(EditorOption.fontSize) * .9) | 0;
		}
		return {
			fontSize,
			codeLensHeight: (fontSize * lineHeightFactor) | 0,
		};
	}

	public createWidget(viewZoneChangeAccessor: IViewZoneChangeAccessor, lineNumber: number, items: IObservable<IContentWidgetAction[]>, viewZoneIdsToCleanUp: string[]): IDisposable {
		const layoutInfo = this._getLayoutInfo();
		return new ActionsContentWidget(
			this._editor,
			viewZoneChangeAccessor,
			lineNumber,
			layoutInfo.codeLensHeight + 2,
			this._styleClassName,
			items,
			viewZoneIdsToCleanUp,
		);
	}
}

export class ActionsSource {
	constructor(
		private readonly viewModel: MergeEditorViewModel,
		private readonly modifiedBaseRange: ModifiedBaseRange,
	) {
	}

	private getItemsInput(inputNumber: 1 | 2): IObservable<IContentWidgetAction[]> {
		return derived('items', reader => {
			const viewModel = this.viewModel;
			const modifiedBaseRange = this.modifiedBaseRange;

			if (!viewModel.model.hasBaseRange(modifiedBaseRange)) {
				return [];
			}

			const state = viewModel.model.getState(modifiedBaseRange).read(reader);
			const handled = viewModel.model.isHandled(modifiedBaseRange).read(reader);
			const model = viewModel.model;

			const result: IContentWidgetAction[] = [];

			const inputData = inputNumber === 1 ? viewModel.model.input1 : viewModel.model.input2;
			const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);

			if (!modifiedBaseRange.isConflicting && handled && !showNonConflictingChanges) {
				return [];
			}

			const otherInputNumber = inputNumber === 1 ? 2 : 1;

			if (state.kind !== ModifiedBaseRangeStateKind.unrecognized && !state.isInputIncluded(inputNumber)) {
				if (!state.isInputIncluded(otherInputNumber) || !this.viewModel.shouldUseAppendInsteadOfAccept.read(reader)) {
					result.push(
						command(localize('accept', "Accept {0}", inputData.title), async () => {
							transaction((tx) => {
								model.setState(
									modifiedBaseRange,
									state.withInputValue(inputNumber, true, false),
									true,
									tx
								);
								model.telemetry.reportAcceptInvoked(inputNumber, state.includesInput(otherInputNumber));
							});
						}, localize('acceptTooltip', "Accept {0} in the result document.", inputData.title))
					);

					if (modifiedBaseRange.canBeCombined) {
						result.push(
							command(localize('acceptBoth', "Accept Combination"), async () => {
								transaction((tx) => {
									model.setState(
										modifiedBaseRange,
										ModifiedBaseRangeState.base
											.withInputValue(inputNumber, true)
											.withInputValue(otherInputNumber, true, true),
										true,
										tx
									);
									model.telemetry.reportSmartCombinationInvoked(state.includesInput(otherInputNumber));
								});
							}, localize('acceptBothTooltip', "Accept an automatic combination of both sides in the result document.")),
						);
					}
				} else {
					result.push(
						command(localize('append', "Append {0}", inputData.title), async () => {
							transaction((tx) => {
								model.setState(
									modifiedBaseRange,
									state.withInputValue(inputNumber, true, false),
									true,
									tx
								);
								model.telemetry.reportAcceptInvoked(inputNumber, state.includesInput(otherInputNumber));
							});
						}, localize('appendTooltip', "Append {0} to the result document.", inputData.title))
					);

					if (modifiedBaseRange.canBeCombined) {
						result.push(
							command(localize('combine', "Accept Combination", inputData.title), async () => {
								transaction((tx) => {
									model.setState(
										modifiedBaseRange,
										state.withInputValue(inputNumber, true, true),
										true,
										tx
									);
									model.telemetry.reportSmartCombinationInvoked(state.includesInput(otherInputNumber));
								});
							}, localize('acceptBothTooltip', "Accept an automatic combination of both sides in the result document.")),
						);
					}
				}


			}
			return result;
		});
	}

	public readonly itemsInput1 = this.getItemsInput(1);
	public readonly itemsInput2 = this.getItemsInput(2);

	public readonly resultItems = derived('items', reader => {
		const viewModel = this.viewModel;
		const modifiedBaseRange = this.modifiedBaseRange;

		const state = viewModel.model.getState(modifiedBaseRange).read(reader);
		const model = viewModel.model;

		const result: IContentWidgetAction[] = [];

		if (state.kind === ModifiedBaseRangeStateKind.unrecognized) {
			result.push({
				text: localize('manualResolution', "Manual Resolution"),
				tooltip: localize('manualResolutionTooltip', "This conflict has been resolved manually."),
			});
		} else if (state.kind === ModifiedBaseRangeStateKind.base) {
			result.push({
				text: localize('noChangesAccepted', 'No Changes Accepted'),
				tooltip: localize(
					'noChangesAcceptedTooltip',
					'The current resolution of this conflict equals the common ancestor of both the right and left changes.'
				),
			});

		} else {
			const labels = [];
			if (state.includesInput1) {
				labels.push(model.input1.title);
			}
			if (state.includesInput2) {
				labels.push(model.input2.title);
			}
			if (state.kind === ModifiedBaseRangeStateKind.both && state.firstInput === 2) {
				labels.reverse();
			}
			result.push({
				text: `${labels.join(' + ')}`
			});
		}

		const stateToggles: IContentWidgetAction[] = [];
		if (state.includesInput1) {
			stateToggles.push(
				command(
					localize('remove', 'Remove {0}', model.input1.title),
					async () => {
						transaction((tx) => {
							model.setState(
								modifiedBaseRange,
								state.withInputValue(1, false),
								true,
								tx
							);
							model.telemetry.reportRemoveInvoked(1, state.includesInput(2));
						});
					},
					localize('removeTooltip', 'Remove {0} from the result document.', model.input1.title)
				)
			);
		}
		if (state.includesInput2) {
			stateToggles.push(
				command(
					localize('remove', 'Remove {0}', model.input2.title),
					async () => {
						transaction((tx) => {
							model.setState(
								modifiedBaseRange,
								state.withInputValue(2, false),
								true,
								tx
							);
							model.telemetry.reportRemoveInvoked(2, state.includesInput(1));
						});
					},
					localize('removeTooltip', 'Remove {0} from the result document.', model.input2.title)
				)
			);
		}
		if (
			state.kind === ModifiedBaseRangeStateKind.both &&
			state.firstInput === 2
		) {
			stateToggles.reverse();
		}
		result.push(...stateToggles);

		if (state.kind === ModifiedBaseRangeStateKind.unrecognized) {
			result.push(
				command(
					localize('resetToBase', 'Reset to base'),
					async () => {
						transaction((tx) => {
							model.setState(
								modifiedBaseRange,
								ModifiedBaseRangeState.base,
								true,
								tx
							);
							model.telemetry.reportResetToBaseInvoked();
						});
					},
					localize('resetToBaseTooltip', 'Reset this conflict to the common ancestor of both the right and left changes.')
				)
			);
		}

		if (state.kind === ModifiedBaseRangeStateKind.base && !model.isHandled(modifiedBaseRange).read(reader)) {
			result.push(
				command(
					localize('markAsHandled', 'Mark As Handled'),
					async () => {
						transaction((tx) => {
							model.setHandled(modifiedBaseRange, true, tx);
						});
					},
					localize('markAsHandledTooltip', 'Marks this conflict as handled.')
				)
			);
		}

		return result;
	});

	public readonly isEmpty = derived('isEmpty', reader => {
		return this.itemsInput1.read(reader).length + this.itemsInput2.read(reader).length + this.resultItems.read(reader).length === 0;
	});

	public readonly inputIsEmpty = derived('inputIsEmpty', reader => {
		return this.itemsInput1.read(reader).length + this.itemsInput2.read(reader).length === 0;
	});
}

function command(title: string, action: () => Promise<void>, tooltip?: string): IContentWidgetAction {
	return {
		text: title,
		action,
		tooltip,
	};
}

export interface IContentWidgetAction {
	text: string;
	tooltip?: string;
	action?: () => Promise<void>;
}

class ActionsContentWidget extends FixedZoneWidget {
	private readonly _domNode = h('div.merge-editor-conflict-actions').root;

	constructor(
		editor: ICodeEditor,
		viewZoneAccessor: IViewZoneChangeAccessor,
		afterLineNumber: number,
		height: number,

		className: string,
		items: IObservable<IContentWidgetAction[]>,
		viewZoneIdsToCleanUp: string[],
	) {
		super(editor, viewZoneAccessor, afterLineNumber, height, viewZoneIdsToCleanUp);

		this.widgetDomNode.appendChild(this._domNode);

		this._domNode.classList.add(className);

		this._register(autorun('update commands', (reader) => {
			const i = items.read(reader);
			this.setState(i);
		}));
	}

	private setState(items: IContentWidgetAction[]) {
		const children: HTMLElement[] = [];
		let isFirst = true;
		for (const item of items) {
			if (isFirst) {
				isFirst = false;
			} else {
				children.push($('span', undefined, '\u00a0|\u00a0'));
			}
			const title = renderLabelWithIcons(item.text);

			if (item.action) {
				children.push($('a', { title: item.tooltip, role: 'button', onclick: () => item.action!() }, ...title));
			} else {
				children.push($('span', { title: item.tooltip }, ...title));
			}
		}

		reset(this._domNode, ...children);
	}
}
