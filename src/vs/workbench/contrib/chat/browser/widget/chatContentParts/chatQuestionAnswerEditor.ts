/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatQuestionAnswerEditor.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../../../base/browser/fonts.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { IEditorConstructionOptions } from '../../../../../../editor/browser/config/editorConfiguration.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { PlaceholderTextContribution } from '../../../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { Context as SuggestContext } from '../../../../../../editor/contrib/suggest/browser/suggest.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../../../codeEditor/browser/simpleEditorOptions.js';

/**
 * URI scheme of the text models backing {@link ChatQuestionAnswerEditor}s.
 */
export const CHAT_QUESTION_ANSWER_SCHEME = 'chatQuestionAnswer';

const DEFAULT_MAX_HEIGHT = 200;
const FONT_SIZE = 13;
const LINE_HEIGHT = 20;

/**
 * Returns the chat session resource a {@link ChatQuestionAnswerEditor} model was created for,
 * or `undefined` if the model has no associated session.
 */
export function getChatQuestionAnswerSessionResource(uri: URI): URI | undefined {
	if (uri.scheme !== CHAT_QUESTION_ANSWER_SCHEME || !uri.query) {
		return undefined;
	}
	try {
		return URI.parse(uri.query);
	} catch {
		return undefined;
	}
}

export interface IChatQuestionAnswerEditorOptions {
	readonly placeholder: string;
	/**
	 * Placeholder shown while the editor is idle, i.e. unfocused and empty. Opts the editor into an idle style
	 * (see the `ghost` class on {@link ChatQuestionAnswerEditor.domNode}) until it gains focus or content.
	 */
	readonly idlePlaceholder?: string;
	readonly ariaLabel: string;
	readonly initialValue?: string;
	/** Chat session the answer belongs to. Used to route completions to the session's agent host. */
	readonly sessionResource?: URI;
	/** Maximum height in pixels before the editor scrolls. Defaults to 200. */
	readonly maxHeight?: number;
	/** Node that hosts the editor's overflow widgets (e.g. suggest) so they aren't clipped by the container. */
	readonly overflowWidgetsDomNode?: HTMLElement;
}

/**
 * A small auto-growing Monaco editor used for free-text answers in the chat question carousel.
 * Enter fires {@link onDidPressEnter}; Shift+Enter inserts a newline.
 */
export class ChatQuestionAnswerEditor extends Disposable {

	private readonly _onDidChangeValue = this._register(new Emitter<string>());
	readonly onDidChangeValue: Event<string> = this._onDidChangeValue.event;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _onDidPressEnter = this._register(new Emitter<void>());
	readonly onDidPressEnter: Event<void> = this._onDidPressEnter.event;

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;

	/** Root element carrying the input-box styling. */
	readonly domNode: HTMLElement;

	private readonly _editorElement: HTMLElement;
	private readonly _editor: CodeEditorWidget;
	private readonly _model: ITextModel;
	private readonly _maxHeight: number;
	private readonly _placeholder: string;
	private readonly _idlePlaceholder: string | undefined;

	private _width = 0;
	private _height = 0;
	/** Cached so the value stays readable even if the model is disposed first during teardown. */
	private _value: string;

	get editor(): CodeEditorWidget {
		return this._editor;
	}

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		if (value !== this._value) {
			this._model.setValue(value);
		}
	}

	/** Current height of the editor area in pixels. */
	get height(): number {
		return this._height;
	}

	constructor(
		container: HTMLElement,
		options: IChatQuestionAnswerEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this._maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
		this._placeholder = options.placeholder;
		this._idlePlaceholder = options.idlePlaceholder;

		this.domNode = dom.append(container, dom.$('.chat-question-answer-editor'));
		this._editorElement = dom.append(this.domNode, dom.$('.chat-question-answer-editor-input'));

		const uri = URI.from({
			scheme: CHAT_QUESTION_ANSWER_SCHEME,
			path: generateUuid(),
			query: options.sessionResource ? options.sessionResource.toString() : undefined
		});
		this._value = options.initialValue ?? '';
		this._model = modelService.createModel(this._value, null, uri, true);

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(configurationService),
			ariaLabel: options.ariaLabel,
			placeholder: options.idlePlaceholder !== undefined && !options.initialValue ? options.idlePlaceholder : options.placeholder,
			wordWrap: 'on',
			wrappingStrategy: 'advanced',
			overflowWidgetsDomNode: options.overflowWidgetsDomNode,
			lineNumbers: 'off',
			padding: { top: 4, bottom: 4 },
			scrollbar: { vertical: 'auto', horizontal: 'hidden', alwaysConsumeMouseWheel: false },
			fontFamily: DEFAULT_FONT_FAMILY,
			fontSize: FONT_SIZE,
			lineHeight: LINE_HEIGHT,
			quickSuggestions: false,
			suggest: {
				showIcons: true,
				showSnippets: false,
				showStatusBar: false,
				insertMode: 'insert',
			},
			stickyScroll: { enabled: false },
			bracketPairColorization: { enabled: false },
		};
		const widgetOptions = getSimpleCodeEditorWidgetOptions();
		widgetOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([PlaceholderTextContribution.ID]));

		this._editor = this._register(instantiationService.createInstance(CodeEditorWidget, this._editorElement, editorOptions, widgetOptions));
		this._editor.setModel(this._model);
		// Registered after the editor so the editor detaches before the model is disposed.
		this._register(this._model);

		this._register(this._model.onDidChangeContent(() => {
			this._value = this._model.getValue();
			this._updateIdle();
			this._onDidChangeValue.fire(this._value);
		}));

		this._register(this._editor.onDidFocusEditorText(() => {
			this._updateIdle();
			this._onDidFocus.fire();
		}));
		this._register(this._editor.onDidBlurEditorText(() => {
			this._updateIdle();
			this._onDidBlur.fire();
		}));
		this._updateIdle();

		this._register(this._editor.onKeyDown(e => {
			if (e.keyCode !== KeyCode.Enter || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
				return;
			}
			if (this.isSuggestWidgetVisible()) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			this._onDidPressEnter.fire();
		}));

		this._register(this._editor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this._layout();
			}
		}));

		// Layout changes the observed element's height, so defer it out of the observer callback to avoid a resize loop.
		const scheduledLayout = this._register(new MutableDisposable());
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatQuestionAnswerEditor', entries => {
			const width = Math.floor(entries[0]?.contentRect.width ?? 0);
			if (width !== this._width) {
				this._width = width;
				scheduledLayout.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => this._layout());
			}
		}, dom.getWindow(container)));
		this._register(resizeObserver.observe(this._editorElement));

		this._width = Math.floor(this._editorElement.clientWidth);
		this._layout();
	}

	focus(): void {
		this._editor.focus();
	}

	/** Whether the editor's text area has focus. */
	hasFocus(): boolean {
		return this._editor.hasTextFocus();
	}

	/** Whether the editor's suggest widget is currently showing. */
	isSuggestWidgetVisible(): boolean {
		return !!SuggestContext.Visible.getValue(this._editor.contextKeyService);
	}

	/** Toggles the ghost style and idle placeholder while the editor is unfocused and empty. */
	private _updateIdle(): void {
		if (this._idlePlaceholder === undefined) {
			return;
		}
		const idle = !this._value && !this._editor.hasTextFocus();
		if (idle === this.domNode.classList.contains('ghost')) {
			return;
		}
		this.domNode.classList.toggle('ghost', idle);
		this._editor.updateOptions({ placeholder: idle ? this._idlePlaceholder : this._placeholder });
	}

	private _layout(): void {
		// Laying out at a new width fires `onDidContentSizeChange` when the wrapped height changes, which lays out again.
		const height = Math.min(this._editor.getContentHeight(), this._maxHeight);
		this._editorElement.style.height = `${height}px`;
		this._editor.layout({ width: this._width, height });
		if (height !== this._height) {
			this._height = height;
			this._onDidChangeHeight.fire();
		}
	}
}
