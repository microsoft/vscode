/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { CompareResult } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, autorunWithStore, derived, IObservable, transaction } from 'vs/base/common/observable';
import { URI } from 'vs/base/common/uri';
import { CodeLens, CodeLensProvider, Command } from 'vs/editor/common/languages';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { MergeMarkersController } from 'vs/workbench/contrib/mergeEditor/browser/mergeMarkers/mergeMarkersController';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { applyObservableDecorations, join } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { EditorGutter } from 'vs/workbench/contrib/mergeEditor/browser/view/editorGutter';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { ctxIsMergeResultEditor } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from './codeEditorView';

export class ResultCodeEditorView extends CodeEditorView {
	constructor(
		viewModel: IObservable<MergeEditorViewModel | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(instantiationService, viewModel, configurationService);

		this.editor.invokeWithinContext(accessor => {
			const contextKeyService = accessor.get(IContextKeyService);
			const isMergeResultEditor = ctxIsMergeResultEditor.bindTo(contextKeyService);
			isMergeResultEditor.set(true);
			this._register(toDisposable(() => isMergeResultEditor.reset()));
		});

		this._register(new MergeMarkersController(this.editor, this.viewModel));

		this._register(
			autorunWithStore((reader, store) => {
				if (this.codeLensesVisible.read(reader)) {
					store.add(instantiationService.createInstance(CodeLensPart, this));
				}
			}, 'update code lens part')
		);

		this.htmlElements.gutterDiv.style.width = '5px';

		this._register(
			autorunWithStore((reader, store) => {
				if (this.checkboxesVisible.read(reader)) {
					store.add(new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
						getIntersectingGutterItems: (range, reader) => [],
						createView: (item, target) => { throw new BugIndicatingError(); },
					}));
				}
			}, 'update checkboxes')
		);

		this._register(autorun('update labels & text model', reader => {
			const vm = this.viewModel.read(reader);
			if (!vm) {
				return;
			}
			this.editor.setModel(vm.model.resultTextModel);
			reset(this.htmlElements.title, ...renderLabelWithIcons(localize('result', 'Result')));
			reset(this.htmlElements.description, ...renderLabelWithIcons(this._labelService.getUriLabel(vm.model.resultTextModel.uri, { relative: true })));
		}));


		this._register(autorun('update remainingConflicts label', reader => {
			// this is a bit of a hack, but it's the easiest way to get the label to update
			// when the view model updates, as the the base class resets the label in the setModel call.
			this.viewModel.read(reader);

			const model = this.model.read(reader);
			if (!model) {
				return;
			}
			const count = model.unhandledConflictsCount.read(reader);

			this.htmlElements.detail.innerText = count === 1
				? localize(
					'mergeEditor.remainingConflicts',
					'{0} Conflict Remaining',
					count
				)
				: localize(
					'mergeEditor.remainingConflict',
					'{0} Conflicts Remaining ',
					count
				);

		}));


		this._register(applyObservableDecorations(this.editor, this.decorations));

		this._register(
			createSelectionsAutorun(this, (baseRange, viewModel) =>
				viewModel.model.translateBaseRangeToResult(baseRange)
			)
		);

		this._register(
			instantiationService.createInstance(
				TitleMenu,
				MenuId.MergeInputResultToolbar,
				this.htmlElements.toolbar
			)
		);
	}

	private readonly decorations = derived('result.decorations', reader => {
		const viewModel = this.viewModel.read(reader);
		if (!viewModel) {
			return [];
		}
		const model = viewModel.model;
		const result = new Array<IModelDeltaDecoration>();

		const baseRangeWithStoreAndTouchingDiffs = join(
			model.modifiedBaseRanges.read(reader),
			model.baseResultDiffs.read(reader),
			(baseRange, diff) => baseRange.baseRange.touches(diff.inputRange)
				? CompareResult.neitherLessOrGreaterThan
				: LineRange.compareByStart(
					baseRange.baseRange,
					diff.inputRange
				)
		);

		const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);

		const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);

		for (const m of baseRangeWithStoreAndTouchingDiffs) {
			const modifiedBaseRange = m.left;

			if (modifiedBaseRange) {
				const blockClassNames = ['merge-editor-block'];
				const isHandled = model.isHandled(modifiedBaseRange).read(reader);
				if (isHandled) {
					blockClassNames.push('handled');
				}
				if (modifiedBaseRange === activeModifiedBaseRange) {
					blockClassNames.push('focused');
				}
				if (modifiedBaseRange.isConflicting) {
					blockClassNames.push('conflicting');
				}
				blockClassNames.push('result');

				if (!modifiedBaseRange.isConflicting && !showNonConflictingChanges && isHandled) {
					continue;
				}

				result.push({
					range: model.getLineRangeInResult(modifiedBaseRange.baseRange, reader).toInclusiveRangeOrEmpty(),
					options: {
						showIfCollapsed: true,
						blockClassName: blockClassNames.join(' '),
						description: 'Result Diff',
						minimap: {
							position: MinimapPosition.Gutter,
							color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
						},
						overviewRuler: modifiedBaseRange.isConflicting ? {
							position: OverviewRulerLane.Center,
							color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
						} : undefined
					}
				});

			}


			if (!modifiedBaseRange || modifiedBaseRange.isConflicting) {
				for (const diff of m.rights) {
					const range = diff.outputRange.toInclusiveRange();
					if (range) {
						result.push({
							range,
							options: {
								className: `merge-editor-diff result`,
								description: 'Merge Editor',
								isWholeLine: true,
							}
						});
					}

					if (diff.rangeMappings) {
						for (const d of diff.rangeMappings) {
							result.push({
								range: d.outputRange,
								options: {
									className: `merge-editor-diff-word result`,
									description: 'Merge Editor'
								}
							});
						}
					}
				}
			}
		}
		return result;
	});
}

class CodeLensPart extends Disposable {
	public static commandCounter = 0;

	constructor(
		resultCodeEditorView: ResultCodeEditorView,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		const codeLensCommandId = `mergeEditor.codeLensCommandResult${CodeLensPart.commandCounter++}`;
		this._register(CommandsRegistry.registerCommand(codeLensCommandId, (accessor, arg) => {
			arg();
		}));

		function command(title: string, callback: () => Promise<void>): Command {
			return {
				title,
				id: codeLensCommandId,
				arguments: [callback],
			};
		}

		const codeLenses = derived<{ codeLenses: CodeLens[]; uri: URI } | undefined>('codeLenses', reader => {
			const viewModel = resultCodeEditorView.viewModel.read(reader);
			if (!viewModel) {
				return undefined;
			}
			const model = viewModel.model;
			const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);

			return {
				codeLenses: viewModel.model.modifiedBaseRanges.read(reader).flatMap<CodeLens>(r => {
					const range = model.getLineRangeInResult(r.baseRange, reader).toRange();

					const handled = model.isHandled(r).read(reader);
					const state = model.getState(r).read(reader);
					const result: CodeLens[] = [];

					if (!r.isConflicting && handled && !showNonConflictingChanges) {
						return [];
					}

					const stateLabel = ((state: ModifiedBaseRangeState): string => {
						if (state.conflicting) {
							return '= Manual Resolution';
						} else if (state.isEmpty) {
							return '= Base';
						} else {
							const labels = [];
							if (state.input1) {
								labels.push(model.input1.title);
							}
							if (state.input2) {
								labels.push(model.input2.title);
							}
							return `= ${labels.join(' + ')}`;
						}
					})(state);

					result.push({
						range,
						command: {
							title: stateLabel,
							id: 'notSupported',
						}
					});


					const stateToggles: CodeLens[] = [];
					if (state.input1) {
						result.push({
							range,
							command: command(`$(error) Remove ${model.input1.title}`, async () => {
								transaction((tx) => {
									model.setState(
										r,
										state.withInputValue(1, false),
										true,
										tx
									);
								});
							}),
						});
					}
					if (state.input2) {
						result.push({
							range,
							command: command(`$(error) Remove ${model.input2.title}`, async () => {
								transaction((tx) => {
									model.setState(
										r,
										state.withInputValue(2, false),
										true,
										tx
									);
								});
							}),
						});
					}
					if (state.input2First) {
						stateToggles.reverse();
					}
					result.push(...stateToggles);



					if (state.conflicting) {
						result.push(
							{
								range,
								command: command(`$(error) Reset to base`, async () => {
									transaction((tx) => {
										model.setState(
											r,
											ModifiedBaseRangeState.default,
											true,
											tx
										);
									});
								})
							}
						);
					}
					return result;
				}),
				uri: model.resultTextModel.uri,
			};
		});

		const codeLensProvider: CodeLensProvider = {
			onDidChange: Event.map(Event.fromObservable(codeLenses), () => codeLensProvider),
			async provideCodeLenses(model, token) {
				const result = codeLenses.get();
				if (!result || result.uri.toString() !== model.uri.toString()) {
					return { lenses: [], dispose: () => { } };
				}
				return { lenses: result.codeLenses, dispose: () => { } };
			}
		};

		this._register(languageFeaturesService.codeLensProvider.register({ pattern: '**/*' }, codeLensProvider));
	}
}
