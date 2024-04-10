/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from 'vs/base/common/cache';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IObservable, IReader, autorun, autorunDelta, derived, derivedOpts, observableFromEvent, observableFromPromise, wasEventTriggeredRecently } from 'vs/base/common/observable';
import { debouncedObservable2, observableSignalFromEvent } from 'vs/base/common/observableInternal/utils';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ITextModel } from 'vs/editor/common/model';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class SignalLineFeatureContribution
	extends Disposable
	implements IWorkbenchContribution {
	private readonly store = this._register(new DisposableStore());
	private _previousLineNumber: number | undefined = undefined;

	private readonly features: LineFeature[] = [
		this.instantiationService.createInstance(MarkerLineFeature, AccessibilitySignal.error, MarkerSeverity.Error),
		this.instantiationService.createInstance(MarkerLineFeature, AccessibilitySignal.warning, MarkerSeverity.Warning),
		this.instantiationService.createInstance(FoldedAreaLineFeature),
		this.instantiationService.createInstance(BreakpointLineFeature),
	];

	private readonly isEnabledCache = new CachedFunction<AccessibilitySignal, IObservable<boolean>>((cue) => observableFromEvent(
		Event.any(
			this.accessibilitySignalService.onSoundEnabledChanged(cue),
			this.accessibilitySignalService.onAnnouncementEnabledChanged(cue),
		),
		() => this.accessibilitySignalService.isSoundEnabled(cue) || this.accessibilitySignalService.isAnnouncementEnabled(cue)
	));

	private readonly _someAccessibilitySignalIsEnabled = derived(this,
		(reader) => this.features.some((feature) =>
			this.isEnabledCache.get(feature.signal).read(reader)
		)
	);

	private readonly _activeEditorObservable = observableFromEvent(
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

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();


		this._register(
			autorun(reader => {
				/** @description updateSignalsEnabled */
				this.store.clear();

				if (!this._someAccessibilitySignalIsEnabled.read(reader)) {
					return;
				}
				const activeEditor = this._activeEditorObservable.read(reader);
				if (activeEditor) {
					this.registerAccessibilitySignalsForEditor(activeEditor.editor, activeEditor.model, this.store);
				}
			})
		);
	}

	private registerAccessibilitySignalsForEditor(
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
		const debouncedPosition = debouncedObservable2(curPosition, this._configurationService.getValue('accessibility.signals.debouncePositionChanges') ? 300 : 0);
		const isTyping = wasEventTriggeredRecently(
			e => editorModel.onDidChangeContent(e),
			1000,
			store
		);

		const featureStates = this.features.map((feature) => {
			const lineFeatureState = feature.createSource(editor, editorModel);
			const isFeaturePresent = derivedOpts(
				{ debugName: `isPresentInLine:${feature.signal.name}` },
				(reader) => {
					if (!this.isEnabledCache.get(feature.signal).read(reader)) {
						return false;
					}
					const position = debouncedPosition.read(reader);
					if (!position) {
						return false;
					}
					const lineChanged = this._previousLineNumber !== position.lineNumber;
					const isPresent = lineFeatureState.isPresent?.(position, reader) || (lineChanged && lineFeatureState.isPresentOnLine(position.lineNumber, reader));
					this._previousLineNumber = position.lineNumber;
					return isPresent;
				}
			);
			return derivedOpts(
				{ debugName: `typingDebouncedFeatureState:\n${feature.signal.name}` },
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
				/** @description Play Accessibility Signal */
				const newFeatures = this.features.filter(
					feature =>
						newValue?.featureStates.get(feature) &&
						(!lastValue?.featureStates?.get(feature) || newValue.lineNumber !== lastValue.lineNumber)
				);

				this.accessibilitySignalService.playSignals(newFeatures.map(f => f.signal));
			})
		);
	}
}

interface LineFeature {
	readonly signal: AccessibilitySignal;
	readonly debounceWhileTyping?: boolean;
	createSource(
		editor: ICodeEditor,
		model: ITextModel
	): LineFeatureSource;
}


interface LineFeatureSource {
	isPresentOnLine(lineNumber: number, reader: IReader): boolean;
	isPresent?(position: Position, reader: IReader): boolean;
}

class MarkerLineFeature implements LineFeature {
	public readonly debounceWhileTyping = true;
	constructor(
		public readonly signal: AccessibilitySignal,
		private readonly severity: MarkerSeverity,
		@IMarkerService private readonly markerService: IMarkerService,

	) { }

	createSource(editor: ICodeEditor, model: ITextModel): LineFeatureSource {
		const obs = observableSignalFromEvent('onMarkerChanged', this.markerService.onMarkerChanged);
		return {
			isPresent: (position, reader) => {
				obs.read(reader);
				const hasMarker = this.markerService
					.read({ resource: model.uri })
					.some(
						(m) =>
							m.severity === this.severity &&
							m.startLineNumber <= position.lineNumber &&
							position.lineNumber <= m.endLineNumber &&
							m.startColumn <= position.column &&
							position.column <= m.endColumn
					);
				return hasMarker;
			},
			isPresentOnLine: (lineNumber, reader) => {
				obs.read(reader);
				const hasMarker = this.markerService
					.read({ resource: model.uri })
					.some(
						(m) =>
							m.severity === this.severity &&
							m.startLineNumber <= lineNumber &&
							lineNumber <= m.endLineNumber
					);
				return hasMarker;
			}
		};
	}
}

class FoldedAreaLineFeature implements LineFeature {
	public readonly signal = AccessibilitySignal.foldedArea;

	createSource(editor: ICodeEditor, _model: ITextModel): LineFeatureSource {
		const foldingController = FoldingController.get(editor);
		if (!foldingController) {
			return { isPresentOnLine: () => false };
		}

		const foldingModel = observableFromPromise(foldingController.getFoldingModel() ?? Promise.resolve(undefined));
		return {
			isPresentOnLine(lineNumber: number, reader: IReader): boolean {
				const m = foldingModel.read(reader);
				const regionAtLine = m.value?.getRegionAtLine(lineNumber);
				const hasFolding = !regionAtLine
					? false
					: regionAtLine.isCollapsed &&
					regionAtLine.startLineNumber === lineNumber;
				return hasFolding;
			}
		};
	}
}

class BreakpointLineFeature implements LineFeature {
	public readonly signal = AccessibilitySignal.break;

	constructor(@IDebugService private readonly debugService: IDebugService) { }

	createSource(editor: ICodeEditor, model: ITextModel): LineFeatureSource {
		const signal = observableSignalFromEvent('onDidChangeBreakpoints', this.debugService.getModel().onDidChangeBreakpoints);
		const debugService = this.debugService;
		return {
			isPresentOnLine(lineNumber: number, reader: IReader): boolean {
				signal.read(reader);
				const breakpoints = debugService
					.getModel()
					.getBreakpoints({ uri: model.uri, lineNumber });
				const hasBreakpoints = breakpoints.length > 0;
				return hasBreakpoints;
			}
		};
	}
}
