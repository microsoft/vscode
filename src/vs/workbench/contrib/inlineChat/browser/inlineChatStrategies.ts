/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getTotalWidth, WindowIntervalTimer } from 'vs/base/browser/dom';
import { coalesceInPlace } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { themeColorFromId } from 'vs/base/common/themables';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, IViewZone, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';
import { LineSource, RenderOptions, renderLines } from 'vs/editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration, IValidEditOperation, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { InlineDecoration, InlineDecorationType } from 'vs/editor/common/viewModel';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Progress } from 'vs/platform/progress/common/progress';
import { SaveReason } from 'vs/workbench/common/editor';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { HunkInformation, Session, HunkState } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { InlineChatZoneWidget } from './inlineChatZoneWidget';
import { CTX_INLINE_CHAT_CHANGE_HAS_DIFF, CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF, CTX_INLINE_CHAT_DOCUMENT_CHANGED, InlineChatConfigKeys, MENU_INLINE_CHAT_ZONE, minimapInlineChatDiffInserted, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { assertType } from 'vs/base/common/types';
import { IModelService } from 'vs/editor/common/services/model';
import { performAsyncTextEdit, asProgressiveEdit } from './utils';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { Schemas } from 'vs/base/common/network';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DefaultChatTextEditor } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { isEqual } from 'vs/base/common/resources';
import { generateUuid } from 'vs/base/common/uuid';
import { MenuWorkbenchButtonBar } from 'vs/platform/actions/browser/buttonbar';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Iterable } from 'vs/base/common/iterator';

export interface IEditObserver {
	start(): void;
	stop(): void;
}

export const enum HunkAction {
	Accept,
	Discard,
	MoveNext,
	MovePrev,
	ToggleDiff
}

export abstract class EditModeStrategy {

	protected static _decoBlock = ModelDecorationOptions.register({
		description: 'inline-chat',
		showIfCollapsed: false,
		isWholeLine: true,
	});

	protected readonly _store = new DisposableStore();
	protected readonly _onDidAccept = this._store.add(new Emitter<void>());
	protected readonly _onDidDiscard = this._store.add(new Emitter<void>());


	readonly onDidAccept: Event<void> = this._onDidAccept.event;
	readonly onDidDiscard: Event<void> = this._onDidDiscard.event;

	constructor(
		protected readonly _session: Session,
		protected readonly _editor: ICodeEditor,
		protected readonly _zone: InlineChatZoneWidget,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) { }

	dispose(): void {
		this._store.dispose();
	}

	performHunkAction(_hunk: HunkInformation | undefined, action: HunkAction) {
		if (action === HunkAction.Accept) {
			this._onDidAccept.fire();
		} else if (action === HunkAction.Discard) {
			this._onDidDiscard.fire();
		}
	}

	protected async _doApplyChanges(ignoreLocal: boolean): Promise<void> {

		const untitledModels: IUntitledTextEditorModel[] = [];

		const editor = this._instaService.createInstance(DefaultChatTextEditor);


		for (const request of this._session.chatModel.getRequests()) {

			if (!request.response?.response) {
				continue;
			}

			for (const item of request.response.response.value) {
				if (item.kind !== 'textEditGroup') {
					continue;
				}
				if (ignoreLocal && isEqual(item.uri, this._session.textModelN.uri)) {
					continue;
				}

				await editor.apply(request.response, item, undefined);

				if (item.uri.scheme === Schemas.untitled) {
					const untitled = this._textFileService.untitled.get(item.uri);
					if (untitled) {
						untitledModels.push(untitled);
					}
				}
			}
		}

		for (const untitledModel of untitledModels) {
			if (!untitledModel.isDisposed()) {
				await untitledModel.resolve();
				await untitledModel.save({ reason: SaveReason.EXPLICIT });
			}
		}
	}

	abstract apply(): Promise<void>;

	cancel() {
		return this._session.hunkData.discardAll();
	}



	abstract makeProgressiveChanges(edits: ISingleEditOperation[], obs: IEditObserver, timings: ProgressingEditsOptions, undoStopBefore: boolean): Promise<void>;

	abstract makeChanges(edits: ISingleEditOperation[], obs: IEditObserver, undoStopBefore: boolean): Promise<void>;

	abstract renderChanges(): Promise<Position | undefined>;

	abstract hasFocus(): boolean;

	getWholeRangeDecoration(): IModelDeltaDecoration[] {
		const ranges = [this._session.wholeRange.value];
		const newDecorations = ranges.map(range => range.isEmpty() ? undefined : ({ range, options: EditModeStrategy._decoBlock }));
		coalesceInPlace(newDecorations);
		return newDecorations;
	}
}

export class PreviewStrategy extends EditModeStrategy {

	private readonly _ctxDocumentChanged: IContextKey<boolean>;

	constructor(
		session: Session,
		editor: ICodeEditor,
		zone: InlineChatZoneWidget,
		@IModelService modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instaService: IInstantiationService
	) {
		super(session, editor, zone, textFileService, instaService);

		this._ctxDocumentChanged = CTX_INLINE_CHAT_DOCUMENT_CHANGED.bindTo(contextKeyService);

		const baseModel = modelService.getModel(session.targetUri)!;
		Event.debounce(baseModel.onDidChangeContent.bind(baseModel), () => { }, 350)(_ => {
			if (!baseModel.isDisposed() && !session.textModel0.isDisposed()) {
				this._ctxDocumentChanged.set(session.hasChangedText);
			}
		}, undefined, this._store);
	}

	override dispose(): void {
		this._ctxDocumentChanged.reset();
		super.dispose();
	}

	override async apply() {
		await super._doApplyChanges(false);
	}

	override async makeChanges(): Promise<void> {
	}

	override async makeProgressiveChanges(): Promise<void> {
	}

	override async renderChanges(): Promise<undefined> { }

	hasFocus(): boolean {
		return this._zone.widget.hasFocus();
	}
}


export interface ProgressingEditsOptions {
	duration: number;
	token: CancellationToken;
}



type HunkDisplayData = {

	decorationIds: string[];

	viewZoneId: string | undefined;
	viewZone: IViewZone;

	distance: number;
	position: Position;
	acceptHunk: () => void;
	discardHunk: () => void;
	toggleDiff?: () => any;
	remove(): void;
	move: (next: boolean) => void;

	hunk: HunkInformation;
};


export class LiveStrategy extends EditModeStrategy {

	private readonly _decoInsertedText = ModelDecorationOptions.register({
		description: 'inline-modified-line',
		className: 'inline-chat-inserted-range-linehighlight',
		isWholeLine: true,
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(overviewRulerInlineChatDiffInserted),
		},
		minimap: {
			position: MinimapPosition.Inline,
			color: themeColorFromId(minimapInlineChatDiffInserted),
		}
	});

	private readonly _decoInsertedTextRange = ModelDecorationOptions.register({
		description: 'inline-chat-inserted-range-linehighlight',
		className: 'inline-chat-inserted-range',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	private readonly _ctxCurrentChangeHasDiff: IContextKey<boolean>;
	private readonly _ctxCurrentChangeShowsDiff: IContextKey<boolean>;

	private readonly _progressiveEditingDecorations: IEditorDecorationsCollection;
	private _editCount: number = 0;

	constructor(
		session: Session,
		editor: ICodeEditor,
		zone: InlineChatZoneWidget,
		private readonly _showOverlayToolbar: boolean,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@ITextFileService textFileService: ITextFileService,
		@IInstantiationService instaService: IInstantiationService
	) {
		super(session, editor, zone, textFileService, instaService);
		this._ctxCurrentChangeHasDiff = CTX_INLINE_CHAT_CHANGE_HAS_DIFF.bindTo(contextKeyService);
		this._ctxCurrentChangeShowsDiff = CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF.bindTo(contextKeyService);

		this._progressiveEditingDecorations = this._editor.createDecorationsCollection();

	}

	override dispose(): void {
		this._resetDiff();
		super.dispose();
	}

	private _resetDiff(): void {
		this._ctxCurrentChangeHasDiff.reset();
		this._ctxCurrentChangeShowsDiff.reset();
		this._zone.widget.updateStatus('');
		this._progressiveEditingDecorations.clear();


		for (const data of this._hunkDisplayData.values()) {
			data.remove();
		}
	}

	override async apply() {
		this._resetDiff();
		if (this._editCount > 0) {
			this._editor.pushUndoStop();
		}
		await super._doApplyChanges(true);
	}

	override cancel() {
		this._resetDiff();
		return super.cancel();
	}

	override async makeChanges(edits: ISingleEditOperation[], obs: IEditObserver, undoStopBefore: boolean): Promise<void> {
		return this._makeChanges(edits, obs, undefined, undefined, undoStopBefore);
	}

	override async makeProgressiveChanges(edits: ISingleEditOperation[], obs: IEditObserver, opts: ProgressingEditsOptions, undoStopBefore: boolean): Promise<void> {

		// add decorations once per line that got edited
		const progress = new Progress<IValidEditOperation[]>(edits => {

			const newLines = new Set<number>();
			for (const edit of edits) {
				LineRange.fromRange(edit.range).forEach(line => newLines.add(line));
			}
			const existingRanges = this._progressiveEditingDecorations.getRanges().map(LineRange.fromRange);
			for (const existingRange of existingRanges) {
				existingRange.forEach(line => newLines.delete(line));
			}
			const newDecorations: IModelDeltaDecoration[] = [];
			for (const line of newLines) {
				newDecorations.push({ range: new Range(line, 1, line, Number.MAX_VALUE), options: this._decoInsertedText });
			}

			this._progressiveEditingDecorations.append(newDecorations);
		});
		return this._makeChanges(edits, obs, opts, progress, undoStopBefore);
	}

	private async _makeChanges(edits: ISingleEditOperation[], obs: IEditObserver, opts: ProgressingEditsOptions | undefined, progress: Progress<IValidEditOperation[]> | undefined, undoStopBefore: boolean): Promise<void> {

		// push undo stop before first edit
		if (undoStopBefore) {
			this._editor.pushUndoStop();
		}

		this._editCount++;

		if (opts) {
			// ASYNC
			const durationInSec = opts.duration / 1000;
			for (const edit of edits) {
				const wordCount = countWords(edit.text ?? '');
				const speed = wordCount / durationInSec;
				// console.log({ durationInSec, wordCount, speed: wordCount / durationInSec });
				const asyncEdit = asProgressiveEdit(new WindowIntervalTimer(this._zone.domNode), edit, speed, opts.token);
				await performAsyncTextEdit(this._session.textModelN, asyncEdit, progress, obs);
			}

		} else {
			// SYNC
			obs.start();
			this._session.textModelN.pushEditOperations(null, edits, (undoEdits) => {
				progress?.report(undoEdits);
				return null;
			});
			obs.stop();
		}
	}

	override performHunkAction(hunk: HunkInformation | undefined, action: HunkAction) {
		const displayData = this._findDisplayData(hunk);

		if (!displayData) {
			// no hunks (left or not yet) found, make sure to
			// finish the sessions
			if (action === HunkAction.Accept) {
				this._onDidAccept.fire();
			} else if (action === HunkAction.Discard) {
				this._onDidDiscard.fire();
			}
			return;
		}

		if (action === HunkAction.Accept) {
			displayData.acceptHunk();
		} else if (action === HunkAction.Discard) {
			displayData.discardHunk();
		} else if (action === HunkAction.MoveNext) {
			displayData.move(true);
		} else if (action === HunkAction.MovePrev) {
			displayData.move(false);
		} else if (action === HunkAction.ToggleDiff) {
			displayData.toggleDiff?.();
		}
	}

	private _findDisplayData(hunkInfo?: HunkInformation) {
		let result: HunkDisplayData | undefined;
		if (hunkInfo) {
			// use context hunk (from tool/buttonbar)
			result = this._hunkDisplayData.get(hunkInfo);
		}

		if (!result && this._zone.position) {
			// find nearest from zone position
			const zoneLine = this._zone.position.lineNumber;
			let distance: number = Number.MAX_SAFE_INTEGER;
			for (const candidate of this._hunkDisplayData.values()) {
				if (candidate.hunk.getState() !== HunkState.Pending) {
					continue;
				}
				const hunkRanges = candidate.hunk.getRangesN();
				const myDistance = zoneLine <= hunkRanges[0].startLineNumber
					? hunkRanges[0].startLineNumber - zoneLine
					: zoneLine - hunkRanges[0].endLineNumber;

				if (myDistance < distance) {
					distance = myDistance;
					result = candidate;
				}
			}
		}

		if (!result) {
			// fallback: first hunk that is pending
			result = Iterable.first(Iterable.filter(this._hunkDisplayData.values(), candidate => candidate.hunk.getState() === HunkState.Pending));
		}
		return result;
	}

	private readonly _hunkDisplayData = new Map<HunkInformation, HunkDisplayData>();

	override async renderChanges() {

		this._progressiveEditingDecorations.clear();

		const renderHunks = () => {

			let widgetData: HunkDisplayData | undefined;

			changeDecorationsAndViewZones(this._editor, (decorationsAccessor, viewZoneAccessor) => {

				const keysNow = new Set(this._hunkDisplayData.keys());
				widgetData = undefined;

				for (const hunkData of this._session.hunkData.getInfo()) {

					keysNow.delete(hunkData);

					const hunkRanges = hunkData.getRangesN();
					let data = this._hunkDisplayData.get(hunkData);
					if (!data) {
						// first time -> create decoration
						const decorationIds: string[] = [];
						for (let i = 0; i < hunkRanges.length; i++) {
							decorationIds.push(decorationsAccessor.addDecoration(hunkRanges[i], i === 0
								? this._decoInsertedText
								: this._decoInsertedTextRange)
							);
						}

						const acceptHunk = () => {
							hunkData.acceptChanges();
							renderHunks();
						};

						const discardHunk = () => {
							hunkData.discardChanges();
							renderHunks();
						};

						// original view zone
						const mightContainNonBasicASCII = this._session.textModel0.mightContainNonBasicASCII();
						const mightContainRTL = this._session.textModel0.mightContainRTL();
						const renderOptions = RenderOptions.fromEditor(this._editor);
						const originalRange = hunkData.getRanges0()[0];
						const source = new LineSource(
							LineRange.fromRangeInclusive(originalRange).mapToLineArray(l => this._session.textModel0.tokenization.getLineTokens(l)),
							[],
							mightContainNonBasicASCII,
							mightContainRTL,
						);
						const domNode = document.createElement('div');
						domNode.className = 'inline-chat-original-zone2';
						const result = renderLines(source, renderOptions, [new InlineDecoration(new Range(originalRange.startLineNumber, 1, originalRange.startLineNumber, 1), '', InlineDecorationType.Regular)], domNode);
						const viewZoneData: IViewZone = {
							afterLineNumber: -1,
							heightInLines: result.heightInLines,
							domNode,
							ordinal: 50000 + 1 // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
						};

						const toggleDiff = () => {
							const scrollState = StableEditorScrollState.capture(this._editor);
							changeDecorationsAndViewZones(this._editor, (_decorationsAccessor, viewZoneAccessor) => {
								assertType(data);
								if (!data.viewZoneId) {
									const [hunkRange] = hunkData.getRangesN();
									viewZoneData.afterLineNumber = hunkRange.startLineNumber - 1;
									data.viewZoneId = viewZoneAccessor.addZone(viewZoneData);
									overlay?.updateExtraTop(result.heightInLines);
								} else {
									viewZoneAccessor.removeZone(data.viewZoneId!);
									overlay?.updateExtraTop(0);
									data.viewZoneId = undefined;
								}
							});
							this._ctxCurrentChangeShowsDiff.set(typeof data?.viewZoneId === 'string');
							scrollState.restore(this._editor);
						};

						const overlay = this._showOverlayToolbar
							? this._instaService.createInstance(InlineChangeOverlay, this._editor, hunkData)
							: undefined;

						const remove = () => {
							changeDecorationsAndViewZones(this._editor, (decorationsAccessor, viewZoneAccessor) => {
								assertType(data);
								for (const decorationId of data.decorationIds) {
									decorationsAccessor.removeDecoration(decorationId);
								}
								if (data.viewZoneId) {
									viewZoneAccessor.removeZone(data.viewZoneId);
								}
								data.decorationIds = [];
								data.viewZoneId = undefined;
							});

							overlay?.dispose();
						};

						const move = (next: boolean) => {
							const keys = Array.from(this._hunkDisplayData.keys());
							const idx = keys.indexOf(hunkData);
							const nextIdx = (idx + (next ? 1 : -1) + keys.length) % keys.length;
							if (nextIdx !== idx) {
								const nextData = this._hunkDisplayData.get(keys[nextIdx])!;
								this._zone.updatePositionAndHeight(nextData?.position);
								renderHunks();
							}
						};

						const zoneLineNumber = this._zone.position?.lineNumber ?? this._editor.getPosition()!.lineNumber;
						const myDistance = zoneLineNumber <= hunkRanges[0].startLineNumber
							? hunkRanges[0].startLineNumber - zoneLineNumber
							: zoneLineNumber - hunkRanges[0].endLineNumber;

						data = {
							hunk: hunkData,
							decorationIds,
							viewZoneId: '',
							viewZone: viewZoneData,
							distance: myDistance,
							position: hunkRanges[0].getStartPosition().delta(-1),
							acceptHunk,
							discardHunk,
							toggleDiff: !hunkData.isInsertion() ? toggleDiff : undefined,
							remove,
							move,
						};

						this._hunkDisplayData.set(hunkData, data);

					} else if (hunkData.getState() !== HunkState.Pending) {
						data.remove();

					} else {
						// update distance and position based on modifiedRange-decoration
						const zoneLineNumber = this._zone.position?.lineNumber ?? this._editor.getPosition()!.lineNumber;
						const modifiedRangeNow = hunkRanges[0];
						data.position = modifiedRangeNow.getStartPosition().delta(-1);
						data.distance = zoneLineNumber <= modifiedRangeNow.startLineNumber
							? modifiedRangeNow.startLineNumber - zoneLineNumber
							: zoneLineNumber - modifiedRangeNow.endLineNumber;
					}

					if (hunkData.getState() === HunkState.Pending && (!widgetData || data.distance < widgetData.distance)) {
						widgetData = data;
					}
				}

				for (const key of keysNow) {
					const data = this._hunkDisplayData.get(key);
					if (data) {
						this._hunkDisplayData.delete(key);
						data.remove();
					}
				}
			});

			if (widgetData) {
				this._zone.updatePositionAndHeight(widgetData.position);


				const mode = this._configService.getValue<'on' | 'off' | 'auto'>(InlineChatConfigKeys.AccessibleDiffView);
				if (mode === 'on' || mode === 'auto' && this._accessibilityService.isScreenReaderOptimized()) {
					this._zone.widget.showAccessibleHunk(this._session, widgetData.hunk);
				}

				this._ctxCurrentChangeHasDiff.set(Boolean(widgetData.toggleDiff));

			} else if (this._hunkDisplayData.size > 0) {
				// everything accepted or rejected
				let oneAccepted = false;
				for (const hunkData of this._session.hunkData.getInfo()) {
					if (hunkData.getState() === HunkState.Accepted) {
						oneAccepted = true;
						break;
					}
				}
				if (oneAccepted) {
					this._onDidAccept.fire();
				} else {
					this._onDidDiscard.fire();
				}
			}

			return widgetData;
		};

		return renderHunks()?.position;
	}

	hasFocus(): boolean {
		return this._zone.widget.hasFocus();
	}

	override getWholeRangeDecoration(): IModelDeltaDecoration[] {
		// don't render the blue in live mode
		return [];
	}
}

function changeDecorationsAndViewZones(editor: ICodeEditor, callback: (accessor: IModelDecorationsChangeAccessor, viewZoneAccessor: IViewZoneChangeAccessor) => void): void {
	editor.changeDecorations(decorationsAccessor => {
		editor.changeViewZones(viewZoneAccessor => {
			callback(decorationsAccessor, viewZoneAccessor);
		});
	});
}


class InlineChangeOverlay implements IOverlayWidget {

	readonly allowEditorOverflow: boolean = false;

	private readonly _id: string = `inline-chat-diff-overlay-` + generateUuid();
	private readonly _domNode: HTMLElement = document.createElement('div');
	private readonly _store: DisposableStore = new DisposableStore();

	private _extraTopLines: number = 0;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hunkInfo: HunkInformation,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {

		this._domNode.classList.add('inline-chat-diff-overlay');

		if (_hunkInfo.getState() === HunkState.Pending) {

			const menuBar = this._store.add(this._instaService.createInstance(MenuWorkbenchButtonBar, this._domNode, MENU_INLINE_CHAT_ZONE, {
				menuOptions: { arg: _hunkInfo },
				telemetrySource: 'inlineChat-changesZone',
				buttonConfigProvider: (_action, idx) => {
					return {
						isSecondary: idx > 0,
						showIcon: true,
						showLabel: false
					};
				},
			}));

			this._store.add(menuBar.onDidChange(() => this._editor.layoutOverlayWidget(this)));
		}

		this._editor.addOverlayWidget(this);
		this._store.add(Event.any(this._editor.onDidLayoutChange, this._editor.onDidScrollChange)(() => this._editor.layoutOverlayWidget(this)));
		queueMicrotask(() => this._editor.layoutOverlayWidget(this)); // FUNKY but needed to get the initial layout right
	}

	dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._store.dispose();
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {

		const line = this._hunkInfo.getRangesN()[0].startLineNumber;
		const info = this._editor.getLayoutInfo();
		const top = this._editor.getTopForLineNumber(line) - this._editor.getScrollTop();
		const left = info.contentLeft + info.contentWidth - info.verticalScrollbarWidth;

		const extraTop = this._editor.getOption(EditorOption.lineHeight) * this._extraTopLines;
		const width = getTotalWidth(this._domNode);

		return { preference: { top: top - extraTop, left: left - width } };
	}

	updateExtraTop(value: number) {
		if (this._extraTopLines !== value) {
			this._extraTopLines = value;
			this._editor.layoutOverlayWidget(this);
		}
	}
}
