/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { assertIsDefined } from 'vs/base/common/types';
import 'vs/css!./parameterHints';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import * as languages from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { ParameterHintsModel } from 'vs/editor/contrib/parameterHints/browser/parameterHintsModel';
import { Context } from 'vs/editor/contrib/parameterHints/browser/provideSignatureHelp';
import * as nls from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorHoverBackground, editorHoverBorder, editorHoverForeground, listHighlightForeground, registerColor, textCodeBlockBackground, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { isHighContrast } from 'vs/platform/theme/common/theme';
import { registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';

const $ = dom.$;

const parameterHintsNextIcon = registerIcon('parameter-hints-next', Codicon.chevronDown, nls.localize('parameterHintsNextIcon', 'Icon for show next parameter hint.'));
const parameterHintsPreviousIcon = registerIcon('parameter-hints-previous', Codicon.chevronUp, nls.localize('parameterHintsPreviousIcon', 'Icon for show previous parameter hint.'));

export class ParameterHintsWidget extends Disposable implements IContentWidget {

	private static readonly ID = 'editor.widget.parameterHintsWidget';

	private readonly markdownRenderer: MarkdownRenderer;
	private readonly renderDisposeables = this._register(new DisposableStore());
	private readonly keyVisible: IContextKey<boolean>;
	private readonly keyMultipleSignatures: IContextKey<boolean>;

	private domNodes?: {
		readonly element: HTMLElement;
		readonly signature: HTMLElement;
		readonly docs: HTMLElement;
		readonly overloads: HTMLElement;
		readonly scrollbar: DomScrollableElement;
	};

	private visible: boolean = false;
	private announcedLabel: string | null = null;

	// Editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow = true;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly model: ParameterHintsModel,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@ILanguageService languageService: ILanguageService,
	) {
		super();

		this.markdownRenderer = this._register(new MarkdownRenderer({ editor }, languageService, openerService));

		this.keyVisible = Context.Visible.bindTo(contextKeyService);
		this.keyMultipleSignatures = Context.MultipleSignatures.bindTo(contextKeyService);
	}

	private createParameterHintDOMNodes() {
		const element = $('.editor-widget.parameter-hints-widget');
		const wrapper = dom.append(element, $('.phwrapper'));
		wrapper.tabIndex = -1;

		const controls = dom.append(wrapper, $('.controls'));
		const previous = dom.append(controls, $('.button' + ThemeIcon.asCSSSelector(parameterHintsPreviousIcon)));
		const overloads = dom.append(controls, $('.overloads'));
		const next = dom.append(controls, $('.button' + ThemeIcon.asCSSSelector(parameterHintsNextIcon)));

		this._register(dom.addDisposableListener(previous, 'click', e => {
			dom.EventHelper.stop(e);
			this.previous();
		}));

		this._register(dom.addDisposableListener(next, 'click', e => {
			dom.EventHelper.stop(e);
			this.next();
		}));

		const body = $('.body');
		const scrollbar = new DomScrollableElement(body, {
			alwaysConsumeMouseWheel: true,
		});
		this._register(scrollbar);
		wrapper.appendChild(scrollbar.getDomNode());

		const signature = dom.append(body, $('.signature'));
		const docs = dom.append(body, $('.docs'));

		element.style.userSelect = 'text';

		this.domNodes = {
			element,
			signature,
			overloads,
			docs,
			scrollbar,
		};

		this.editor.addContentWidget(this);
		this.hide();

		this._register(this.editor.onDidChangeCursorSelection(e => {
			if (this.visible) {
				this.editor.layoutContentWidget(this);
			}
		}));

		const updateFont = () => {
			if (!this.domNodes) {
				return;
			}
			const fontInfo = this.editor.getOption(EditorOption.fontInfo);
			this.domNodes.element.style.fontSize = `${fontInfo.fontSize}px`;
			this.domNodes.element.style.lineHeight = `${fontInfo.lineHeight / fontInfo.fontSize}`;
		};

		updateFont();

		this._register(Event.chain<ConfigurationChangedEvent>(this.editor.onDidChangeConfiguration.bind(this.editor))
			.filter(e => e.hasChanged(EditorOption.fontInfo))
			.on(updateFont, null));

		this._register(this.editor.onDidLayoutChange(e => this.updateMaxHeight()));
		this.updateMaxHeight();
	}

	public show(): void {
		if (this.visible) {
			return;
		}

		if (!this.domNodes) {
			this.createParameterHintDOMNodes();
		}

		this.keyVisible.set(true);
		this.visible = true;
		setTimeout(() => {
			this.domNodes?.element.classList.add('visible');
		}, 100);
		this.editor.layoutContentWidget(this);
	}

	public hide(): void {
		this.renderDisposeables.clear();

		if (!this.visible) {
			return;
		}

		this.keyVisible.reset();
		this.visible = false;
		this.announcedLabel = null;
		this.domNodes?.element.classList.remove('visible');
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

	public render(hints: languages.SignatureHelp): void {
		this.renderDisposeables.clear();

		if (!this.domNodes) {
			return;
		}

		const multiple = hints.signatures.length > 1;
		this.domNodes.element.classList.toggle('multiple', multiple);
		this.keyMultipleSignatures.set(multiple);

		this.domNodes.signature.innerText = '';
		this.domNodes.docs.innerText = '';

		const signature = hints.signatures[hints.activeSignature];
		if (!signature) {
			return;
		}

		const code = dom.append(this.domNodes.signature, $('.code'));
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		code.style.fontSize = `${fontInfo.fontSize}px`;
		code.style.fontFamily = fontInfo.fontFamily;

		const hasParameters = signature.parameters.length > 0;
		const activeParameterIndex = signature.activeParameter ?? hints.activeParameter;

		if (!hasParameters) {
			const label = dom.append(code, $('span'));
			label.textContent = signature.label;
		} else {
			this.renderParameters(code, signature, activeParameterIndex);
		}

		const activeParameter: languages.ParameterInformation | undefined = signature.parameters[activeParameterIndex];
		if (activeParameter?.documentation) {
			const documentation = $('span.documentation');
			if (typeof activeParameter.documentation === 'string') {
				documentation.textContent = activeParameter.documentation;
			} else {
				const renderedContents = this.renderMarkdownDocs(activeParameter.documentation);
				documentation.appendChild(renderedContents.element);
			}
			dom.append(this.domNodes.docs, $('p', {}, documentation));
		}

		if (signature.documentation === undefined) {
			/** no op */
		} else if (typeof signature.documentation === 'string') {
			dom.append(this.domNodes.docs, $('p', {}, signature.documentation));
		} else {
			const renderedContents = this.renderMarkdownDocs(signature.documentation);
			dom.append(this.domNodes.docs, renderedContents.element);
		}

		const hasDocs = this.hasDocs(signature, activeParameter);

		this.domNodes.signature.classList.toggle('has-docs', hasDocs);
		this.domNodes.docs.classList.toggle('empty', !hasDocs);

		this.domNodes.overloads.textContent =
			String(hints.activeSignature + 1).padStart(hints.signatures.length.toString().length, '0') + '/' + hints.signatures.length;

		if (activeParameter) {
			let labelToAnnounce = '';
			const param = signature.parameters[activeParameterIndex];
			if (Array.isArray(param.label)) {
				labelToAnnounce = signature.label.substring(param.label[0], param.label[1]);
			} else {
				labelToAnnounce = param.label;
			}
			if (param.documentation) {
				labelToAnnounce += typeof param.documentation === 'string' ? `, ${param.documentation}` : `, ${param.documentation.value}`;
			}
			if (signature.documentation) {
				labelToAnnounce += typeof signature.documentation === 'string' ? `, ${signature.documentation}` : `, ${signature.documentation.value}`;
			}

			// Select method gets called on every user type while parameter hints are visible.
			// We do not want to spam the user with same announcements, so we only announce if the current parameter changed.

			if (this.announcedLabel !== labelToAnnounce) {
				aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
				this.announcedLabel = labelToAnnounce;
			}
		}

		this.editor.layoutContentWidget(this);
		this.domNodes.scrollbar.scanDomNode();
	}

	private renderMarkdownDocs(markdown: IMarkdownString | undefined): IMarkdownRenderResult {
		const renderedContents = this.renderDisposeables.add(this.markdownRenderer.render(markdown, {
			asyncRenderCallback: () => {
				this.domNodes?.scrollbar.scanDomNode();
			}
		}));
		renderedContents.element.classList.add('markdown-docs');
		return renderedContents;
	}

	private hasDocs(signature: languages.SignatureInformation, activeParameter: languages.ParameterInformation | undefined): boolean {
		if (activeParameter && typeof activeParameter.documentation === 'string' && assertIsDefined(activeParameter.documentation).length > 0) {
			return true;
		}
		if (activeParameter && typeof activeParameter.documentation === 'object' && assertIsDefined(activeParameter.documentation).value.length > 0) {
			return true;
		}
		if (signature.documentation && typeof signature.documentation === 'string' && assertIsDefined(signature.documentation).length > 0) {
			return true;
		}
		if (signature.documentation && typeof signature.documentation === 'object' && assertIsDefined(signature.documentation.value).length > 0) {
			return true;
		}
		return false;
	}

	private renderParameters(parent: HTMLElement, signature: languages.SignatureInformation, activeParameterIndex: number): void {
		const [start, end] = this.getParameterLabelOffsets(signature, activeParameterIndex);

		const beforeSpan = document.createElement('span');
		beforeSpan.textContent = signature.label.substring(0, start);

		const paramSpan = document.createElement('span');
		paramSpan.textContent = signature.label.substring(start, end);
		paramSpan.className = 'parameter active';

		const afterSpan = document.createElement('span');
		afterSpan.textContent = signature.label.substring(end);

		dom.append(parent, beforeSpan, paramSpan, afterSpan);
	}

	private getParameterLabelOffsets(signature: languages.SignatureInformation, paramIdx: number): [number, number] {
		const param = signature.parameters[paramIdx];
		if (!param) {
			return [0, 0];
		} else if (Array.isArray(param.label)) {
			return param.label;
		} else if (!param.label.length) {
			return [0, 0];
		} else {
			const regex = new RegExp(`(\\W|^)${escapeRegExpCharacters(param.label)}(?=\\W|$)`, 'g');
			regex.test(signature.label);
			const idx = regex.lastIndex - param.label.length;
			return idx >= 0
				? [idx, regex.lastIndex]
				: [0, 0];
		}
	}

	next(): void {
		this.editor.focus();
		this.model.next();
	}

	previous(): void {
		this.editor.focus();
		this.model.previous();
	}

	getDomNode(): HTMLElement {
		if (!this.domNodes) {
			this.createParameterHintDOMNodes();
		}
		return this.domNodes!.element;
	}

	getId(): string {
		return ParameterHintsWidget.ID;
	}

	private updateMaxHeight(): void {
		if (!this.domNodes) {
			return;
		}
		const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
		const maxHeight = `${height}px`;
		this.domNodes.element.style.maxHeight = maxHeight;
		const wrapper = this.domNodes.element.getElementsByClassName('phwrapper') as HTMLCollectionOf<HTMLElement>;
		if (wrapper.length) {
			wrapper[0].style.maxHeight = maxHeight;
		}
	}
}

export const editorHoverWidgetHighlightForeground = registerColor('editorHoverWidget.highlightForeground', { dark: listHighlightForeground, light: listHighlightForeground, hcDark: listHighlightForeground, hcLight: listHighlightForeground }, nls.localize('editorHoverWidgetHighlightForeground', 'Foreground color of the active item in the parameter hint.'));

registerThemingParticipant((theme, collector) => {
	const border = theme.getColor(editorHoverBorder);
	if (border) {
		const borderWidth = isHighContrast(theme.type) ? 2 : 1;
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

	const linkHover = theme.getColor(textLinkActiveForeground);
	if (linkHover) {
		collector.addRule(`.monaco-editor .parameter-hints-widget a:hover { color: ${linkHover}; }`);
	}

	const foreground = theme.getColor(editorHoverForeground);
	if (foreground) {
		collector.addRule(`.monaco-editor .parameter-hints-widget { color: ${foreground}; }`);
	}

	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-editor .parameter-hints-widget code { background-color: ${codeBackground}; }`);
	}

	const parameterHighlightColor = theme.getColor(editorHoverWidgetHighlightForeground);
	if (parameterHighlightColor) {
		collector.addRule(`.monaco-editor .parameter-hints-widget .parameter.active { color: ${parameterHighlightColor}}`);
	}

});
