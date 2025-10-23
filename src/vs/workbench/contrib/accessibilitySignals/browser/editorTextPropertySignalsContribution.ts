/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IReader, autorun, autorunWithStore, derived, observableFromEvent, observableFromPromise, observableFromValueWithChangeEvent, observableSignalFromEvent, wasEventTriggeredRecently } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { ICodeEditor, isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { CursorChangeReason } from '../../../../editor/common/cursorEvents.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { FoldingController } from '../../../../editor/contrib/folding/browser/folding.js';
import { AccessibilityModality, AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IDebugService } from '../../debug/common/debug.js';

export class EditorTextPropertySignalsContribution extends Disposable implements IWorkbenchContribution {
	private readonly _textProperties: TextProperty[];

	private readonly _someAccessibilitySignalIsEnabled;

	private readonly _activeEditorObservable;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService
	) {
		super();
		this._textProperties = [
			this._instantiationService.createInstance(MarkerTextProperty, AccessibilitySignal.errorAtPosition, AccessibilitySignal.errorOnLine, MarkerSeverity.Error),
			this._instantiationService.createInstance(MarkerTextProperty, AccessibilitySignal.warningAtPosition, AccessibilitySignal.warningOnLine, MarkerSeverity.Warning),
			this._instantiationService.createInstance(FoldedAreaTextProperty),
			this._instantiationService.createInstance(BreakpointTextProperty),
		];
		this._someAccessibilitySignalIsEnabled = derived(this, reader =>
			this._textProperties
				.flatMap(p => [p.lineSignal, p.positionSignal])
				.filter(isDefined)
				.some(signal => observableFromValueWithChangeEvent(this, this._accessibilitySignalService.getEnabledState(signal, false)).read(reader))
		);
		this._activeEditorObservable = observableFromEvent(this,
			this._editorService.onDidActiveEditorChange,
			(_) => {
				const activeTextEditorControl = this._editorService.activeTextEditorControl;

				const editor = isDiffEditor(activeTextEditorControl)
					? activeTextEditorControl.getOriginalEditor()
					: isCodeEditor(activeTextEditorControl)
						? activeTextEditorControl
						: undefined;

				return editor && editor.hasModel() ? { editor, model: editor.getModel() } : undefined;
			}
		);

		this._register(autorunWithStore((reader, store) => {
			/** @description updateSignalsEnabled */
			if (!this._someAccessibilitySignalIsEnabled.read(reader)) {
				return;
			}
			const activeEditor = this._activeEditorObservable.read(reader);
			if (activeEditor) {
				this._registerAccessibilitySignalsForEditor(activeEditor.editor, activeEditor.model, store);
			}
		}));
	}

	private _registerAccessibilitySignalsForEditor(editor: ICodeEditor, editorModel: ITextModel, store: DisposableStore): void {
		let lastLine = -1;
		const ignoredLineSignalsForCurrentLine = new Set<TextProperty>();

		const timeouts = store.add(new DisposableStore());

		const propertySources = this._textProperties.map(p => ({ source: p.createSource(editor, editorModel), property: p }));

		const didType = wasEventTriggeredRecently(editor.onDidChangeModelContent, 100, store);

		store.add(editor.onDidChangeCursorPosition(args => {
			timeouts.clear();

			if (
				args &&
				args.reason !== CursorChangeReason.Explicit &&
				args.reason !== CursorChangeReason.NotSet
			) {
				// Ignore cursor changes caused by navigation (e.g. which happens when execution is paused).
				ignoredLineSignalsForCurrentLine.clear();
				return;
			}

			const trigger = (property: TextProperty, source: TextPropertySource, mode: 'line' | 'positional') => {
				const signal = mode === 'line' ? property.lineSignal : property.positionSignal;
				if (
					!signal
					|| !this._accessibilitySignalService.getEnabledState(signal, false).value
					|| !source.isPresent(position, mode, undefined)
				) {
					return;
				}

				for (const modality of ['sound', 'announcement'] as AccessibilityModality[]) {
					if (this._accessibilitySignalService.getEnabledState(signal, false, modality).value) {
						const delay = this._accessibilitySignalService.getDelayMs(signal, modality, mode) + (didType.get() ? 1000 : 0);

						timeouts.add(disposableTimeout(() => {
							if (source.isPresent(position, mode, undefined)) {
								if (!(mode === 'line') || !ignoredLineSignalsForCurrentLine.has(property)) {
									this._accessibilitySignalService.playSignal(signal, { modality });
								}
								ignoredLineSignalsForCurrentLine.add(property);
							}
						}, delay));
					}
				}
			};

			// React to cursor changes
			const position = args.position;
			const lineNumber = position.lineNumber;
			if (lineNumber !== lastLine) {
				ignoredLineSignalsForCurrentLine.clear();
				lastLine = lineNumber;
				for (const p of propertySources) {
					trigger(p.property, p.source, 'line');
				}
			}
			for (const p of propertySources) {
				trigger(p.property, p.source, 'positional');
			}

			// React to property state changes for the current cursor position
			for (const s of propertySources) {
				if (
					![s.property.lineSignal, s.property.positionSignal]
						.some(s => s && this._accessibilitySignalService.getEnabledState(s, false).value)
				) {
					return;
				}

				let lastValueAtPosition: boolean | undefined = undefined;
				let lastValueOnLine: boolean | undefined = undefined;
				timeouts.add(autorun(reader => {
					const newValueAtPosition = s.source.isPresentAtPosition(args.position, reader);
					const newValueOnLine = s.source.isPresentOnLine(args.position.lineNumber, reader);

					if (lastValueAtPosition !== undefined && lastValueAtPosition !== undefined) {
						if (!lastValueAtPosition && newValueAtPosition) {
							trigger(s.property, s.source, 'positional');
						}
						if (!lastValueOnLine && newValueOnLine) {
							trigger(s.property, s.source, 'line');
						}
					}

					lastValueAtPosition = newValueAtPosition;
					lastValueOnLine = newValueOnLine;
				}));
			}
		}));
	}
}

interface TextProperty {
	readonly positionSignal?: AccessibilitySignal;
	readonly lineSignal?: AccessibilitySignal;
	readonly debounceWhileTyping?: boolean;
	createSource(editor: ICodeEditor, model: ITextModel): TextPropertySource;
}

class TextPropertySource {
	public static notPresent = new TextPropertySource({ isPresentAtPosition: () => false, isPresentOnLine: () => false });

	public readonly isPresentOnLine: (lineNumber: number, reader: IReader | undefined) => boolean;
	public readonly isPresentAtPosition: (position: Position, reader: IReader | undefined) => boolean;

	constructor(options: {
		isPresentOnLine: (lineNumber: number, reader: IReader | undefined) => boolean;
		isPresentAtPosition?: (position: Position, reader: IReader | undefined) => boolean;
	}) {
		this.isPresentOnLine = options.isPresentOnLine;
		this.isPresentAtPosition = options.isPresentAtPosition ?? (() => false);
	}

	public isPresent(position: Position, mode: 'line' | 'positional', reader: IReader | undefined): boolean {
		return mode === 'line' ? this.isPresentOnLine(position.lineNumber, reader) : this.isPresentAtPosition(position, reader);
	}
}

class MarkerTextProperty implements TextProperty {
	public readonly debounceWhileTyping = true;
	constructor(
		public readonly positionSignal: AccessibilitySignal,
		public readonly lineSignal: AccessibilitySignal,
		private readonly severity: MarkerSeverity,
		@IMarkerService private readonly markerService: IMarkerService,

	) { }

	createSource(editor: ICodeEditor, model: ITextModel): TextPropertySource {
		const obs = observableSignalFromEvent('onMarkerChanged', this.markerService.onMarkerChanged);
		return new TextPropertySource({
			isPresentAtPosition: (position, reader) => {
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
		});
	}
}

class FoldedAreaTextProperty implements TextProperty {
	public readonly lineSignal = AccessibilitySignal.foldedArea;

	createSource(editor: ICodeEditor, _model: ITextModel): TextPropertySource {
		const foldingController = FoldingController.get(editor);
		if (!foldingController) { return TextPropertySource.notPresent; }

		const foldingModel = observableFromPromise(foldingController.getFoldingModel() ?? Promise.resolve(undefined));
		return new TextPropertySource({
			isPresentOnLine(lineNumber, reader): boolean {
				const m = foldingModel.read(reader);
				const regionAtLine = m.value?.getRegionAtLine(lineNumber);
				const hasFolding = !regionAtLine
					? false
					: regionAtLine.isCollapsed &&
					regionAtLine.startLineNumber === lineNumber;
				return hasFolding;
			}
		});
	}
}

class BreakpointTextProperty implements TextProperty {
	public readonly lineSignal = AccessibilitySignal.break;

	constructor(@IDebugService private readonly debugService: IDebugService) { }

	createSource(editor: ICodeEditor, model: ITextModel): TextPropertySource {
		const signal = observableSignalFromEvent('onDidChangeBreakpoints', this.debugService.getModel().onDidChangeBreakpoints);
		const debugService = this.debugService;
		return new TextPropertySource({
			isPresentOnLine(lineNumber, reader): boolean {
				signal.read(reader);
				const breakpoints = debugService
					.getModel()
					.getBreakpoints({ uri: model.uri, lineNumber });
				const hasBreakpoints = breakpoints.length > 0;
				return hasBreakpoints;
			}
		});
	}
}
