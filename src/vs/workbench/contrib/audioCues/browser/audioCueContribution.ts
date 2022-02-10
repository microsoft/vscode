/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Emitter, Event } from 'vs/base/common/event';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { raceTimeout } from 'vs/base/common/async';
import { FileAccess } from 'vs/base/common/network';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FoldingModel } from 'vs/editor/contrib/folding/browser/foldingModel';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class AudioCueContribution extends DisposableStore implements IWorkbenchContribution {
	private audioCuesEnabled = false;
	private readonly store = this.add(new DisposableStore());

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
			this.updateAudioCuesEnabled();
		});

		this.add(
			_configurationService.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('audioCues.enabled')) {
					this.updateAudioCuesEnabled();
				}
			})
		);

		this.updateAudioCuesEnabled();
	}

	private getAudioCuesEnabled(): boolean {
		const value = this._configurationService.getValue<'auto' | 'on' | 'off'>('audioCues.enabled');
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

					if (editor) {
						this.handleCurrentEditor(editor, store);
					}
				}
			)
		);
	}

	private handleCurrentEditor(editor: ICodeEditor, store: DisposableStore): void {
		const features: Feature[] = [
			this.instantiationService.createInstance(ErrorFeature),
			this.instantiationService.createInstance(FoldedAreaFeature),
			this.instantiationService.createInstance(BreakpointFeature),
		];

		const featuresPerEditor = new Map(
			features.map((feature) => [
				feature,
				feature.createForEditor(editor, editor.getModel()!.uri),
			])
		);

		interface State {
			lineNumber: number;
			featureStates: Map<Feature, boolean>;
		}

		const computeNewState = (): State | undefined => {
			if (!editor.hasModel()) {
				return undefined;
			}
			const position = editor.getPosition();

			const lineNumber = position.lineNumber;
			const featureStates = new Map(
				features.map((feature) => [
					feature,
					featuresPerEditor.get(feature)!.isActive(lineNumber),
				])
			);
			return {
				lineNumber,
				featureStates
			};
		};

		let lastState: State | undefined;
		const updateState = () => {
			const newState = computeNewState();

			for (const feature of features) {
				if (
					newState &&
					newState.featureStates.get(feature) &&
					(!lastState?.featureStates?.get(feature) ||
						newState.lineNumber !== lastState.lineNumber)
				) {
					this.playSound(feature.audioCueFilename);
				}
			}

			lastState = newState;
		};

		for (const feature of featuresPerEditor.values()) {
			if (feature.onChange) {
				store.add(feature.onChange(updateState));
			}
		}

		{
			let lastLineNumber = -1;
			store.add(
				editor.onDidChangeCursorPosition(() => {
					const position = editor.getPosition();
					if (!position) {
						return;
					}
					const lineNumber = position.lineNumber;
					if (lineNumber === lastLineNumber) {
						return;
					}
					lastLineNumber = lineNumber;

					updateState();
				})
			);
		}

		updateState();
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
	createForEditor(
		editor: ICodeEditor,
		uri: URI
	): FeatureResult;
}

interface FeatureResult {
	isActive(lineNumber: number): boolean;
	onChange?: Event<void>;
}

class ErrorFeature implements Feature {
	public readonly audioCueFilename = 'error';

	constructor(@IMarkerService private readonly markerService: IMarkerService) { }

	createForEditor(
		editor: ICodeEditor,
		uri: URI
	): FeatureResult {
		return {
			isActive: (lineNumber) => {
				const hasMarker = this.markerService
					.read({ resource: uri })
					.some(
						(m) =>
							m.severity === MarkerSeverity.Error &&
							m.startLineNumber <= lineNumber &&
							lineNumber <= m.endLineNumber
					);
				return hasMarker;
			},
			onChange: Event.map(
				Event.filter(
					this.markerService.onMarkerChanged,
					(changedUris) => {
						const curUri = editor.getModel()?.uri?.toString();
						return (
							!!curUri && changedUris.some((u) => u.toString() === curUri)
						);
					}
				),
				(x) => undefined
			),
		};
	}
}

class FoldedAreaFeature implements Feature {
	public readonly audioCueFilename = 'foldedAreas';

	createForEditor(
		editor: ICodeEditor,
		uri: URI
	): FeatureResult {
		const emitter = new Emitter<void>();
		let foldingModel: FoldingModel | null = null;
		editor
			.getContribution<FoldingController>(FoldingController.ID)
			?.getFoldingModel()
			?.then((newFoldingModel) => {
				foldingModel = newFoldingModel;
				emitter.fire();
			});

		return {
			isActive: lineNumber => {
				const regionAtLine = foldingModel?.getRegionAtLine(lineNumber);
				const hasFolding = !regionAtLine
					? false
					: regionAtLine.isCollapsed &&
					regionAtLine.startLineNumber === lineNumber;
				return hasFolding;
			},
			onChange: emitter.event,
		};
	}
}

class BreakpointFeature implements Feature {
	public readonly audioCueFilename = 'break';

	constructor(@IDebugService private readonly debugService: IDebugService) { }

	createForEditor(
		editor: ICodeEditor,
		uri: URI
	): FeatureResult {
		return {
			isActive: (lineNumber) => {
				const breakpoints = this.debugService
					.getModel()
					.getBreakpoints({ uri, lineNumber });
				const hasBreakpoints = breakpoints.length > 0;
				return hasBreakpoints;
			},
			onChange: Event.map(
				this.debugService.getModel().onDidChangeBreakpoints,
				() => undefined
			),
		};
	}
}
