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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { raceTimeout } from 'vs/base/common/async';
import { FileAccess } from 'vs/base/common/network';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { autorunDelta, constObservable, debouncedObservable, fromEvent, fromPromise, IObservable, LazyDerived, wasEventTriggeredRecently } from 'vs/workbench/contrib/audioCues/browser/observable';
import { ITextModel } from 'vs/editor/common/model';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';

export class AudioCueContribution extends Disposable implements IWorkbenchContribution {
	private audioCuesEnabled = false;
	private readonly store = this._register(new DisposableStore());

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
			this.updateAudioCuesEnabled();
		});

		this._register(
			configurationService.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('audioCues.enabled')) {
					this.updateAudioCuesEnabled();
				}
			})
		);

		this.updateAudioCuesEnabled();
	}

	private getAudioCuesEnabled(): boolean {
		const value = this.configurationService.getValue<'auto' | 'on' | 'off'>('audioCues.enabled');
		if (value === 'on') {
			return true;
		} else if (value === 'auto') {
			return this.accessibilityService.isScreenReaderOptimized();
		} else {
			return false;
		}
	}

	private updateAudioCuesEnabled() {
		const newValue = this.getAudioCuesEnabled();
		if (newValue === this.audioCuesEnabled) {
			return;
		}
		this.audioCuesEnabled = newValue;
		if (!this.audioCuesEnabled) {
			this.store.clear();
			return;
		}

		this.store.add(
			Event.runAndSubscribeWithStore(
				this.editorService.onDidActiveEditorChange,
				(_, store) => {
					const activeTextEditorControl =
						this.editorService.activeTextEditorControl;

					const editor = isDiffEditor(activeTextEditorControl)
						? activeTextEditorControl.getOriginalEditor()
						: isCodeEditor(activeTextEditorControl)
							? activeTextEditorControl
							: undefined;

					if (editor && editor.hasModel()) {
						this.handleCurrentEditor(editor, editor.getModel(), store);
					}
				}
			)
		);
	}

	private handleCurrentEditor(editor: ICodeEditor, editorModel: ITextModel, store: DisposableStore): void {
		const features: Feature[] = [
			this.instantiationService.createInstance(ErrorFeature),
			this.instantiationService.createInstance(FoldedAreaFeature),
			this.instantiationService.createInstance(BreakpointFeature),
			this.instantiationService.createInstance(InlineCompletionFeature),
		];
		const observableFeatureStates = features.map((feature) =>
			feature.getObservableState(editor, editorModel)
		);

		const curLineNumber = fromEvent(
			editor.onDidChangeCursorPosition,
			() => editor.getPosition()?.lineNumber
		);
		const debouncedLineNumber = debouncedObservable(curLineNumber, 100, store);

		const lineNumberWithObservableFeatures = debouncedLineNumber.map(
			(lineNumber) => lineNumber === undefined ? undefined : {
				lineNumber,
				featureStatesForLine: observableFeatureStates.map(
					(featureResult) =>
						// This caches the feature state for the active line
						new LazyDerived(
							(reader) => featureResult.read(reader).isActive(lineNumber),
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
		const featureStatesBeforeTyping = isTyping.map((isTyping) =>
			(!isTyping
				? undefined
				: lineNumberWithObservableFeatures
					.get()
					?.featureStatesForLine?.map((featureState, idx) =>
						features[idx].debounceWhileTyping ? featureState.get() : undefined
					)) ?? []
		);

		const state = new LazyDerived(reader => {
			const lineInfo = lineNumberWithObservableFeatures.read(reader);
			if (lineInfo === undefined) {
				return undefined;
			}
			return {
				lineNumber: lineInfo.lineNumber,
				featureStates: new Map(
					lineInfo.featureStatesForLine.map((featureState, idx) => [
						features[idx],
						featureStatesBeforeTyping.read(reader)[idx] ??
						featureState.read(reader),
					])
				),
			};
		}, 'state');

		store.add(
			autorunDelta(state, ({ lastValue, newValue }) => {
				for (const feature of features) {
					if (
						newValue?.featureStates.get(feature) &&
						(!lastValue?.featureStates?.get(feature) ||
							newValue.lineNumber !== lastValue.lineNumber)
					) {
						this.playSound(feature.audioCueFilename);
					}
				}
			})
		);
	}

	private async playSound(fileName: string) {
		if (!this.audioCuesEnabled) {
			return;
		}

		const url = FileAccess.asBrowserUri(`vs/workbench/contrib/audioCues/browser/media/${fileName}.opus`, require).toString();
		const audio = new Audio(url);

		try {
			try {
				// Don't play when loading takes more than 1s, due to loading, decoding or playing issues.
				// Delayed sounds are very confusing.
				await raceTimeout(audio.play(), 1000);
			} catch (e) {
				console.error('Error while playing sound', e);
			}
		} finally {
			audio.remove();
		}
	}
}

interface Feature {
	audioCueFilename: string;
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
	public readonly audioCueFilename = 'error';
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
	public readonly audioCueFilename = 'foldedAreas';

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
	public readonly audioCueFilename = 'break';

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
	public readonly audioCueFilename = 'break';

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<FeatureState> {
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
