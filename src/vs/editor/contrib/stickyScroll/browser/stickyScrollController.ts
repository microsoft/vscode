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
import { StickyLineCandidateProvider, StickyRange } from './stickyScrollProvider';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { MenuId } from 'vs/platform/actions/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

export class StickyScrollController extends Disposable implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';

	private readonly _stickyScrollWidget: StickyScrollWidget;
	private readonly _stickyLineCandidateProvider: StickyLineCandidateProvider;
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _widgetState: StickyScrollWidgetState;
	private _maxStickyLines: number = Number.MAX_SAFE_INTEGER;

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
	}

	get stickyScrollCandidateProvider() {
		return this._stickyLineCandidateProvider;
	}

	get stickyScrollWidgetState() {
		return this._widgetState;
	}

	public static get(editor: ICodeEditor): StickyScrollController | null {
		return editor.getContribution<StickyScrollController>(StickyScrollController.ID);
	}

	public focus(): void {
		const stickyScrollFocusedContextKey = EditorContextKeys.stickyScrollFocused;
		const focusState = stickyScrollFocusedContextKey.getValue(this._contextKeyService);
		const rootNode = this._stickyScrollWidget.getDomNode();
		const childrenElements = rootNode.children;
		const numberChildren = childrenElements.length;

		if (focusState === true || numberChildren === 0) {
			// Already focused so return
			// Or no line to focus on
			return;
		}

		stickyScrollFocusedContextKey.bindTo(this._contextKeyService).set(true);
		let currentFousedChild = rootNode.lastElementChild!;
		currentFousedChild.classList.add('focus');
		let currentIndex = numberChildren - 1;

		// TODO: Why is sometimes the keyboard event fired twice?
		const onKeyboardNavigation = this._editor.onKeyUp(keyboardEvent => {

			const keyCode = keyboardEvent.keyCode;
			if (keyCode === KeyCode.UpArrow && currentIndex > 0 || keyCode === KeyCode.DownArrow && currentIndex < numberChildren - 1) {
				currentFousedChild?.classList.remove('focus');
				currentIndex = keyCode === KeyCode.UpArrow ? currentIndex - 1 : currentIndex + 1;
				currentFousedChild = childrenElements.item(currentIndex)!;
				currentFousedChild.classList.add('focus');
			}

			// TODO: Using the left arrow because when using enter, on focus sticky scroll, the enter is directly detected and the last sticky line is revealed
			// TODO: Is there a way to prevent this?
			else if (keyCode === KeyCode.LeftArrow) {
				const lineNumbers = this._stickyScrollWidget.lineNumbers;
				this._editor.revealPosition({ lineNumber: lineNumbers[currentIndex], column: 1 });
				disposeFocusOnStickyScroll();
			}
		});

		// When scrolling remove focus
		const onScroll = this._editor.onDidScrollChange(() => {
			disposeFocusOnStickyScroll();
		});
		// When clicking anywere remove focus
		const onMouseUp = this._editor.onMouseUp(() => {
			disposeFocusOnStickyScroll();
		});
		// Whenver the mouse hovers on the sticky scroll remove the keyboard focus
		const onStickyScrollWidgetHover = this._stickyScrollWidget.onHover(() => {
			console.log('On hover');
			disposeFocusOnStickyScroll();
		});

		this._register(onKeyboardNavigation);
		this._register(onScroll);
		this._register(onMouseUp);
		this._register(onStickyScrollWidgetHover);

		const disposeFocusOnStickyScroll = () => {
			currentFousedChild.classList.remove('focus');
			stickyScrollFocusedContextKey.bindTo(this._contextKeyService).set(false);
			onKeyboardNavigation.dispose();
			onScroll.dispose();
			onMouseUp.dispose();
			onStickyScrollWidgetHover.dispose();
		};
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
			this._widgetState = this.getScrollWidgetState();
			this._stickyScrollWidget.setState(this._widgetState);
		}
	}

	getScrollWidgetState(): StickyScrollWidgetState {
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
