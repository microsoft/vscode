/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { domEvent, stop } from 'vs/base/browser/event';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Event } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./parameterHints';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import * as modes from 'vs/editor/common/modes';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { Context } from 'vs/editor/contrib/parameterHints/provideSignatureHelp';
import * as nls from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorHoverBackground, editorHoverBorder, textCodeBlockBackground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { HIGH_CONTRAST, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ParameterHintsModel, TriggerContext } from 'vs/editor/contrib/parameterHints/parameterHintsModel';

const $ = dom.$;

export class ParameterHintsWidget implements IContentWidget, IDisposable {

	private static readonly ID = 'editor.widget.parameterHintsWidget';

	private readonly markdownRenderer: MarkdownRenderer;
	private renderDisposeables: IDisposable[];
	private model: ParameterHintsModel | null;
	private readonly keyVisible: IContextKey<boolean>;
	private readonly keyMultipleSignatures: IContextKey<boolean>;
	private element: HTMLElement;
	private signature: HTMLElement;
	private docs: HTMLElement;
	private overloads: HTMLElement;
	private visible: boolean;
	private announcedLabel: string | null;
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

		this.disposables.push(this.model.onChangedHints(newParameterHints => {
			if (newParameterHints) {
				this.show();
				this.render(newParameterHints);
			} else {
				this.hide();
			}
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

		Event.chain<IConfigurationChangedEvent>(this.editor.onDidChangeConfiguration.bind(this.editor))
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
		this.announcedLabel = null;
		dom.removeClass(this.element, 'visible');
		this.editor.layoutContentWidget(this);
	}

	getPosition(): IContentWidgetPosition | null {
		if (this.visible) {
			return {
				position: this.editor.getPosition(),
				preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
			};
		}
		return null;
	}

	private render(hints: modes.SignatureHelp): void {
		const multiple = hints.signatures.length > 1;
		dom.toggleClass(this.element, 'multiple', multiple);
		this.keyMultipleSignatures.set(multiple);

		this.signature.innerHTML = '';
		this.docs.innerHTML = '';

		const signature = hints.signatures[hints.activeSignature];

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
			this.renderParameters(code, signature, hints.activeParameter);
		}

		dispose(this.renderDisposeables);
		this.renderDisposeables = [];

		const activeParameter = signature.parameters[hints.activeParameter];

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
			dom.append(this.docs, $('p', {}, documentation));
		}

		dom.toggleClass(this.signature, 'has-docs', !!signature.documentation);

		if (signature.documentation === undefined) { /** no op */ }
		else if (typeof signature.documentation === 'string') {
			dom.append(this.docs, $('p', {}, signature.documentation));
		} else {
			const renderedContents = this.markdownRenderer.render(signature.documentation);
			dom.addClass(renderedContents.element, 'markdown-docs');
			this.renderDisposeables.push(renderedContents);
			dom.append(this.docs, renderedContents.element);
		}

		let currentOverload = String(hints.activeSignature + 1);

		if (hints.signatures.length < 10) {
			currentOverload += `/${hints.signatures.length}`;
		}

		this.overloads.textContent = currentOverload;

		if (activeParameter) {
			const labelToAnnounce = this.getParameterLabel(signature, hints.activeParameter);
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

		const [start, end] = this.getParameterLabelOffsets(signature, currentParameter);

		const beforeSpan = document.createElement('span');
		beforeSpan.textContent = signature.label.substring(0, start);

		const paramSpan = document.createElement('span');
		paramSpan.textContent = signature.label.substring(start, end);
		paramSpan.className = 'parameter active';

		const afterSpan = document.createElement('span');
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

	next(): void {
		if (this.model) {
			this.editor.focus();
			this.model.next();
		}
	}

	previous(): void {
		if (this.model) {
			this.editor.focus();
			this.model.previous();
		}
	}

	cancel(): void {
		if (this.model) {
			this.model.cancel();
		}
	}

	getDomNode(): HTMLElement {
		return this.element;
	}

	getId(): string {
		return ParameterHintsWidget.ID;
	}

	trigger(context: TriggerContext): void {
		if (this.model) {
			this.model.trigger(context, 0);
		}
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
		const borderWidth = theme.type === HIGH_CONTRAST ? 2 : 1;
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
