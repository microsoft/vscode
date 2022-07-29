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
import { ITextModel } from 'vs/editor/common/model';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { AudioCue, IAudioCueService } from 'vs/workbench/contrib/audioCues/browser/audioCueService';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { autorun, autorunDelta, constObservable, debouncedObservable, derived, IObservable, observableFromEvent, observableFromPromise, wasEventTriggeredRecently } from 'vs/base/common/observable';

export class AudioCueLineFeatureContribution
	extends Disposable
	implements IWorkbenchContribution {
	private readonly store = this._register(new DisposableStore());

	private readonly features: LineFeature[] = [
		this.instantiationService.createInstance(MarkerLineFeature, AudioCue.error, MarkerSeverity.Error),
		this.instantiationService.createInstance(MarkerLineFeature, AudioCue.warning, MarkerSeverity.Warning),
		this.instantiationService.createInstance(FoldedAreaLineFeature),
		this.instantiationService.createInstance(BreakpointLineFeature),
		this.instantiationService.createInstance(InlineCompletionLineFeature),
	];

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAudioCueService private readonly audioCueService: IAudioCueService
	) {
		super();

		const someAudioCueFeatureIsEnabled = derived(
			'someAudioCueFeatureIsEnabled',
			(reader) =>
				this.features.some((feature) =>
					this.audioCueService.isEnabled(feature.audioCue).read(reader)
				)
		);

		const activeEditorObservable = observableFromEvent(
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
			autorun('updateAudioCuesEnabled', (reader) => {
				this.store.clear();

				if (!someAudioCueFeatureIsEnabled.read(reader)) {
					return;
				}

				const activeEditor = activeEditorObservable.read(reader);
				if (activeEditor) {
					this.registerAudioCuesForEditor(activeEditor.editor, activeEditor.model, this.store);
				}
			})
		);
	}

	private registerAudioCuesForEditor(
		editor: ICodeEditor,
		editorModel: ITextModel,
		store: DisposableStore
	): void {
		const curLineNumber = observableFromEvent(
			editor.onDidChangeCursorPosition,
			(args) => {
				/** @description editor.onDidChangeCursorPosition (caused by user) */
				if (
					args &&
					args.reason !== CursorChangeReason.Explicit &&
					args.reason !== CursorChangeReason.NotSet
				) {
					// Ignore cursor changes caused by navigation (e.g. which happens when execution is paused).
					return undefined;
				}
				return editor.getPosition()?.lineNumber;
			}
		);
		const debouncedLineNumber = debouncedObservable(curLineNumber, 300, store);

		const isTyping = wasEventTriggeredRecently(
			editorModel.onDidChangeContent.bind(editorModel),
			1000,
			store
		);

		const featureStates = this.features.map((feature) => {
			const lineFeatureState = feature.getObservableState(editor, editorModel);
			const isFeaturePresent = derived(
				`isPresentInLine:${feature.audioCue.name}`,
				(reader) => {
					if (!this.audioCueService.isEnabled(feature.audioCue).read(reader)) {
						return false;
					}
					const lineNumber = debouncedLineNumber.read(reader);
					return lineNumber === undefined
						? false
						: lineFeatureState.read(reader).isPresent(lineNumber);
				}
			);
			return derived(
				`typingDebouncedFeatureState:\n${feature.audioCue.name}`,
				(reader) =>
					feature.debounceWhileTyping && isTyping.read(reader)
						? (debouncedLineNumber.read(reader), isFeaturePresent.get())
						: isFeaturePresent.read(reader)
			);
		});

		const state = derived(
			'states',
			(reader) => ({
				lineNumber: debouncedLineNumber.read(reader),
				featureStates: new Map(
					this.features.map((feature, idx) => [
						feature,
						featureStates[idx].read(reader),
					])
				),
			})
		);

		store.add(
			autorunDelta('Play Audio Cue', state, ({ lastValue, newValue }) => {
				const newFeatures = this.features.filter(
					feature =>
						newValue?.featureStates.get(feature) &&
						(!lastValue?.featureStates?.get(feature) || newValue.lineNumber !== lastValue.lineNumber)
				);

				this.audioCueService.playAudioCues(newFeatures.map(f => f.audioCue));
			})
		);
	}
}

interface LineFeature {
	audioCue: AudioCue;
	debounceWhileTyping?: boolean;
	getObservableState(
		editor: ICodeEditor,
		model: ITextModel
	): IObservable<LineFeatureState>;
}

interface LineFeatureState {
	isPresent(lineNumber: number): boolean;
}

class MarkerLineFeature implements LineFeature {
	public readonly debounceWhileTyping = true;

	constructor(
		public readonly audioCue: AudioCue,
		private readonly severity: MarkerSeverity,
		@IMarkerService private readonly markerService: IMarkerService,

	) { }

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<LineFeatureState> {
		return observableFromEvent<LineFeatureState>(
			Event.filter(this.markerService.onMarkerChanged, (changedUris) =>
				changedUris.some((u) => u.toString() === model.uri.toString())
			),
			() => /** @description this.markerService.onMarkerChanged */({
				isPresent: (lineNumber) => {
					const hasMarker = this.markerService
						.read({ resource: model.uri })
						.some(
							(m) =>
								m.severity === this.severity &&
								m.startLineNumber <= lineNumber &&
								lineNumber <= m.endLineNumber
						);
					return hasMarker;
				},
			})
		);
	}
}

class FoldedAreaLineFeature implements LineFeature {
	public readonly audioCue = AudioCue.foldedArea;

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<LineFeatureState> {
		const foldingController = FoldingController.get(editor);
		if (!foldingController) {
			return constObservable({
				isPresent: () => false,
			});
		}

		const foldingModel = observableFromPromise(
			foldingController.getFoldingModel() ?? Promise.resolve(undefined)
		);
		return foldingModel.map<LineFeatureState>((v) => ({
			isPresent: (lineNumber) => {
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

class BreakpointLineFeature implements LineFeature {
	public readonly audioCue = AudioCue.break;

	constructor(@IDebugService private readonly debugService: IDebugService) { }

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<LineFeatureState> {
		return observableFromEvent<LineFeatureState>(
			this.debugService.getModel().onDidChangeBreakpoints,
			() => /** @description debugService.getModel().onDidChangeBreakpoints */({
				isPresent: (lineNumber) => {
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

class InlineCompletionLineFeature implements LineFeature {
	public readonly audioCue = AudioCue.inlineSuggestion;

	getObservableState(editor: ICodeEditor, _model: ITextModel): IObservable<LineFeatureState> {
		const ghostTextController = GhostTextController.get(editor);
		if (!ghostTextController) {
			return constObservable<LineFeatureState>({
				isPresent: () => false,
			});
		}

		const activeGhostText = observableFromEvent(
			ghostTextController.onActiveModelDidChange,
			() => /** @description ghostTextController.onActiveModelDidChange */ ghostTextController.activeModel
		).map((activeModel) => (
			activeModel
				? observableFromEvent(
					activeModel.inlineCompletionsModel.onDidChange,
					() => /** @description activeModel.inlineCompletionsModel.onDidChange */ activeModel.inlineCompletionsModel.ghostText
				)
				: undefined
		));

		return derived<LineFeatureState>('ghostText', reader => {
			const ghostText = activeGhostText.read(reader)?.read(reader);
			return {
				isPresent(lineNumber) {
					return ghostText?.lineNumber === lineNumber;
				}
			};
		});
	}
}
