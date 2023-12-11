/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from 'vs/base/common/cache';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunDelta, constObservable, debouncedObservable, derived, derivedOpts, observableFromEvent, observableFromPromise, wasEventTriggeredRecently } from 'vs/base/common/observable';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ITextModel } from 'vs/editor/common/model';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class AudioCueLineFeatureContribution
	extends Disposable
	implements IWorkbenchContribution {
	private readonly store = this._register(new DisposableStore());

	private readonly features: LineFeature[] = [
		this.instantiationService.createInstance(MarkerLineFeature, AudioCue.error, MarkerSeverity.Error),
		this.instantiationService.createInstance(MarkerLineFeature, AudioCue.warning, MarkerSeverity.Warning),
		this.instantiationService.createInstance(FoldedAreaLineFeature),
		this.instantiationService.createInstance(BreakpointLineFeature),
	];

	private readonly isEnabledCache = new CachedFunction<AudioCue, IObservable<boolean>>((cue) => observableFromEvent(
		this.audioCueService.onEnabledChanged(cue),
		() => this.audioCueService.isEnabled(cue)
	));

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAudioCueService private readonly audioCueService: IAudioCueService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		const someAudioCueFeatureIsEnabled = derived(
			(reader) => /** @description someAudioCueFeatureIsEnabled */ this.features.some((feature) =>
				this.isEnabledCache.get(feature.audioCue).read(reader)
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
			autorun(reader => {
				/** @description updateAudioCuesEnabled */
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
		const curPosition = observableFromEvent(
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
				return editor.getPosition();
			}
		);
		const debouncedPosition = debouncedObservable(curPosition, this._configurationService.getValue('audioCues.debouncePositionChanges') ? 300 : 0, store);
		const isTyping = wasEventTriggeredRecently(
			editorModel.onDidChangeContent.bind(editorModel),
			1000,
			store
		);

		const featureStates = this.features.map((feature) => {
			const lineFeatureState = feature.getObservableState(editor, editorModel);
			const isFeaturePresent = derivedOpts(
				{ debugName: `isPresentInLine:${feature.audioCue.name}` },
				(reader) => {
					if (!this.isEnabledCache.get(feature.audioCue).read(reader)) {
						return false;
					}
					const position = debouncedPosition.read(reader);
					if (!position) {
						return false;
					}
					return lineFeatureState.read(reader).isPresent(position);
				}
			);
			return derivedOpts(
				{ debugName: `typingDebouncedFeatureState:\n${feature.audioCue.name}` },
				(reader) =>
					feature.debounceWhileTyping && isTyping.read(reader)
						? (debouncedPosition.read(reader), isFeaturePresent.get())
						: isFeaturePresent.read(reader)
			);
		});

		const state = derived(
			(reader) => /** @description states */({
				lineNumber: debouncedPosition.read(reader),
				featureStates: new Map(
					this.features.map((feature, idx) => [
						feature,
						featureStates[idx].read(reader),
					])
				),
			})
		);

		store.add(
			autorunDelta(state, ({ lastValue, newValue }) => {
				/** @description Play Audio Cue */
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
	isPresent(position: Position): boolean;
}

class MarkerLineFeature implements LineFeature {
	public readonly debounceWhileTyping = true;
	private _previousLine: number = 0;
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
				isPresent: (position) => {
					const lineChanged = position.lineNumber !== this._previousLine;
					this._previousLine = position.lineNumber;
					const hasMarker = this.markerService
						.read({ resource: model.uri })
						.some(
							(m) => {
								const onLine = m.severity === this.severity && m.startLineNumber <= position.lineNumber && position.lineNumber <= m.endLineNumber;
								return lineChanged ? onLine : onLine && (position.lineNumber <= m.endLineNumber && m.startColumn <= position.column && m.endColumn >= position.column);
							});
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
			isPresent: (position) => {
				const regionAtLine = v.value?.getRegionAtLine(position.lineNumber);
				const hasFolding = !regionAtLine
					? false
					: regionAtLine.isCollapsed &&
					regionAtLine.startLineNumber === position.lineNumber;
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
				isPresent: (position) => {
					const breakpoints = this.debugService
						.getModel()
						.getBreakpoints({ uri: model.uri, lineNumber: position.lineNumber });
					const hasBreakpoints = breakpoints.length > 0;
					return hasBreakpoints;
				},
			})
		);
	}
}
