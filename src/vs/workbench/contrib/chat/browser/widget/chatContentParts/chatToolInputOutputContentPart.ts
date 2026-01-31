/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { LanguageModelPartAudience } from '../../../common/languageModels.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../chat.js';
import { CodeBlockPart, ICodeBlockData, ICodeBlockRenderOptions } from './codeBlockPart.js';
import { IDisposableReference } from './chatCollections.js';
import { ChatQueryTitlePart } from './chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatToolOutputContentSubPart } from './chatToolOutputContentSubPart.js';

export interface IChatCollapsibleIOCodePart {
	kind: 'code';
	data: string; // The text content to create a model from
	languageId: string;
	options: ICodeBlockRenderOptions;
	codeBlockIndex: number;
	ownerMarkdownPartId: string;
	title?: string | IMarkdownString;
}

export interface IChatCollapsibleIODataPart {
	kind: 'data';
	value?: Uint8Array;
	/**
	 * Base64-encoded value that can be decoded lazily to avoid expensive
	 * decoding during scroll. Takes precedence over `value` when present.
	 */
	base64Value?: string;
	audience?: LanguageModelPartAudience[];
	mimeType: string | undefined;
	uri: URI;
}

export type ChatCollapsibleIOPart = IChatCollapsibleIOCodePart | IChatCollapsibleIODataPart;

export interface IChatCollapsibleInputData extends IChatCollapsibleIOCodePart { }
export interface IChatCollapsibleOutputData {
	parts: ChatCollapsibleIOPart[];
}

export class ChatCollapsibleInputOutputContentPart extends Disposable {
	private readonly _editorReferences: IDisposableReference<CodeBlockPart>[] = [];
	private readonly _titlePart: ChatQueryTitlePart;
	private _outputSubPart: ChatToolOutputContentSubPart | undefined;
	public readonly domNode: HTMLElement;
	private _contentInitialized = false;

	get codeblocks(): IChatCodeBlockInfo[] {
		const outputCodeblocks = this._outputSubPart?.codeblocks ?? [];
		return outputCodeblocks;
	}

	public set title(s: string | IMarkdownString) {
		this._titlePart.title = s;
	}

	public get title(): string | IMarkdownString {
		return this._titlePart.title;
	}

	private readonly _expanded: ISettableObservable<boolean>;

	public get expanded(): boolean {
		return this._expanded.get();
	}

	constructor(
		title: IMarkdownString | string,
		subtitle: string | IMarkdownString | undefined,
		progressTooltip: IMarkdownString | string | undefined,
		private readonly context: IChatContentPartRenderContext,
		private readonly input: IChatCollapsibleInputData,
		private readonly output: IChatCollapsibleOutputData | undefined,
		isError: boolean,
		initiallyExpanded: boolean,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		const container = dom.h('.chat-confirmation-widget-container');
		const titleEl = dom.h('.chat-confirmation-widget-title-inner');
		const elements = dom.h('.chat-confirmation-widget');
		this.domNode = container.root;
		container.root.appendChild(elements.root);

		this._titlePart = this._register(_instantiationService.createInstance(
			ChatQueryTitlePart,
			titleEl.root,
			title,
			subtitle,
		));
		const spacer = document.createElement('span');
		spacer.style.flexGrow = '1';

		const btn = this._register(new ButtonWithIcon(elements.root, {}));
		btn.element.classList.add('chat-confirmation-widget-title', 'monaco-text-button');
		btn.labelElement.append(titleEl.root);

		const check = dom.h(isError
			? ThemeIcon.asCSSSelector(Codicon.error)
			: output
				? ThemeIcon.asCSSSelector(Codicon.check)
				: ThemeIcon.asCSSSelector(ThemeIcon.modify(Codicon.loading, 'spin'))
		);

		if (progressTooltip) {
			this._register(hoverService.setupDelayedHover(check.root, {
				content: progressTooltip,
				style: HoverStyle.Pointer,
			}));
		}

		const expanded = this._expanded = observableValue(this, initiallyExpanded);
		this._register(autorun(r => {
			const value = expanded.read(r);
			btn.icon = isError
				? Codicon.error
				: output
					? Codicon.check
					: ThemeIcon.modify(Codicon.loading, 'spin');
			elements.root.classList.toggle('collapsed', !value);

			// Lazy initialization: render content only when expanded for the first time
			if (value && !this._contentInitialized) {
				this._contentInitialized = true;
				const messageContainer = dom.h('.chat-confirmation-widget-message');
				messageContainer.root.appendChild(this.createMessageContents());
				elements.root.appendChild(messageContainer.root);
			}
		}));

		const toggle = (e: Event) => {
			if (!e.defaultPrevented) {
				const value = expanded.get();
				expanded.set(!value, undefined);
				e.preventDefault();
			}
		};

		this._register(btn.onDidClick(toggle));

		const topLevelResources = this.output?.parts
			.filter(p => p.kind === 'data')
			.filter(p => !p.audience || p.audience.includes(LanguageModelPartAudience.User));
		if (topLevelResources?.length) {
			const resourceSubPart = this._register(this._instantiationService.createInstance(
				ChatToolOutputContentSubPart,
				this.context,
				topLevelResources,
			));
			const group = resourceSubPart.domNode;
			group.classList.add('chat-collapsible-top-level-resource-group');
			container.root.appendChild(group);
			this._register(autorun(r => {
				group.style.display = expanded.read(r) ? 'none' : '';
			}));
		}
	}

	private createMessageContents() {
		const contents = dom.h('div', [
			dom.h('h3@inputTitle'),
			dom.h('div@input'),
			dom.h('h3@outputTitle'),
			dom.h('div@output'),
		]);

		const { input, output } = this;

		contents.inputTitle.textContent = localize('chat.input', "Input");
		this.addCodeBlock(input, contents.input);

		if (!output) {
			contents.output.remove();
			contents.outputTitle.remove();
		} else {
			contents.outputTitle.textContent = localize('chat.output', "Output");
			const outputSubPart = this._register(this._instantiationService.createInstance(
				ChatToolOutputContentSubPart,
				this.context,
				output.parts,
			));
			this._outputSubPart = outputSubPart;
			contents.output.appendChild(outputSubPart.domNode);
		}

		return contents.root;
	}

	private addCodeBlock(part: IChatCollapsibleIOCodePart, container: HTMLElement) {
		// Create the text model lazily when rendering
		const textModel = this._register(this.modelService.createModel(
			part.data,
			this.languageService.createById(part.languageId),
			undefined,
			true
		));

		const data: ICodeBlockData = {
			languageId: part.languageId,
			textModel: Promise.resolve(textModel),
			codeBlockIndex: part.codeBlockIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			parentContextKeyService: this.contextKeyService,
			renderOptions: part.options,
			chatSessionResource: this.context.element.sessionResource,
		};
		const editorReference = this._register(this.context.editorPool.get());
		editorReference.object.render(data, this.context.currentWidth.get() || 300);
		container.appendChild(editorReference.object.element);
		this._editorReferences.push(editorReference);
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// For now, we consider content different unless it's exactly the same instance
		return false;
	}

	layout(width: number): void {
		this._editorReferences.forEach(r => r.object.layout(width));
		this._outputSubPart?.layout(width);
	}
}
