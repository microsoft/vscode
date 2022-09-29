/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h, $, reset, createStyleSheet, isInShadowDOM } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { hash } from 'vs/base/common/hash';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, IObservable, transaction } from 'vs/base/common/observable';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { localize } from 'vs/nls';
import { ModifiedBaseRange, ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';

export class ConflictActionsFactory extends Disposable {
	private id = 0;
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

	createContentWidget(lineNumber: number, viewModel: MergeEditorViewModel, modifiedBaseRange: ModifiedBaseRange, inputNumber: 1 | 2): IContentWidget {

		function command(title: string, action: () => Promise<void>, tooltip?: string): IContentWidgetAction {
			return {
				text: title,
				action,
				tooltip,
			};
		}

		const items = derived('items', reader => {
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

			if (!state.conflicting && !state.isInputIncluded(inputNumber)) {
				result.push(
					!state.isInputIncluded(inputNumber)
						? command(localize('accept', "$(pass) Accept {0}", inputData.title), async () => {
							transaction((tx) => {
								model.setState(
									modifiedBaseRange,
									state.withInputValue(inputNumber, true),
									true,
									tx
								);
							});
						})
						: command(localize('remove', "$(error) Remove {0}", inputData.title), async () => {
							transaction((tx) => {
								model.setState(
									modifiedBaseRange,
									state.withInputValue(inputNumber, false),
									true,
									tx
								);
							});
						}),
				);

				if (modifiedBaseRange.canBeCombined && state.isEmpty) {
					result.push(
						state.input1 && state.input2
							? command(localize('removeBoth', "$(error) Remove Both"), async () => {
								transaction((tx) => {
									model.setState(
										modifiedBaseRange,
										ModifiedBaseRangeState.default,
										true,
										tx
									);
								});
							})
							: command(localize('acceptBoth', "$(pass) Accept Both"), async () => {
								transaction((tx) => {
									model.setState(
										modifiedBaseRange,
										state
											.withInputValue(inputNumber, true)
											.withInputValue(otherInputNumber, true),
										true,
										tx
									);
								});
							}, localize('acceptBothTooltip', "Both changes can be combined automatically")),
					);
				}
			}
			return result;
		});
		return new ActionsContentWidget((this.id++).toString(), this._styleClassName, lineNumber, items);
	}

	createResultWidget(lineNumber: number, viewModel: MergeEditorViewModel, modifiedBaseRange: ModifiedBaseRange): IContentWidget {

		function command(title: string, action: () => Promise<void>): IContentWidgetAction {
			return {
				text: title,
				action
			};
		}

		const items = derived('items', reader => {
			const state = viewModel.model.getState(modifiedBaseRange).read(reader);
			const model = viewModel.model;

			const result: IContentWidgetAction[] = [];


			if (state.conflicting) {
				result.push({
					text: localize('manualResolution', "Manual Resolution"),
					tooltip: localize('manualResolutionTooltip', "This conflict has been resolved manually"),
				});
			} else if (state.isEmpty) {
				result.push({
					text: localize('noChangesAccepted', 'No Changes Accepted'),
					tooltip: localize('noChangesAcceptedTooltip', "The current resolution of this conflict equals the common ancestor of both the right and left changes."),
				});

			} else {
				const labels = [];
				if (state.input1) {
					labels.push(model.input1.title);
				}
				if (state.input2) {
					labels.push(model.input2.title);
				}
				if (state.input2First) {
					labels.reverse();
				}
				result.push({
					text: `${labels.join(' + ')}`
				});
			}

			const stateToggles: IContentWidgetAction[] = [];
			if (state.input1) {
				result.push(command(localize('remove', "$(error) Remove {0}", model.input1.title), async () => {
					transaction((tx) => {
						model.setState(
							modifiedBaseRange,
							state.withInputValue(1, false),
							true,
							tx
						);
					});
				}),
				);
			}
			if (state.input2) {
				result.push(command(localize('remove', "$(error) Remove {0}", model.input2.title), async () => {
					transaction((tx) => {
						model.setState(
							modifiedBaseRange,
							state.withInputValue(2, false),
							true,
							tx
						);
					});
				}),
				);
			}
			if (state.input2First) {
				stateToggles.reverse();
			}
			result.push(...stateToggles);



			if (state.conflicting) {
				result.push(
					command(localize('resetToBase', "$(error) Reset to base"), async () => {
						transaction((tx) => {
							model.setState(
								modifiedBaseRange,
								ModifiedBaseRangeState.default,
								true,
								tx
							);
						});
					})
				);
			}
			return result;
		});
		return new ActionsContentWidget((this.id++).toString(), this._styleClassName, lineNumber, items);
	}
}


interface IContentWidgetAction {
	text: string;
	tooltip?: string;
	action?: () => Promise<void>;
}

class ActionsContentWidget extends Disposable implements IContentWidget {
	private readonly _domNode = h('div.merge-editor-conflict-actions').root;

	constructor(
		private readonly id: string,
		className: string,
		private readonly lineNumber: number,
		items: IObservable<IContentWidgetAction[]>,
	) {
		super();

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

	getId(): string {
		return this.id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: { lineNumber: this.lineNumber, column: 1, },
			preference: [ContentWidgetPositionPreference.BELOW],
		};
	}
}
