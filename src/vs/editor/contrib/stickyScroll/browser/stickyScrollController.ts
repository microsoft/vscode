/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget';
import { IStickyLineCandidateProvider, StickyLineCandidateProvider, StickyRange } from './stickyScrollProvider';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

export interface IStickyScrollController {
	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider;
	get stickyScrollWidgetState(): StickyScrollWidgetState;
	focus(): void;
	focusNext(): void;
	focusPrevious(): void;
	goToFocused(): void;
	cancelFocus(): void;
	findScrollWidgetState(): StickyScrollWidgetState;
	dispose(): void;
}

export class StickyScrollController extends Disposable implements IEditorContribution, IStickyScrollController {

	static readonly ID = 'store.contrib.stickyScrollController';

	private readonly _stickyScrollWidget: StickyScrollWidget;
	private readonly _stickyLineCandidateProvider: IStickyLineCandidateProvider;
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _widgetState: StickyScrollWidgetState;
	private _maxStickyLines: number = Number.MAX_SAFE_INTEGER;

	private _focusDisposableStore: DisposableStore | undefined;
	private _focusedStickyElement: HTMLDivElement | undefined;
	private _focusedStickyElementIndex: number | undefined;
	private _stickyElements: HTMLCollection | undefined;
	private _numberStickyElements: number | undefined;
	private _stickyScrollFocusedContextKey: IContextKey<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService instaService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._stickyScrollWidget = new StickyScrollWidget(this._editor, languageFeaturesService, instaService);
		this._stickyLineCandidateProvider = new StickyLineCandidateProvider(this._editor, languageFeaturesService);
		this._stickyScrollFocusedContextKey = EditorContextKeys.stickyScrollFocused.bindTo(this._contextKeyService);
		this._widgetState = new StickyScrollWidgetState([], 0);

		this._register(this._stickyScrollWidget);
		this._register(this._stickyLineCandidateProvider);
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this._readConfiguration();
			}
		}));
		this._readConfiguration();
		this._register(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.CONTEXT_MENU, async (event: MouseEvent) => {
			this._onContextMenu(event);
		}));

		const focusTracker = this._register(dom.trackFocus(this._stickyScrollWidget.getDomNode()));
		this._register(focusTracker.onDidFocus(_ => {
			console.log('on did focus');
		}));
		this._register(focusTracker.onDidBlur(_ => {
			console.log('on did blur');
			this._disposeFocusStickyScrollStore();
		}));
	}

	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider {
		return this._stickyLineCandidateProvider;
	}

	get stickyScrollWidgetState(): StickyScrollWidgetState {
		return this._widgetState;
	}

	public static get(editor: ICodeEditor): IStickyScrollController | null {
		return editor.getContribution<StickyScrollController>(StickyScrollController.ID);
	}

	private _disposeFocusStickyScrollStore() {
		console.log('Entered into the dispose');
		this._focusedStickyElement!.classList.remove('focus');
		this._stickyScrollFocusedContextKey.set(false);
		this._focusDisposableStore!.dispose();
	}

	public focus(): void {
		const focusState = this._stickyScrollFocusedContextKey.get();
		console.log('inside focus ', focusState);
		const rootNode = this._stickyScrollWidget.getDomNode();
		this._stickyElements = rootNode.children;
		this._numberStickyElements = this._stickyElements.length;

		if (focusState === true || this._numberStickyElements === 0) {
			// Already focused so return
			// Or no line to focus on
			return;
		}
		this._focusDisposableStore = new DisposableStore();
		this._stickyScrollFocusedContextKey.set(true);
		this._focusedStickyElement = rootNode.lastElementChild! as HTMLDivElement;
		this._focusedStickyElement.classList.add('focus');
		this._focusedStickyElementIndex = this._numberStickyElements - 1;
		// this._focusedStickyElement.focus();

		rootNode.focus();

		/*
		// When scrolling remove focus
		const onScroll = this._editor.onDidScrollChange(() => {
			this._disposeFocusStickyScrollStore();
		});
		// When clicking anywere remove focus
		const onMouseUp = this._editor.onMouseUp(() => {
			this._disposeFocusStickyScrollStore();
		});
		// Whenever the mouse hovers on the sticky scroll remove the keyboard focus
		const onStickyScrollWidgetHover = this._stickyScrollWidget.onHover(() => {
			this._disposeFocusStickyScrollStore();
		});

		this._focusDisposableStore.add(onScroll);
		this._focusDisposableStore.add(onMouseUp);
		this._focusDisposableStore.add(onStickyScrollWidgetHover);
		*/
	}

	public focusNext(): void {
		if (this._focusedStickyElement && this._focusedStickyElementIndex! < this._numberStickyElements! - 1) {
			this._focusedStickyElement.classList.remove('focus');
			this._focusedStickyElementIndex!++;
			this._focusedStickyElement = this._stickyElements!.item(this._focusedStickyElementIndex!)! as HTMLDivElement;
			this._focusedStickyElement.classList.add('focus');
			// this._focusedStickyElement.focus();
		}
	}

	public focusPrevious(): void {
		if (this._focusedStickyElement && this._focusedStickyElementIndex! > 0) {
			this._focusedStickyElement.classList.remove('focus');
			this._focusedStickyElementIndex!--;
			this._focusedStickyElement = this._stickyElements!.item(this._focusedStickyElementIndex!)! as HTMLDivElement;
			this._focusedStickyElement.classList.add('focus');
			// this._focusedStickyElement.focus();
		}
	}

	public goToFocused(): void {
		const lineNumbers = this._stickyScrollWidget.lineNumbers;
		this._editor.revealPosition({ lineNumber: lineNumbers[this._focusedStickyElementIndex!], column: 1 });
		this._disposeFocusStickyScrollStore();
	}

	public cancelFocus(): void {
		this._disposeFocusStickyScrollStore();
	}

	private _onContextMenu(event: MouseEvent) {
		this._contextMenuService.showContextMenu({
			menuId: MenuId.StickyScrollContext,
			getAnchor: () => event,
		});
	}

	private _readConfiguration() {
		const options = this._editor.getOption(EditorOption.stickyScroll);

		if (options.enabled === false) {
			this._editor.removeOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.clear();
			return;
		} else {
			this._editor.addOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidScrollChange(() => this._renderStickyScroll()));
			this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
			this._sessionStore.add(this._stickyLineCandidateProvider.onDidChangeStickyScroll(() => this._renderStickyScroll()));
			const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
			if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
				this._sessionStore.add(this._editor.onDidChangeCursorPosition(() => this._renderStickyScroll()));
			}
		}
	}

	private _needsUpdate(event: IModelTokensChangedEvent) {
		const stickyLineNumbers = this._stickyScrollWidget.getCurrentLines();
		for (const stickyLineNumber of stickyLineNumbers) {
			for (const range of event.ranges) {
				if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private _onTokensChange(event: IModelTokensChangedEvent) {
		if (this._needsUpdate(event)) {
			this._renderStickyScroll();
		}
	}

	private _onDidResize() {
		const layoutInfo = this._editor.getLayoutInfo();
		const width = layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth;
		this._stickyScrollWidget.getDomNode().style.width = `${width}px`;
		// make sure sticky scroll doesn't take up more than 25% of the editor
		const theoreticalLines = layoutInfo.height / this._editor.getOption(EditorOption.lineHeight);
		this._maxStickyLines = Math.round(theoreticalLines * .25);
	}

	private _renderStickyScroll() {
		if (!(this._editor.hasModel())) {
			return;
		}
		const model = this._editor.getModel();
		const stickyLineVersion = this._stickyLineCandidateProvider.getVersionId();
		if (stickyLineVersion === undefined || stickyLineVersion === model.getVersionId()) {
			this._widgetState = this.findScrollWidgetState();
			this._stickyScrollWidget.setState(this._widgetState);
		}
	}

	findScrollWidgetState(): StickyScrollWidgetState {
		const lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
		const maxNumberStickyLines = Math.min(this._maxStickyLines, this._editor.getOption(EditorOption.stickyScroll).maxLineCount);
		const scrollTop: number = this._editor.getScrollTop();
		let lastLineRelativePosition: number = 0;
		const lineNumbers: number[] = [];
		const arrayVisibleRanges = this._editor.getVisibleRanges();
		if (arrayVisibleRanges.length !== 0) {
			const fullVisibleRange = new StickyRange(arrayVisibleRanges[0].startLineNumber, arrayVisibleRanges[arrayVisibleRanges.length - 1].endLineNumber);
			const candidateRanges = this._stickyLineCandidateProvider.getCandidateStickyLinesIntersecting(fullVisibleRange);
			for (const range of candidateRanges) {
				const start = range.startLineNumber;
				const end = range.endLineNumber;
				const depth = range.nestingDepth;
				if (end - start > 0) {
					const topOfElementAtDepth = (depth - 1) * lineHeight;
					const bottomOfElementAtDepth = depth * lineHeight;

					const bottomOfBeginningLine = this._editor.getBottomForLineNumber(start) - scrollTop;
					const topOfEndLine = this._editor.getTopForLineNumber(end) - scrollTop;
					const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;

					if (topOfElementAtDepth > topOfEndLine && topOfElementAtDepth <= bottomOfEndLine) {
						lineNumbers.push(start);
						lastLineRelativePosition = bottomOfEndLine - bottomOfElementAtDepth;
						break;
					}
					else if (bottomOfElementAtDepth > bottomOfBeginningLine && bottomOfElementAtDepth <= bottomOfEndLine) {
						lineNumbers.push(start);
					}
					if (lineNumbers.length === maxNumberStickyLines) {
						break;
					}
				}
			}
		}
		return new StickyScrollWidgetState(lineNumbers, lastLineRelativePosition);
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}
