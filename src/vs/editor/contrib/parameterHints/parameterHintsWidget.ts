/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./parameterHints';
import * as nls from 'vs/nls';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import * as modes from 'vs/editor/common/modes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { RunOnceScheduler, createCancelablePromise, CancelablePromise } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Event, Emitter, chain } from 'vs/base/common/event';
import { domEvent, stop } from 'vs/base/browser/event';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Context, provideSignatureHelp } from 'vs/editor/contrib/parameterHints/provideSignatureHelp';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { registerThemingParticipant, HIGH_CONTRAST } from 'vs/platform/theme/common/themeService';
import { editorHoverBackground, editorHoverBorder, textLinkForeground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';

const $ = dom.$;

export interface TriggerContext {
	readonly triggerReason: modes.SignatureHelpTriggerReason;
	readonly triggerCharacter?: string;
}

export interface IHintEvent {
	hints: modes.SignatureHelp;
}

export class ParameterHintsModel extends Disposable {

	private static readonly DEFAULT_DELAY = 120; // ms

	private readonly _onHint = this._register(new Emitter<IHintEvent>());
	public readonly onHint: Event<IHintEvent> = this._onHint.event;

	private readonly _onCancel = this._register(new Emitter<void>());
	public readonly onCancel: Event<void> = this._onCancel.event;

	private editor: ICodeEditor;
	private enabled: boolean;
	private triggerCharactersListeners: IDisposable[];
	private active: boolean = false;
	private pending: boolean = false;
	private triggerChars = new CharacterSet();
	private retriggerChars = new CharacterSet();

	private triggerContext: modes.SignatureHelpContext | undefined;
	private throttledDelayer: RunOnceScheduler;
	private provideSignatureHelpRequest?: CancelablePromise<modes.SignatureHelp>;

	constructor(
		editor: ICodeEditor,
		delay: number = ParameterHintsModel.DEFAULT_DELAY
	) {
		super();

		this.editor = editor;
		this.enabled = false;
		this.triggerCharactersListeners = [];

		this.throttledDelayer = new RunOnceScheduler(() => this.doTrigger(), delay);

		this._register(this.editor.onDidChangeConfiguration(() => this.onEditorConfigurationChange()));
		this._register(this.editor.onDidChangeModel(e => this.onModelChanged()));
		this._register(this.editor.onDidChangeModelLanguage(_ => this.onModelChanged()));
		this._register(this.editor.onDidChangeCursorSelection(e => this.onCursorChange(e)));
		this._register(this.editor.onDidChangeModelContent(e => this.onModelContentChange()));
		this._register(modes.SignatureHelpProviderRegistry.onDidChange(this.onModelChanged, this));
		this._register(this.editor.onDidType(text => this.onDidType(text)));

		this.onEditorConfigurationChange();
		this.onModelChanged();
	}

	cancel(silent: boolean = false): void {
		this.active = false;
		this.pending = false;
		this.triggerContext = undefined;

		this.throttledDelayer.cancel();

		if (!silent) {
			this._onCancel.fire(void 0);
		}

		if (this.provideSignatureHelpRequest) {
			this.provideSignatureHelpRequest.cancel();
			this.provideSignatureHelpRequest = undefined;
		}
	}

	trigger(context: TriggerContext, delay?: number): void {
		if (!modes.SignatureHelpProviderRegistry.has(this.editor.getModel())) {
			return;
		}

		const wasTriggered = this.isTriggered;
		this.cancel(true);

		this.triggerContext = {
			triggerReason: context.triggerReason,
			triggerCharacter: context.triggerCharacter,
			isRetrigger: wasTriggered
		};

		return this.throttledDelayer.schedule(delay);
	}

	private doTrigger(): void {
		if (this.provideSignatureHelpRequest) {
			this.provideSignatureHelpRequest.cancel();
		}

		this.pending = true;

		const triggerContext = this.triggerContext || { triggerReason: modes.SignatureHelpTriggerReason.Invoke, isRetrigger: false };
		this.triggerContext = undefined;

		this.provideSignatureHelpRequest = createCancelablePromise(token =>
			provideSignatureHelp(this.editor.getModel(), this.editor.getPosition(), triggerContext, token));

		this.provideSignatureHelpRequest.then(result => {
			this.pending = false;

			if (!result || !result.signatures || result.signatures.length === 0) {
				this.cancel();
				this._onCancel.fire(void 0);
				return false;
			}

			this.active = true;
			const event: IHintEvent = { hints: result };
			this._onHint.fire(event);
			return true;

		}).catch(error => {
			this.pending = false;
			onUnexpectedError(error);
		});
	}

	private get isTriggered(): boolean {
		return this.active || this.pending || this.throttledDelayer.isScheduled();
	}

	private onModelChanged(): void {
		this.cancel();

		// Update trigger characters
		this.triggerChars = new CharacterSet();
		this.retriggerChars = new CharacterSet();

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		for (const support of modes.SignatureHelpProviderRegistry.ordered(model)) {
			if (Array.isArray(support.signatureHelpTriggerCharacters)) {
				for (const ch of support.signatureHelpTriggerCharacters) {
					this.triggerChars.add(ch.charCodeAt(0));

					// All trigger characters are also considered retrigger characters
					this.retriggerChars.add(ch.charCodeAt(0));

				}
			}
			if (Array.isArray(support.signatureHelpRetriggerCharacters)) {
				for (const ch of support.signatureHelpRetriggerCharacters) {
					this.retriggerChars.add(ch.charCodeAt(0));
				}
			}
		}
	}

	private onDidType(text: string) {
		if (!this.enabled) {
			return;
		}

		const lastCharIndex = text.length - 1;
		const triggerCharCode = text.charCodeAt(lastCharIndex);

		if (this.triggerChars.has(triggerCharCode) || this.isTriggered && this.retriggerChars.has(triggerCharCode)) {
			this.trigger({
				triggerReason: modes.SignatureHelpTriggerReason.TriggerCharacter,
				triggerCharacter: text.charAt(lastCharIndex),
			});
		}
	}

	private onCursorChange(e: ICursorSelectionChangedEvent): void {
		if (e.source === 'mouse') {
			this.cancel();
		} else if (this.isTriggered) {
			this.trigger({ triggerReason: modes.SignatureHelpTriggerReason.ContentChange });
		}
	}

	private onModelContentChange(): void {
		if (this.isTriggered) {
			this.trigger({ triggerReason: modes.SignatureHelpTriggerReason.ContentChange });
		}
	}

	private onEditorConfigurationChange(): void {
		this.enabled = this.editor.getConfiguration().contribInfo.parameterHints.enabled;

		if (!this.enabled) {
			this.cancel();
		}
	}

	dispose(): void {
		this.cancel(true);
		this.triggerCharactersListeners = dispose(this.triggerCharactersListeners);

		super.dispose();
	}
}

export class ParameterHintsWidget implements IContentWidget, IDisposable {

	private static readonly ID = 'editor.widget.parameterHintsWidget';

	private readonly markdownRenderer: MarkdownRenderer;
	private renderDisposeables: IDisposable[];
	private model: ParameterHintsModel;
	private readonly keyVisible: IContextKey<boolean>;
	private readonly keyMultipleSignatures: IContextKey<boolean>;
	private element: HTMLElement;
	private signature: HTMLElement;
	private docs: HTMLElement;
	private overloads: HTMLElement;
	private currentSignature: number;
	private visible: boolean;
	private hints: modes.SignatureHelp;
	private announcedLabel: string;
	private scrollbar: DomScrollableElement;
	private disposables: IDisposable[];

	// Editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow = true;

	constructor(
		private editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IModeService modeService: IModeService,
	) {
		this.markdownRenderer = new MarkdownRenderer(editor, modeService, openerService);
		this.model = new ParameterHintsModel(editor);
		this.keyVisible = Context.Visible.bindTo(contextKeyService);
		this.keyMultipleSignatures = Context.MultipleSignatures.bindTo(contextKeyService);
		this.visible = false;
		this.disposables = [];

		this.disposables.push(this.model.onHint(e => {
			this.show();
			this.hints = e.hints;
			this.currentSignature = e.hints.activeSignature;
			this.render();
		}));

		this.disposables.push(this.model.onCancel(() => {
			this.hide();
		}));
	}

	private createParamaterHintDOMNodes() {
		this.element = $('.editor-widget.parameter-hints-widget');
		const wrapper = dom.append(this.element, $('.wrapper'));

		const buttons = dom.append(wrapper, $('.buttons'));
		const previous = dom.append(buttons, $('.button.previous'));
		const next = dom.append(buttons, $('.button.next'));

		const onPreviousClick = stop(domEvent(previous, 'click'));
		onPreviousClick(this.previous, this, this.disposables);

		const onNextClick = stop(domEvent(next, 'click'));
		onNextClick(this.next, this, this.disposables);

		this.overloads = dom.append(wrapper, $('.overloads'));

		const body = $('.body');
		this.scrollbar = new DomScrollableElement(body, {});
		this.disposables.push(this.scrollbar);
		wrapper.appendChild(this.scrollbar.getDomNode());

		this.signature = dom.append(body, $('.signature'));

		this.docs = dom.append(body, $('.docs'));

		this.currentSignature = 0;

		this.editor.addContentWidget(this);
		this.hide();

		this.element.style.userSelect = 'text';
		this.disposables.push(this.editor.onDidChangeCursorSelection(e => {
			if (this.visible) {
				this.editor.layoutContentWidget(this);
			}
		}));

		const updateFont = () => {
			const fontInfo = this.editor.getConfiguration().fontInfo;
			this.element.style.fontSize = `${fontInfo.fontSize}px`;
		};

		updateFont();

		chain<IConfigurationChangedEvent>(this.editor.onDidChangeConfiguration.bind(this.editor))
			.filter(e => e.fontInfo)
			.on(updateFont, null, this.disposables);

		this.disposables.push(this.editor.onDidLayoutChange(e => this.updateMaxHeight()));
		this.updateMaxHeight();
	}

	private show(): void {
		if (!this.model || this.visible) {
			return;
		}

		if (!this.element) {
			this.createParamaterHintDOMNodes();
		}

		this.keyVisible.set(true);
		this.visible = true;
		setTimeout(() => dom.addClass(this.element, 'visible'), 100);
		this.editor.layoutContentWidget(this);
	}

	private hide(): void {
		if (!this.model || !this.visible) {
			return;
		}

		if (!this.element) {
			this.createParamaterHintDOMNodes();
		}

		this.keyVisible.reset();
		this.visible = false;
		this.hints = null;
		this.announcedLabel = null;
		dom.removeClass(this.element, 'visible');
		this.editor.layoutContentWidget(this);
	}

	getPosition(): IContentWidgetPosition {
		if (this.visible) {
			return {
				position: this.editor.getPosition(),
				preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
			};
		}
		return null;
	}

	private render(): void {
		const multiple = this.hints.signatures.length > 1;
		dom.toggleClass(this.element, 'multiple', multiple);
		this.keyMultipleSignatures.set(multiple);

		this.signature.innerHTML = '';
		this.docs.innerHTML = '';

		const signature = this.hints.signatures[this.currentSignature];

		if (!signature) {
			return;
		}

		const code = dom.append(this.signature, $('.code'));
		const hasParameters = signature.parameters.length > 0;

		const fontInfo = this.editor.getConfiguration().fontInfo;
		code.style.fontSize = `${fontInfo.fontSize}px`;
		code.style.fontFamily = fontInfo.fontFamily;

		if (!hasParameters) {
			const label = dom.append(code, $('span'));
			label.textContent = signature.label;

		} else {
			this.renderParameters(code, signature, this.hints.activeParameter);
		}

		dispose(this.renderDisposeables);
		this.renderDisposeables = [];

		const activeParameter = signature.parameters[this.hints.activeParameter];

		if (activeParameter && activeParameter.documentation) {
			const documentation = $('span.documentation');
			if (typeof activeParameter.documentation === 'string') {
				documentation.textContent = activeParameter.documentation;
			} else {
				const renderedContents = this.markdownRenderer.render(activeParameter.documentation);
				dom.addClass(renderedContents.element, 'markdown-docs');
				this.renderDisposeables.push(renderedContents);
				documentation.appendChild(renderedContents.element);
			}
			dom.append(this.docs, $('p', null, documentation));
		}

		dom.toggleClass(this.signature, 'has-docs', !!signature.documentation);

		if (typeof signature.documentation === 'string') {
			dom.append(this.docs, $('p', null, signature.documentation));
		} else {
			const renderedContents = this.markdownRenderer.render(signature.documentation);
			dom.addClass(renderedContents.element, 'markdown-docs');
			this.renderDisposeables.push(renderedContents);
			dom.append(this.docs, renderedContents.element);
		}

		let currentOverload = String(this.currentSignature + 1);

		if (this.hints.signatures.length < 10) {
			currentOverload += `/${this.hints.signatures.length}`;
		}

		this.overloads.textContent = currentOverload;

		if (activeParameter) {
			const labelToAnnounce = this.getParameterLabel(signature, this.hints.activeParameter);
			// Select method gets called on every user type while parameter hints are visible.
			// We do not want to spam the user with same announcements, so we only announce if the current parameter changed.

			if (this.announcedLabel !== labelToAnnounce) {
				aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
				this.announcedLabel = labelToAnnounce;
			}
		}

		this.editor.layoutContentWidget(this);
		this.scrollbar.scanDomNode();
	}

	private renderParameters(parent: HTMLElement, signature: modes.SignatureInformation, currentParameter: number): void {

		let [start, end] = this.getParameterLabelOffsets(signature, currentParameter);

		let beforeSpan = document.createElement('span');
		beforeSpan.textContent = signature.label.substring(0, start);

		let paramSpan = document.createElement('span');
		paramSpan.textContent = signature.label.substring(start, end);
		paramSpan.className = 'parameter active';

		let afterSpan = document.createElement('span');
		afterSpan.textContent = signature.label.substring(end);

		dom.append(parent, beforeSpan, paramSpan, afterSpan);
	}

	private getParameterLabel(signature: modes.SignatureInformation, paramIdx: number): string {
		const param = signature.parameters[paramIdx];
		if (typeof param.label === 'string') {
			return param.label;
		} else {
			return signature.label.substring(param.label[0], param.label[1]);
		}
	}

	private getParameterLabelOffsets(signature: modes.SignatureInformation, paramIdx: number): [number, number] {
		const param = signature.parameters[paramIdx];
		if (!param) {
			return [0, 0];
		} else if (Array.isArray(param.label)) {
			return param.label;
		} else {
			const idx = signature.label.lastIndexOf(param.label);
			return idx >= 0
				? [idx, idx + param.label.length]
				: [0, 0];
		}
	}

	// private select(position: number): void {
	// 	const signature = this.signatureViews[position];

	// 	if (!signature) {
	// 		return;
	// 	}

	// 	this.signatures.style.height = `${ signature.height }px`;
	// 	this.signatures.scrollTop = signature.top;

	// 	let overloads = '' + (position + 1);

	// 	if (this.signatureViews.length < 10) {
	// 		overloads += '/' + this.signatureViews.length;
	// 	}

	// 	this.overloads.textContent = overloads;

	// 	if (this.hints && this.hints.signatures[position].parameters[this.hints.activeParameter]) {
	// 		const labelToAnnounce = this.hints.signatures[position].parameters[this.hints.activeParameter].label;
	// 		// Select method gets called on every user type while parameter hints are visible.
	// 		// We do not want to spam the user with same announcements, so we only announce if the current parameter changed.
	// 		if (this.announcedLabel !== labelToAnnounce) {
	// 			aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
	// 			this.announcedLabel = labelToAnnounce;
	// 		}
	// 	}

	// 	this.editor.layoutContentWidget(this);
	// }

	next(): boolean {
		const length = this.hints.signatures.length;
		const last = (this.currentSignature % length) === (length - 1);
		const cycle = this.editor.getConfiguration().contribInfo.parameterHints.cycle;

		// If there is only one signature, or we're on last signature of list
		if ((length < 2 || last) && !cycle) {
			this.cancel();
			return false;
		}

		if (last && cycle) {
			this.currentSignature = 0;
		} else {
			this.currentSignature++;
		}

		this.render();
		return true;
	}

	previous(): boolean {
		const length = this.hints.signatures.length;
		const first = this.currentSignature === 0;
		const cycle = this.editor.getConfiguration().contribInfo.parameterHints.cycle;

		// If there is only one signature, or we're on first signature of list
		if ((length < 2 || first) && !cycle) {
			this.cancel();
			return false;
		}

		if (first && cycle) {
			this.currentSignature = length - 1;
		} else {
			this.currentSignature--;
		}

		this.render();
		return true;
	}

	cancel(): void {
		this.model.cancel();
	}

	getDomNode(): HTMLElement {
		return this.element;
	}

	getId(): string {
		return ParameterHintsWidget.ID;
	}

	trigger(context: TriggerContext): void {
		this.model.trigger(context, 0);
	}

	private updateMaxHeight(): void {
		const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
		this.element.style.maxHeight = `${height}px`;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.renderDisposeables = dispose(this.renderDisposeables);

		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}
}

registerThemingParticipant((theme, collector) => {
	const border = theme.getColor(editorHoverBorder);
	if (border) {
		let borderWidth = theme.type === HIGH_CONTRAST ? 2 : 1;
		collector.addRule(`.monaco-editor .parameter-hints-widget { border: ${borderWidth}px solid ${border}; }`);
		collector.addRule(`.monaco-editor .parameter-hints-widget.multiple .body { border-left: 1px solid ${border.transparent(0.5)}; }`);
		collector.addRule(`.monaco-editor .parameter-hints-widget .signature.has-docs { border-bottom: 1px solid ${border.transparent(0.5)}; }`);

	}
	const background = theme.getColor(editorHoverBackground);
	if (background) {
		collector.addRule(`.monaco-editor .parameter-hints-widget { background-color: ${background}; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-editor .parameter-hints-widget a { color: ${link}; }`);
	}

	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-editor .parameter-hints-widget code { background-color: ${codeBackground}; }`);
	}
});
