/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentInputWidget, CommentsModel, EditorController, EditorModel, EditorView, GutterMarker, OffsetRange, Selection, StringEdit, StringValue, VsCodeV2CommentsView, findNodeOffsetById, taskCheckboxRange } from '@vscode/markdown-editor';
import { Disposable, autorun, observableValue } from '@vscode/markdown-editor/observables';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import '@vscode/markdown-editor/editor.css';
import '@vscode/markdown-editor/themes/vscode-default.css';
import '@vscode/markdown-editor/commentInput.css';
import '@vscode/markdown-editor/vscodeCommentWidgetV2.css';
import './markdownEditor.css';
import { WebviewSyntaxHighlighter } from './syntaxHighlighter';

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/**
 * The editor's view state, persisted as webview state (`getState`/`setState`) so
 * the scroll and cursor position are restored when the webview is reloaded or the
 * custom editor is re-created (e.g. after switching sessions and back).
 */
interface PersistedViewState {
	scrollTop?: number;
	selection?: { anchor: number; active: number };
}

interface PlanReview {
	readonly actions: readonly {
		readonly id: string;
		readonly label: string;
		readonly description?: string;
		readonly default?: boolean;
	}[];
	readonly feedbackCount: number;
	readonly activeFeedbackId?: string;
	readonly activeFeedbackRequestId: number;
	readonly overallFeedbackLabel: string;
	readonly rejectLabel: string;
	readonly submitFeedbackLabel: string;
	readonly submitFeedbackWithCountLabel: string;
	readonly approvePlanLabel: string;
}

function createStringEdit(previousValue: string, nextValue: string): StringEdit {
	let start = 0;
	while (start < previousValue.length && start < nextValue.length && previousValue[start] === nextValue[start]) {
		start++;
	}
	let previousEnd = previousValue.length;
	let nextEnd = nextValue.length;
	while (previousEnd > start && nextEnd > start && previousValue[previousEnd - 1] === nextValue[nextEnd - 1]) {
		previousEnd--;
		nextEnd--;
	}
	return StringEdit.replace(OffsetRange.fromTo(start, previousEnd), nextValue.slice(start, nextEnd));
}

class PlanReviewToolbar extends Disposable {

	readonly #element: HTMLElement;
	readonly #overallFeedback: HTMLInputElement;
	readonly #primaryGroup: HTMLElement;
	readonly #primaryAction: HTMLButtonElement;
	readonly #actionToggle: HTMLButtonElement;
	readonly #actionMenu: HTMLElement;
	readonly #rejectAction: HTMLButtonElement;
	#review: PlanReview | undefined;
	#selectedActionId = '';

	constructor(host: HTMLElement, postMessage: (message: unknown) => void) {
		super();

		this.#element = document.createElement('div');
		this.#element.className = 'md-plan-review-toolbar-host';
		this.#element.style.display = 'none';
		const toolbar = document.createElement('div');
		toolbar.className = 'md-plan-review-toolbar';
		toolbar.setAttribute('role', 'toolbar');
		this.#element.appendChild(toolbar);
		host.appendChild(this.#element);
		this._register({ dispose: () => this.#element.remove() });
		const resizeObserver = new ResizeObserver(entries => {
			const width = entries[0]?.contentRect.width ?? host.clientWidth;
			toolbar.classList.toggle('compact', width < 760);
			toolbar.classList.toggle('narrow', width < 480);
			this.#element.classList.toggle('narrow', width < 480);
		});
		resizeObserver.observe(host);
		this._register({ dispose: () => resizeObserver.disconnect() });

		this.#overallFeedback = document.createElement('input');
		this.#overallFeedback.className = 'md-plan-review-overall-feedback';
		this.#overallFeedback.type = 'text';
		toolbar.appendChild(this.#overallFeedback);

		this.#primaryGroup = document.createElement('div');
		this.#primaryGroup.className = 'md-plan-review-primary-group';
		toolbar.appendChild(this.#primaryGroup);

		this.#primaryAction = document.createElement('button');
		this.#primaryAction.className = 'md-plan-review-primary-action';
		this.#primaryAction.type = 'button';
		this.#primaryGroup.appendChild(this.#primaryAction);

		this.#actionToggle = document.createElement('button');
		this.#actionToggle.className = 'md-plan-review-action-toggle';
		this.#actionToggle.type = 'button';
		this.#actionToggle.setAttribute('aria-haspopup', 'menu');
		this.#actionToggle.setAttribute('aria-expanded', 'false');
		this.#primaryGroup.appendChild(this.#actionToggle);

		this.#actionMenu = document.createElement('div');
		this.#actionMenu.className = 'md-plan-review-action-menu';
		this.#actionMenu.setAttribute('role', 'menu');
		this.#actionMenu.hidden = true;
		this.#primaryGroup.appendChild(this.#actionMenu);

		this.#rejectAction = document.createElement('button');
		this.#rejectAction.className = 'md-plan-review-reject-action';
		this.#rejectAction.type = 'button';
		toolbar.appendChild(this.#rejectAction);

		const updatePrimaryAction = () => this.#updatePrimaryAction();
		this.#overallFeedback.addEventListener('input', updatePrimaryAction);
		this._register({ dispose: () => this.#overallFeedback.removeEventListener('input', updatePrimaryAction) });

		const submitPrimaryAction = () => {
			const review = this.#review;
			if (!review) {
				return;
			}
			const overallFeedback = this.#overallFeedback.value.trim();
			if (review.feedbackCount > 0 || overallFeedback) {
				postMessage({ type: 'submitFeedback', overallFeedback: overallFeedback || undefined });
			} else {
				postMessage({ type: 'submitAction', actionId: this.#selectedActionId });
			}
		};
		this.#primaryAction.addEventListener('click', submitPrimaryAction);
		this._register({ dispose: () => this.#primaryAction.removeEventListener('click', submitPrimaryAction) });

		const toggleMenu = () => this.#setMenuOpen(!!this.#actionMenu.hidden);
		this.#actionToggle.addEventListener('click', toggleMenu);
		this._register({ dispose: () => this.#actionToggle.removeEventListener('click', toggleMenu) });

		const onDocumentPointerDown = (event: PointerEvent) => {
			if (!this.#actionMenu.hidden && !this.#primaryGroup.contains(event.target as Node)) {
				this.#setMenuOpen(false);
			}
		};
		document.addEventListener('pointerdown', onDocumentPointerDown);
		this._register({ dispose: () => document.removeEventListener('pointerdown', onDocumentPointerDown) });

		const onMenuKeyDown = (event: KeyboardEvent) => {
			const items = Array.from(this.#actionMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
			const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
			if (event.key === 'Escape') {
				event.preventDefault();
				this.#setMenuOpen(false);
				this.#actionToggle.focus();
			} else if (event.key === 'Tab') {
				this.#setMenuOpen(false);
			} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const delta = event.key === 'ArrowDown' ? 1 : -1;
				items[(currentIndex + delta + items.length) % items.length]?.focus();
			}
		};
		this.#actionMenu.addEventListener('keydown', onMenuKeyDown);
		this._register({ dispose: () => this.#actionMenu.removeEventListener('keydown', onMenuKeyDown) });
		const onMenuClick = (event: MouseEvent) => {
			const target = event.target as HTMLButtonElement;
			const actionId = target.dataset.actionId;
			if (!actionId) {
				return;
			}
			this.#setMenuOpen(false);
			this.#primaryAction.focus();
			postMessage({ type: 'submitAction', actionId });
		};
		this.#actionMenu.addEventListener('click', onMenuClick);
		this._register({ dispose: () => this.#actionMenu.removeEventListener('click', onMenuClick) });

		const reject = () => postMessage({ type: 'rejectReview' });
		this.#rejectAction.addEventListener('click', reject);
		this._register({ dispose: () => this.#rejectAction.removeEventListener('click', reject) });
	}

	update(review: PlanReview | undefined): void {
		this.#review = review;
		if (!review) {
			this.#element.style.display = 'none';
			this.#overallFeedback.value = '';
			return;
		}

		this.#element.querySelector('[role="toolbar"]')?.setAttribute('aria-label', review.approvePlanLabel);
		this.#overallFeedback.placeholder = review.overallFeedbackLabel;
		this.#overallFeedback.setAttribute('aria-label', review.overallFeedbackLabel);
		this.#actionToggle.setAttribute('aria-label', review.approvePlanLabel);
		this.#rejectAction.textContent = review.rejectLabel;
		this.#selectedActionId = review.actions.find(action => action.default)?.id ?? review.actions[0]?.id ?? '';
		this.#renderActionMenu();
		this.#setMenuOpen(false);
		this.#element.style.display = '';
		this.#updatePrimaryAction();
	}

	#updatePrimaryAction(): void {
		const review = this.#review;
		if (!review) {
			return;
		}
		const hasFeedback = review.feedbackCount > 0 || this.#overallFeedback.value.trim().length > 0;
		const selectedAction = review.actions.find(action => action.id === this.#selectedActionId) ?? review.actions[0];
		const showActionToggle = !hasFeedback && review.actions.length > 1;
		this.#actionToggle.style.display = showActionToggle ? '' : 'none';
		this.#primaryGroup.classList.toggle('has-dropdown', showActionToggle);
		if (!showActionToggle) {
			this.#setMenuOpen(false);
		}
		this.#primaryAction.textContent = hasFeedback
			? review.feedbackCount > 0
				? review.submitFeedbackWithCountLabel.replace('{0}', String(review.feedbackCount))
				: review.submitFeedbackLabel
			: selectedAction?.label ?? review.approvePlanLabel;
		this.#primaryAction.title = hasFeedback ? review.submitFeedbackLabel : selectedAction?.description ?? '';
	}

	#renderActionMenu(): void {
		this.#actionMenu.replaceChildren();
		for (const action of this.#review?.actions ?? []) {
			if (action.id === this.#selectedActionId) {
				continue;
			}
			const item = document.createElement('button');
			item.type = 'button';
			item.setAttribute('role', 'menuitem');
			item.textContent = action.label;
			item.title = action.description ?? '';
			item.dataset.actionId = action.id;
			this.#actionMenu.appendChild(item);
		}
	}

	#setMenuOpen(open: boolean): void {
		this.#actionMenu.hidden = !open;
		this.#actionToggle.setAttribute('aria-expanded', String(open));
		if (open) {
			this.#actionMenu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
		}
	}
}

class EditableCommentModeController extends Disposable {

	readonly #widget: CommentInputWidget;
	readonly #model: EditorModel;
	readonly #view: EditorView;
	#visible = false;
	#anchorX = 0;
	#pinnedRange: OffsetRange | undefined;
	#submittedRange: OffsetRange | undefined;

	constructor(
		model: EditorModel,
		view: EditorView,
		onSubmit: (text: string, range: OffsetRange) => void,
	) {
		super();
		this.#model = model;
		this.#view = view;

		this.#widget = this._register(new CommentInputWidget({
			onDidChangeSize: () => {
				if (this.#visible) {
					this.#layoutHorizontally();
				}
			},
			onSubmit: text => this.#submit(text, onSubmit),
			onCancel: () => this.#hideAndRefocus(),
		}));
		const widgetElement = this.#widget.element;
		widgetElement.style.position = 'absolute';
		widgetElement.style.zIndex = '20';
		widgetElement.style.display = 'none';
		this.#view.overlayContainer.appendChild(widgetElement);
		this._register({ dispose: () => widgetElement.remove() });
		this._register({ dispose: () => this.#view.element.classList.remove('md-comment-active') });

		const resizeObserver = new ResizeObserver(() => {
			if (this.#visible) {
				this.#layoutHorizontally();
			}
		});
		resizeObserver.observe(widgetElement);
		resizeObserver.observe(this.#view.overlayContainer);
		this._register({ dispose: () => resizeObserver.disconnect() });

		const input = this.#widget.inputElement;
		const onFocus = () => this.#view.element.classList.add('md-comment-active');
		input.addEventListener('focus', onFocus);
		this._register({ dispose: () => input.removeEventListener('focus', onFocus) });
		const onBlur = () => {
			this.#view.element.classList.remove('md-comment-active');
			input.ownerDocument.defaultView?.setTimeout(() => this.#autoHide(), 0);
		};
		input.addEventListener('blur', onBlur);
		this._register({ dispose: () => input.removeEventListener('blur', onBlur) });
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && this.#visible && !this.#widgetHasFocus()) {
				event.preventDefault();
				this.#widget.focus();
			}
		};
		this.#view.element.addEventListener('keydown', onKeyDown);
		this._register({ dispose: () => this.#view.element.removeEventListener('keydown', onKeyDown) });

		this._register(autorun(reader => {
			const selection = reader.readObservable(this.#model.selection);
			const caretRect = reader.readObservable(this.#view.caretRect);
			const isSelecting = reader.readObservable(this.#model.isSelecting);
			const hasDraft = reader.readObservable(this.#widget.value).trim().length > 0;
			if (this.#visible && (hasDraft || this.#widgetHasFocus())) {
				return;
			}
			if (isSelecting || !selection || selection.isCollapsed || !caretRect || this.#submittedRange?.equals(selection.range)) {
				this.#autoHide();
				return;
			}
			this.#submittedRange = undefined;
			this.#pinnedRange = selection.range;
			this.#show(caretRect, !selection.isForward);
		}));
	}

	#show(caretRect: { x: number; y: number; height: number }, preferAbove: boolean): void {
		const widgetElement = this.#widget.element;
		widgetElement.style.display = '';
		this.#visible = true;
		const gap = 8;
		const widgetHeight = widgetElement.offsetHeight;
		const overlayTop = this.#view.overlayContainer.getBoundingClientRect().top;
		const viewport = this.#getViewportRect();
		const caretTop = overlayTop + caretRect.y;
		const hasRoomBelow = overlayTop + caretRect.y + caretRect.height + gap + widgetHeight <= viewport.bottom;
		const hasRoomAbove = caretTop - gap - widgetHeight >= viewport.top;
		const showAbove = preferAbove ? hasRoomAbove || !hasRoomBelow : !hasRoomBelow && hasRoomAbove;
		this.#anchorX = caretRect.x;
		this.#layoutHorizontally();
		widgetElement.style.top = `${showAbove ? caretRect.y - gap - widgetHeight : caretRect.y + caretRect.height + gap}px`;
	}

	#layoutHorizontally(): void {
		const widgetElement = this.#widget.element;
		const width = this.#view.overlayContainer.clientWidth;
		const gap = 8;
		widgetElement.style.maxWidth = `${Math.max(0, width - gap)}px`;
		const maxLeft = Math.max(0, width - widgetElement.offsetWidth - gap);
		widgetElement.style.left = `${Math.min(Math.max(0, this.#anchorX), maxLeft)}px`;
	}

	#hide(): void {
		if (this.#visible) {
			this.#visible = false;
			this.#pinnedRange = undefined;
			this.#widget.clear();
			this.#widget.element.style.display = 'none';
			this.#view.element.classList.remove('md-comment-active');
		}
	}

	#autoHide(): void {
		if (!this.#widgetHasFocus() && this.#widget.value.get().trim().length === 0) {
			this.#hide();
		}
	}

	#widgetHasFocus(): boolean {
		const activeElement = this.#view.element.ownerDocument.activeElement;
		return activeElement !== null && this.#widget.element.contains(activeElement);
	}

	#getViewportRect(): { top: number; bottom: number } {
		const targetWindow = this.#view.element.ownerDocument.defaultView;
		let element: HTMLElement | null = this.#view.element;
		while (element) {
			const overflowY = targetWindow?.getComputedStyle(element).overflowY;
			if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight) {
				const rect = element.getBoundingClientRect();
				return { top: rect.top, bottom: rect.bottom };
			}
			element = element.parentElement;
		}
		return { top: 0, bottom: targetWindow?.innerHeight ?? 0 };
	}

	#hideAndRefocus(): void {
		this.#hide();
		this.#view.focus();
	}

	#submit(text: string, onSubmit: (text: string, range: OffsetRange) => void): void {
		const range = this.#pinnedRange;
		this.#submittedRange = range;
		this.#hideAndRefocus();
		if (range) {
			onSubmit(text, range);
		}
	}
}

class Editor extends Disposable {
	readonly model = new EditorModel();
	isUpdatingFromExtension = false;
	#isUpdatingComments = false;
	#mermaidCounter = 0;
	#initialized = false;
	#view: EditorView | undefined;
	#host: HTMLElement | undefined;
	#commentRanges = new Map<string, OffsetRange>();
	#activeFeedbackId: string | undefined;
	#activeFeedbackRequestId = 0;
	#revealGeneration = 0;

	readonly #comments = new CommentsModel();
	readonly #review = observableValue<PlanReview | undefined>('planReview', undefined);
	/** Whether the workbench feedback store currently accepts new comments for this resource. */
	readonly #acceptsComments = observableValue<boolean>('acceptsComments', false);
	readonly #vscode = acquireVsCodeApi();
	readonly #syntaxHighlighter = new WebviewSyntaxHighlighter((message) => this.#vscode.postMessage(message));

	constructor(host: HTMLElement) {
		super();

		mermaid.initialize({ startOnLoad: false, theme: 'default' });

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (this.#syntaxHighlighter.handleMessage(message)) {
				return;
			}
			switch (message.type) {
				case 'init': {
					if (!this.#initialized) {
						this.#initialized = true;
						this.#createView(host, !!message.readonly, message.content);
					}
					break;
				}
				case 'update': {
					this.isUpdatingFromExtension = true;
					this.model.sourceText.set(new StringValue(message.content), undefined);
					this.isUpdatingFromExtension = false;
					break;
				}
				case 'gutterMarkers': {
					const markers: GutterMarker[] = message.markers.map((marker: { start: number; endExclusive: number; type: GutterMarker['type'] }) => ({
						range: OffsetRange.fromTo(marker.start, marker.endExclusive),
						type: marker.type,
					}));
					this.model.gutterMarkers.set(markers, undefined);
					break;
				}
				case 'comments': {
					this.#isUpdatingComments = true;
					const comments = (message.comments as readonly { id: string; start: number; endExclusive: number; body: string; author?: string }[]).map(comment => ({
						id: comment.id,
						range: OffsetRange.fromTo(comment.start, comment.endExclusive),
						body: comment.body,
						author: comment.author,
					}));
					this.#commentRanges = new Map(comments.map(comment => [comment.id, comment.range]));
					this.#comments.set(comments);
					this.#isUpdatingComments = false;
					this.#acceptsComments.set(!!message.acceptsComments, undefined);
					this.#review.set(message.review, undefined);
					this.#activeFeedbackId = message.review?.activeFeedbackId;
					const activeFeedbackRequestId = message.review?.activeFeedbackRequestId ?? 0;
					if (activeFeedbackRequestId !== this.#activeFeedbackRequestId) {
						this.#activeFeedbackRequestId = activeFeedbackRequestId;
						this.#revealActiveFeedback(this.#activeFeedbackId);
					}
					break;
				}
			}
		});

		this.#vscode.postMessage({ type: 'ready' });
	}

	#createView(host: HTMLElement, readonly: boolean, content: string): void {
		const model = this.model;
		// The scroll + cursor position last persisted for this document, captured
		// before any listener below can overwrite it, so it survives the editor being
		// re-created (e.g. after a session switch).
		const savedViewState = this.#getViewState();

		// Start in the last globally chosen edit/read-only mode. The lock toggle in
		// the editor drives `readonlyMode` from here on; changes are persisted below.
		model.readonlyMode.set(readonly, undefined);

		const view = this._register(new EditorView(model, {
			classNames: ['md-theme-vscode-default'],
			syntaxHighlighter: this.#syntaxHighlighter,
			onOpenLink: (url) => {
				const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase();
				if (scheme && scheme !== 'file') {
					return false;
				}
				this.#vscode.postMessage({ type: 'openLink', href: url });
				return undefined;
			},
			onToggleCheckbox: (item, newChecked) => {
				if (model.readonlyMode.get()) {
					return;
				}
				const doc = model.document.get();
				const itemOffset = findNodeOffsetById(doc, item);
				if (itemOffset === undefined) { return; }
				const range = taskCheckboxRange(item);
				if (!range) { return; }
				model.applyEdit(
					StringEdit.replace(
						range.delta(itemOffset),
						newChecked ? '[x]' : '[ ]'
					)
				);
			},
			renderCustomCodeBlock: (language, content) => {
				if (language !== 'mermaid') {
					return undefined;
				}
				const div = document.createElement('div');
				div.className = 'md-mermaid';
				const id = `mermaid-${this.#mermaidCounter++}`;
				mermaid
					.render(id, content)
					.then(({ svg }) => {
						div.innerHTML = svg;
					})
					.catch(() => {
						div.textContent = content;
					});
				return div;
			},
		}));
		this.#view = view;
		this.#host = host;
		if (this.#activeFeedbackRequestId > 0) {
			this.#revealActiveFeedback(this.#activeFeedbackId);
		}

		this._register(new EditorController(model, view));
		host.appendChild(view.element);
		const reviewToolbar = this._register(new PlanReviewToolbar(host, message => this.#vscode.postMessage(message)));
		this._register(autorun(reader => reviewToolbar.update(reader.readObservable(this.#review))));

		// Render comments as the VS Code V2 markdown cards. The card colours come
		// from the webview's own `--vscode-*` theme variables; `theme` only picks
		// the light/dark token wrapper. `resolveLine` maps a comment's start offset
		// to a 1-based line for the card header.
		const isLight = document.body.classList.contains('vscode-light');
		this._register(new VsCodeV2CommentsView(this.#comments, view, {
			theme: isLight ? 'light' : 'dark',
			resolveLine: (offset) => model.sourceText.get().value.slice(0, offset).split('\n').length,
		}));
		// The comment input (the gdocs-style "add a comment" affordance) is only
		// useful when the workbench feedback store will actually accept the comment;
		// otherwise submitting is a no-op. Mount the controller only while the
		// resource is in scope for a session, and tear it down when it leaves scope.
		let commentController: EditableCommentModeController | undefined;
		this._register(autorun((reader) => {
			const accepts = reader.readObservable(this.#acceptsComments);
			if (accepts && !commentController) {
				commentController = new EditableCommentModeController(model, view, (text, range) => {
					this.#vscode.postMessage({ type: 'addComment', start: range.start, endExclusive: range.endExclusive, text });
				});
			} else if (!accepts && commentController) {
				commentController.dispose();
				commentController = undefined;
			}
		}));
		this._register({ dispose: () => commentController?.dispose() });

		// The comment card's delete button mutates the local CommentsModel
		// directly. Mirror those removals back to the extension so the shared
		// store (and the code editor) stay in sync. Removals coming from an
		// extension-driven update set `#isUpdatingComments`, so they are not
		// echoed back.
		let knownCommentIds = new Set(this.#comments.comments.get().map(comment => comment.id));
		this._register(autorun((reader) => {
			const currentIds = new Set(reader.readObservable(this.#comments.comments).map(comment => comment.id));
			if (!this.#isUpdatingComments) {
				for (const id of knownCommentIds) {
					if (!currentIds.has(id)) {
						this.#vscode.postMessage({ type: 'deleteComment', id });
					}
				}
			}
			knownCommentIds = currentIds;
		}));

		// Load the document content, then restore the persisted cursor so it lands on
		// the same text. Offsets are clamped defensively in case the document shifted.
		model.sourceText.set(new StringValue(content), undefined);
		if (savedViewState.selection) {
			const max = content.length;
			const anchor = Math.min(savedViewState.selection.anchor, max);
			const active = Math.min(savedViewState.selection.active, max);
			model.selection.set(new Selection(anchor, active), undefined);
		}

		// Persist scroll as webview state (throttled to a frame). Registered after the
		// restore above so it never clobbers the values we are about to restore.
		let scrollSaveScheduled = false;
		const saveScroll = (): void => {
			scrollSaveScheduled = false;
			this.#patchViewState({ scrollTop: host.scrollTop });
		};
		const onScroll = (): void => {
			if (scrollSaveScheduled) { return; }
			scrollSaveScheduled = true;
			requestAnimationFrame(saveScroll);
		};
		host.addEventListener('scroll', onScroll, { passive: true });
		this._register({ dispose: () => host.removeEventListener('scroll', onScroll) });

		// Flush the latest scroll synchronously before the webview is hidden or torn
		// down, since the frame-throttled save above may not have run yet.
		const onHide = (): void => {
			if (document.visibilityState === 'hidden') {
				this.#patchViewState({ scrollTop: host.scrollTop });
			}
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', saveScroll);
		this._register({ dispose: () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveScroll); } });

		// Persist the cursor whenever it moves.
		this._register(autorun((reader) => {
			const sel = reader.readObservable(this.model.selection);
			this.#patchViewState({ selection: sel ? { anchor: sel.anchor, active: sel.active } : undefined });
		}));

		// Persist the edit/read-only mode as the global default whenever the lock
		// toggle flips it, so the next Markdown editor opens in the same mode. The
		// initial (restored) value is skipped so opening an editor doesn't re-write it.
		let firstReadonly = true;
		this._register(autorun((reader) => {
			const isReadonly = reader.readObservable(this.model.readonlyMode);
			if (!firstReadonly) {
				this.#vscode.postMessage({ type: 'setReadonly', readonly: isReadonly });
			}
			firstReadonly = false;
		}));

		// Forward user edits to the extension. Edits are ignored by the model while
		// read-only, so this is a no-op in that mode; keeping it always registered
		// means unlocking a read-only editor immediately resumes edit forwarding.
		let firstTime = true;
		let previousText = content;
		this._register(autorun((reader) => {
			const text = reader.readObservable(this.model.sourceText).value;
			if (!this.isUpdatingFromExtension && !firstTime) {
				this.#vscode.postMessage({ type: 'edit', content: text });
				const edit = createStringEdit(previousText, text);
				const comments = this.#comments.comments.read(undefined);
				const updatedComments = comments.map(comment => ({
					...comment,
					range: OffsetRange.fromTo(
						edit.mapOffset(comment.range.start),
						edit.mapOffset(comment.range.endExclusive),
					),
				}));
				this.#isUpdatingComments = true;
				this.#comments.set(updatedComments);
				this.#isUpdatingComments = false;
				this.#commentRanges = new Map(updatedComments.map(comment => [comment.id, comment.range]));
				for (let index = 0; index < comments.length; index++) {
					if (!comments[index].range.equals(updatedComments[index].range)) {
						this.#vscode.postMessage({
							type: 'updateCommentRange',
							id: comments[index].id,
							start: updatedComments[index].range.start,
							endExclusive: updatedComments[index].range.endExclusive,
						});
					}
				}
			}
			previousText = text;
			firstTime = false;
		}));

		// Restore scroll last: content height settles over a few frames (async parse,
		// syntax highlighting, mermaid), so re-apply until it sticks.
		// TODO@copilot: Consider using a more robust method for restoring scroll position, e.g. by waiting for the editor to stabilize
		this.#restoreScroll(host, savedViewState.scrollTop);
	}

	#revealActiveFeedback(feedbackId: string | undefined): void {
		const range = feedbackId ? this.#commentRanges.get(feedbackId) : undefined;
		if (!range || !this.#view || !this.#host) {
			return;
		}
		const generation = ++this.#revealGeneration;
		this.model.selection.set(new Selection(range.start, range.endExclusive), undefined);
		this.#view.element.focus();
		requestAnimationFrame(() => {
			if (generation !== this.#revealGeneration || !this.#view || !this.#host) {
				return;
			}
			const rect = this.#view.rangeRects(range).get()[0];
			if (rect) {
				this.#host.scrollTop += rect.y - this.#host.clientHeight / 2;
			}
		});
	}

	#getViewState(): PersistedViewState {
		return (this.#vscode.getState() as PersistedViewState | undefined) ?? {};
	}

	#patchViewState(patch: PersistedViewState): void {
		this.#vscode.setState({ ...this.#getViewState(), ...patch });
	}

	#restoreScroll(host: HTMLElement, scrollTop: number | undefined): void {
		if (typeof scrollTop !== 'number' || scrollTop <= 0) {
			return;
		}
		let tries = 0;
		const apply = (): void => {
			host.scrollTop = scrollTop;
			if (++tries < 6 && Math.abs(host.scrollTop - scrollTop) > 1) {
				requestAnimationFrame(apply);
			}
		};
		requestAnimationFrame(apply);
	}
}

new Editor(document.getElementById('editor')!);
