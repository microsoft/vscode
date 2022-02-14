/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Event } from 'vs/base/common/event';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { autorun, autorunDelta, constObservable, debouncedObservable, fromEvent, fromPromise, IObservable, LazyDerived, wasEventTriggeredRecently } from 'vs/workbench/contrib/audioCues/browser/observable';
import { ITextModel } from 'vs/editor/common/model';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { AudioCue, IAudioCueService } from 'vs/workbench/contrib/audioCues/browser/audioCueService';

export class AudioCueContribution
	extends Disposable
	implements IWorkbenchContribution {
	private readonly store = this._register(new DisposableStore());

	private readonly features: Feature[] = [
		this.instantiationService.createInstance(ErrorFeature),
		this.instantiationService.createInstance(FoldedAreaFeature),
		this.instantiationService.createInstance(BreakpointFeature),
		this.instantiationService.createInstance(InlineCompletionFeature),
	];

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAudioCueService private readonly audioCueService: IAudioCueService
	) {
		super();

		const someAudioCueFeatureIsEnabled = new LazyDerived(
			(reader) =>
				this.features.some((feature) =>
					this.audioCueService.isEnabled(feature.audioCue).read(reader)
				),
			'someAudioCueFeatureIsEnabled'
		);

		const activeEditorObservable = fromEvent(
			this.editorService.onDidActiveEditorChange,
			(_) => {
				const activeTextEditorControl =
					this.editorService.activeTextEditorControl;

				const editor = isDiffEditor(activeTextEditorControl)
					? activeTextEditorControl.getOriginalEditor()
					: isCodeEditor(activeTextEditorControl)
						? activeTextEditorControl
						: undefined;

				return editor && editor.hasModel() ? { editor, model: editor.getModel() } : undefined;
			}
		);

		this._register(
			autorun((reader) => {
				this.store.clear();

				if (!someAudioCueFeatureIsEnabled.read(reader)) {
					return;
				}

				const activeEditor = activeEditorObservable.read(reader);
				if (activeEditor) {
					this.registerAudioCuesForEditor(activeEditor.editor, activeEditor.model, this.store);
				}
			}, 'updateAudioCuesEnabled')
		);
	}

	private registerAudioCuesForEditor(
		editor: ICodeEditor,
		editorModel: ITextModel,
		store: DisposableStore
	): void {
		const observableFeatureStates = this.features.map((feature) =>
			feature.getObservableState(editor, editorModel)
		);

		const curLineNumber = fromEvent(
			editor.onDidChangeCursorPosition,
			() => editor.getPosition()?.lineNumber
		);
		const debouncedLineNumber = debouncedObservable(curLineNumber, 100, store);

		const lineNumberWithObservableFeatures = debouncedLineNumber.map(
			(lineNumber) =>
				lineNumber === undefined
					? undefined
					: {
						lineNumber,
						featureStatesForLine: observableFeatureStates.map(
							(featureResult, idx) =>
								// This caches the feature state for the active line
								new LazyDerived(
									(reader) =>
										this.audioCueService
											.isEnabled(this.features[idx].audioCue)
											.read(reader) &&
										featureResult.read(reader).isActive(lineNumber),
									'isActiveForLine'
								)
						),
					}
		);

		const isTyping = wasEventTriggeredRecently(
			editorModel.onDidChangeContent.bind(editorModel),
			1000,
			store
		);
		const featureStatesBeforeTyping = isTyping.map(
			(isTyping) =>
				(!isTyping
					? undefined
					: lineNumberWithObservableFeatures
						.get()
						?.featureStatesForLine?.map((featureState, idx) =>
							this.features[idx].debounceWhileTyping
								? featureState.get()
								: undefined
						)) ?? []
		);

		const state = new LazyDerived((reader) => {
			const lineInfo = lineNumberWithObservableFeatures.read(reader);
			if (lineInfo === undefined) {
				return undefined;
			}
			return {
				lineNumber: lineInfo.lineNumber,
				featureStates: new Map(
					lineInfo.featureStatesForLine.map((featureState, idx) => [
						this.features[idx],
						featureStatesBeforeTyping.read(reader)[idx] ??
						featureState.read(reader),
					])
				),
			};
		}, 'state');

		store.add(
			autorunDelta(state, ({ lastValue, newValue }) => {
				for (const feature of this.features) {
					if (
						newValue?.featureStates.get(feature) &&
						(!lastValue?.featureStates?.get(feature) ||
							newValue.lineNumber !== lastValue.lineNumber)
					) {
						this.audioCueService.playAudioCue(feature.audioCue);
					}
				}
			})
		);
	}
}

interface Feature {
	audioCue: AudioCue;
	debounceWhileTyping?: boolean;
	getObservableState(
		editor: ICodeEditor,
		model: ITextModel
	): IObservable<FeatureState>;
}

interface FeatureState {
	isActive(lineNumber: number): boolean;
}

class ErrorFeature implements Feature {
	public readonly audioCue = AudioCue.error;
	public readonly debounceWhileTyping = true;

	constructor(@IMarkerService private readonly markerService: IMarkerService) { }

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<FeatureState> {
		return fromEvent(
			Event.filter(this.markerService.onMarkerChanged, (changedUris) =>
				changedUris.some((u) => u.toString() === model.uri.toString())
			),
			() => ({
				isActive: (lineNumber) => {
					const hasMarker = this.markerService
						.read({ resource: model.uri })
						.some(
							(m) =>
								m.severity === MarkerSeverity.Error &&
								m.startLineNumber <= lineNumber &&
								lineNumber <= m.endLineNumber
						);
					return hasMarker;
				},
			})
		);
	}
}

class FoldedAreaFeature implements Feature {
	public readonly audioCue = AudioCue.foldedArea;

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<FeatureState> {
		const foldingController = FoldingController.get(editor);
		if (!foldingController) {
			return constObservable({
				isActive: () => false,
			});
		}

		const foldingModel = fromPromise(
			foldingController.getFoldingModel() ?? Promise.resolve(undefined)
		);
		return foldingModel.map((v) => ({
			isActive: (lineNumber) => {
				const regionAtLine = v.value?.getRegionAtLine(lineNumber);
				const hasFolding = !regionAtLine
					? false
					: regionAtLine.isCollapsed &&
					regionAtLine.startLineNumber === lineNumber;
				return hasFolding;
			},
		}));
	}
}

class BreakpointFeature implements Feature {
	public readonly audioCue = AudioCue.break;

	constructor(@IDebugService private readonly debugService: IDebugService) { }

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<FeatureState> {
		return fromEvent(
			this.debugService.getModel().onDidChangeBreakpoints,
			() => ({
				isActive: (lineNumber) => {
					const breakpoints = this.debugService
						.getModel()
						.getBreakpoints({ uri: model.uri, lineNumber });
					const hasBreakpoints = breakpoints.length > 0;
					return hasBreakpoints;
				},
			})
		);
	}
}

class InlineCompletionFeature implements Feature {
	public readonly audioCue = AudioCue.inlineSuggestion;

	getObservableState(editor: ICodeEditor, _model: ITextModel): IObservable<FeatureState> {
		const ghostTextController = GhostTextController.get(editor);
		if (!ghostTextController) {
			return constObservable({
				isActive: () => false,
			});
		}

		const activeGhostText = fromEvent(
			ghostTextController.onActiveModelDidChange,
			() => ghostTextController.activeModel
		).map((activeModel) => (
			activeModel
				? fromEvent(
					activeModel.inlineCompletionsModel.onDidChange,
					() => activeModel.inlineCompletionsModel.ghostText
				)
				: undefined
		));

		return new LazyDerived(reader => {
			const ghostText = activeGhostText.read(reader)?.read(reader);
			return {
				isActive(lineNumber) {
					return ghostText?.lineNumber === lineNumber;
				}
			};
		}, 'ghostText');
	}
}
