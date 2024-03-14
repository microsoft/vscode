/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from 'vs/base/common/cache';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunDelta, constObservable, derived, derivedOpts, observableFromEvent, observableFromPromise } from 'vs/base/common/observable';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ITextModel } from 'vs/editor/common/model';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { AccessibilitySignal, SignalModality, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
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

	private readonly features: LineFeature[] = [
		this.instantiationService.createInstance(MarkerLineFeature, AccessibilitySignal.error, MarkerSeverity.Error),
		this.instantiationService.createInstance(MarkerLineFeature, AccessibilitySignal.warning, MarkerSeverity.Warning),
		this.instantiationService.createInstance(FoldedAreaLineFeature),
		this.instantiationService.createInstance(BreakpointLineFeature),
	];

	private readonly isSoundEnabledCache = new CachedFunction<AccessibilitySignal, IObservable<boolean>>((cue) => observableFromEvent(
		this.accessibilitySignalService.onSoundEnabledChanged(cue),
		() => this.accessibilitySignalService.isSoundEnabled(cue)
	));

	private readonly isAnnouncementEnabledCache = new CachedFunction<AccessibilitySignal, IObservable<boolean>>((cue) => observableFromEvent(
		this.accessibilitySignalService.onAnnouncementEnabledChanged(cue),
		() => this.accessibilitySignalService.isAnnouncementEnabled(cue)
	));

	private readonly modalities: SignalModality[] = [SignalModality.Sound, SignalModality.Announcement];
	private pendingAccessibilitySignals: Map<SignalModality, any | null> = new Map();

	private cancelAccessibilitySignals(modality: SignalModality) {
		const pendingSignal = this.pendingAccessibilitySignals.get(modality);
		if (pendingSignal !== null) {
			clearTimeout(pendingSignal);
			this.pendingAccessibilitySignals.set(modality, null);
		}
	}

	private delayedAccessibilitySignals(signals: AccessibilitySignal[], modality: SignalModality, delay: number) {
		const timeout = setTimeout(() => {
			this.accessibilitySignalService.playAccessibilitySignals(signals, modality);
		}, delay);
		this.pendingAccessibilitySignals.set(modality, timeout);
	}

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		const someAccessibilitySignalIsEnabled = derived(
			(reader) => /** @description someAccessibilitySignalFeatureIsEnabled */ this.features.some((feature) =>
				this.isSoundEnabledCache.get(feature.signal).read(reader) || this.isAnnouncementEnabledCache.get(feature.signal).read(reader)
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

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.signals.lineFeatureDelays')) {
				this.features.forEach(f => f.readDelaysFromSettings(this._configurationService));
			}
		}));

		this._register(
			autorun(reader => {
				/** @description updateSignalsEnabled */
				this.store.clear();

				if (!someAccessibilitySignalIsEnabled.read(reader)) {
					return;
				}

				const activeEditor = activeEditorObservable.read(reader);
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
				// Ensure that any pending accessibility signal is cancelled immediately whenever the cursor position changes in the editor
				for (const modality of this.modalities) {
					this.cancelAccessibilitySignals(modality);
				}
				return editor.getPosition();
			}
		);

		const featureStates = this.features.map((feature) => {
			const lineFeatureState = feature.getObservableState(editor, editorModel);
			const isFeaturePresent = derivedOpts(
				{ debugName: `isPresentInLine:${feature.signal.name}` },
				(reader) => {
					if (!this.isSoundEnabledCache.get(feature.signal).read(reader) && !this.isAnnouncementEnabledCache.get(feature.signal).read(reader)) {
						return false;
					}
					const position = curPosition.read(reader);
					if (!position) {
						return false;
					}
					feature.trackLineChanged(position);

					return lineFeatureState.read(reader).isPresent(position);
				}
			);
			return isFeaturePresent;
		});

		const state = derived(
			(reader) => /** @description states */({
				lineNumber: curPosition.read(reader),
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
				if (newFeatures.length) {
					const newSignals = newFeatures.map(f => f.signal);
					for (const modality of this.modalities) {
						// The delay is determined by the shortest delay among the existing line features
						const delay = Math.min(...newFeatures.map(f => f.getDelay(modality)));
						this.delayedAccessibilitySignals(newSignals, modality, delay);
					}
				}
			})
		);
	}
}

interface LineFeature {
	signal: AccessibilitySignal;
	getObservableState(
		editor: ICodeEditor,
		model: ITextModel
	): IObservable<LineFeatureState>;
	readDelaysFromSettings(configurationService: IConfigurationService): void;
	trackLineChanged(position: Position): void;
	getDelay(modality: SignalModality): number;
}

interface LineFeatureState {
	isPresent(position: Position): boolean;
}

type DelayType = {
	lineDelay: number;
	inlineDelay: number;
};

abstract class BaseLineFeature implements LineFeature {
	abstract signal: AccessibilitySignal;
	abstract getObservableState(
		editor: ICodeEditor,
		model: ITextModel
	): IObservable<LineFeatureState>;

	// Holds the current delay values associated with this feature
	protected _modalityDelays: Map<SignalModality, DelayType> = new Map();
	protected setModalityDelays(modality: SignalModality, lineDelay: number | undefined, inlineDelay: number | undefined) {
		this._modalityDelays.set(modality, { lineDelay: lineDelay || 0, inlineDelay: inlineDelay || 0 });
	}
	public readDelaysFromSettings(configurationService: IConfigurationService) {
		// set default delays to "info" feature type (longer delays)
		this.setModalityDelays(
			SignalModality.Sound,
			configurationService.getValue('accessibility.signals.lineFeatureDelays.informational.soundLineDelay'),
			configurationService.getValue('accessibility.signals.lineFeatureDelays.informational.soundInlineDelay')
		);
		this.setModalityDelays(
			SignalModality.Announcement,
			configurationService.getValue('accessibility.signals.lineFeatureDelays.informational.announcementLineDelay'),
			configurationService.getValue('accessibility.signals.lineFeatureDelays.informational.announcementInlineDelay')
		);
	}

	protected _previousLine: number = 0;
	protected _lineChanged: boolean = false;
	public trackLineChanged(position: Position) {
		this._lineChanged = position.lineNumber !== this._previousLine;
		this._previousLine = position.lineNumber;
	}

	public getDelay(modality: SignalModality): number {
		let minDelay = Infinity;
		for (const [key, delayObj] of this._modalityDelays) {
			if ((modality & key) !== 0) {
				const delay = this._lineChanged ? delayObj.lineDelay : delayObj.inlineDelay;
				if (delay < minDelay) {
					minDelay = delay;
				}
			}
		}
		return minDelay === Infinity ? 0 : minDelay;
	}
}

class MarkerLineFeature extends BaseLineFeature implements LineFeature {
	public override readDelaysFromSettings(configurationService: IConfigurationService) {
		// set delays to "critical" feature type (shorter delays)
		this.setModalityDelays(
			SignalModality.Sound,
			configurationService.getValue('accessibility.signals.lineFeatureDelays.critical.soundLineDelay'),
			configurationService.getValue('accessibility.signals.lineFeatureDelays.critical.soundInlineDelay')
		);
		this.setModalityDelays(
			SignalModality.Announcement,
			configurationService.getValue('accessibility.signals.lineFeatureDelays.critical.announcementLineDelay'),
			configurationService.getValue('accessibility.signals.lineFeatureDelays.critical.announcementInlineDelay')
		);
	}

	constructor(
		public readonly signal: AccessibilitySignal,
		private readonly severity: MarkerSeverity,
		@IMarkerService private readonly markerService: IMarkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.readDelaysFromSettings(this.configurationService);
	}

	getObservableState(editor: ICodeEditor, model: ITextModel): IObservable<LineFeatureState> {
		return observableFromEvent<LineFeatureState>(
			Event.filter(this.markerService.onMarkerChanged, (changedUris) =>
				changedUris.some((u) => u.toString() === model.uri.toString())
			),
			() => /** @description this.markerService.onMarkerChanged */({
				isPresent: (position) => {
					const hasMarker = this.markerService
						.read({ resource: model.uri })
						.some(
							(m) => {
								const onLine = m.severity === this.severity && m.startLineNumber <= position.lineNumber && position.lineNumber <= m.endLineNumber;
								return this._lineChanged ? onLine : onLine && (position.lineNumber <= m.endLineNumber && m.startColumn <= position.column && m.endColumn >= position.column);
							});
					return hasMarker;
				},
			})
		);
	}
}

class FoldedAreaLineFeature extends BaseLineFeature implements LineFeature {
	public readonly signal = AccessibilitySignal.foldedArea;

	constructor(@IConfigurationService private readonly configurationService: IConfigurationService) {
		super();
		this.readDelaysFromSettings(this.configurationService);
	}

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

class BreakpointLineFeature extends BaseLineFeature implements LineFeature {
	public readonly signal = AccessibilitySignal.break;

	constructor(@
		IDebugService private readonly debugService: IDebugService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.readDelaysFromSettings(this.configurationService);
	}

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
