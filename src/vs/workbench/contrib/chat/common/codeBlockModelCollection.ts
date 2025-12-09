/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { EndOfLinePreference, ITextModel } from '../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { extractCodeblockUrisFromText, extractVulnerabilitiesFromText, IMarkdownVulnerability } from './annotations.js';
import { IChatRequestViewModel, IChatResponseViewModel, isResponseVM } from './chatViewModel.js';


interface CodeBlockContent {
	readonly text: string;
	readonly languageId?: string;
	readonly isComplete: boolean;
}

export interface CodeBlockEntry {
	readonly model: Promise<ITextModel>;
	readonly vulns: readonly IMarkdownVulnerability[];
	readonly codemapperUri?: URI;
	readonly isEdit?: boolean;
}

export class CodeBlockModelCollection extends Disposable {

	private readonly _models = new Map<string, {
		model: Promise<IReference<IResolvedTextEditorModel>>;
		vulns: readonly IMarkdownVulnerability[];
		inLanguageId: string | undefined;
		codemapperUri?: URI;
		isEdit?: boolean;
	}>();

	/**
	 * Max number of models to keep in memory.
	 *
	 * Currently always maintains the most recently created models.
	 */
	private readonly maxModelCount = 100;

	constructor(
		private readonly tag: string | undefined,
		@ILanguageService private readonly languageService: ILanguageService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();

		this._register(this.languageService.onDidChange(async () => {
			for (const entry of this._models.values()) {
				if (!entry.inLanguageId) {
					continue;
				}

				const model = (await entry.model).object;
				const existingLanguageId = model.getLanguageId();
				if (!existingLanguageId || existingLanguageId === PLAINTEXT_LANGUAGE_ID) {
					this.trySetTextModelLanguage(entry.inLanguageId, model.textEditorModel);
				}
			}
		}));
	}

	public override dispose(): void {
		super.dispose();
		this.clear();
	}

	get(sessionResource: URI, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): CodeBlockEntry | undefined {
		const entry = this._models.get(this.getKey(sessionResource, chat, codeBlockIndex));
		if (!entry) {
			return;
		}
		return {
			model: entry.model.then(ref => ref.object.textEditorModel),
			vulns: entry.vulns,
			codemapperUri: entry.codemapperUri,
			isEdit: entry.isEdit,
		};
	}

	getOrCreate(sessionResource: URI, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): CodeBlockEntry {
		const existing = this.get(sessionResource, chat, codeBlockIndex);
		if (existing) {
			return existing;
		}

		const uri = this.getCodeBlockUri(sessionResource, chat, codeBlockIndex);
		const model = this.textModelService.createModelReference(uri);
		this._models.set(this.getKey(sessionResource, chat, codeBlockIndex), {
			model: model,
			vulns: [],
			inLanguageId: undefined,
			codemapperUri: undefined,
		});

		while (this._models.size > this.maxModelCount) {
			const first = Iterable.first(this._models.keys());
			if (!first) {
				break;
			}
			this.delete(first);
		}

		return { model: model.then(x => x.object.textEditorModel), vulns: [], codemapperUri: undefined };
	}

	private delete(key: string) {
		const entry = this._models.get(key);
		if (!entry) {
			return;
		}

		entry.model.then(ref => ref.dispose());
		this._models.delete(key);
	}

	clear(): void {
		this._models.forEach(async entry => await entry.model.then(ref => ref.dispose()));
		this._models.clear();
	}

	updateSync(sessionResource: URI, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, content: CodeBlockContent): CodeBlockEntry {
		const entry = this.getOrCreate(sessionResource, chat, codeBlockIndex);

		this.updateInternalCodeBlockEntry(content, sessionResource, chat, codeBlockIndex);

		return this.get(sessionResource, chat, codeBlockIndex) ?? entry;
	}

	markCodeBlockCompleted(sessionResource: URI, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): void {
		const entry = this._models.get(this.getKey(sessionResource, chat, codeBlockIndex));
		if (!entry) {
			return;
		}
		// TODO: fill this in once we've implemented https://github.com/microsoft/vscode/issues/232538
	}

	async update(sessionResource: URI, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, content: CodeBlockContent): Promise<CodeBlockEntry> {
		const entry = this.getOrCreate(sessionResource, chat, codeBlockIndex);

		const newText = this.updateInternalCodeBlockEntry(content, sessionResource, chat, codeBlockIndex);

		const textModel = await entry.model;
		if (!textModel || textModel.isDisposed()) {
			// Somehow we get an undefined textModel sometimes - #237782
			return entry;
		}

		if (content.languageId) {
			this.trySetTextModelLanguage(content.languageId, textModel);
		}

		const currentText = textModel.getValue(EndOfLinePreference.LF);
		if (newText === currentText) {
			return entry;
		}

		if (newText.startsWith(currentText)) {
			const text = newText.slice(currentText.length);
			const lastLine = textModel.getLineCount();
			const lastCol = textModel.getLineMaxColumn(lastLine);
			textModel.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text }]);
		} else {
			// console.log(`Failed to optimize setText`);
			textModel.setValue(newText);
		}

		return entry;
	}

	private updateInternalCodeBlockEntry(content: CodeBlockContent, sessionResource: URI, chat: IChatResponseViewModel | IChatRequestViewModel, codeBlockIndex: number) {
		const entry = this._models.get(this.getKey(sessionResource, chat, codeBlockIndex));
		if (entry) {
			entry.inLanguageId = content.languageId;
		}

		const extractedVulns = extractVulnerabilitiesFromText(content.text);
		let newText = fixCodeText(extractedVulns.newText, content.languageId);
		if (entry) {
			entry.vulns = extractedVulns.vulnerabilities;
		}

		const codeblockUri = extractCodeblockUrisFromText(newText);
		if (codeblockUri) {
			if (entry) {
				entry.codemapperUri = codeblockUri.uri;
				entry.isEdit = codeblockUri.isEdit;
			}

			newText = codeblockUri.textWithoutResult;
		}

		if (content.isComplete) {
			this.markCodeBlockCompleted(sessionResource, chat, codeBlockIndex);
		}

		return newText;
	}

	private trySetTextModelLanguage(inLanguageId: string, textModel: ITextModel) {
		const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(inLanguageId);
		if (vscodeLanguageId && vscodeLanguageId !== textModel.getLanguageId()) {
			textModel.setLanguage(vscodeLanguageId);
		}
	}

	private getKey(sessionResource: URI, chat: IChatRequestViewModel | IChatResponseViewModel, index: number): string {
		return `${sessionResource.toString()}/${chat.id}/${index}`;
	}

	private getCodeBlockUri(sessionResource: URI, chat: IChatRequestViewModel | IChatResponseViewModel, index: number): URI {
		const metadata = this.getUriMetaData(chat);
		const indexPart = this.tag ? `${this.tag}-${index}` : `${index}`;
		const encodedSessionId = encodeBase64(VSBuffer.wrap(new TextEncoder().encode(sessionResource.toString())), false, true);
		return URI.from({
			scheme: Schemas.vscodeChatCodeBlock,
			authority: encodedSessionId,
			path: `/${chat.id}/${indexPart}`,
			fragment: metadata ? JSON.stringify(metadata) : undefined,
		});
	}

	private getUriMetaData(chat: IChatRequestViewModel | IChatResponseViewModel) {
		if (!isResponseVM(chat)) {
			return undefined;
		}

		return {
			references: chat.contentReferences.map(ref => {
				if (typeof ref.reference === 'string') {
					return;
				}

				const uriOrLocation = 'variableName' in ref.reference ?
					ref.reference.value :
					ref.reference;
				if (!uriOrLocation) {
					return;
				}

				if (URI.isUri(uriOrLocation)) {
					return {
						uri: uriOrLocation.toJSON()
					};
				}

				return {
					uri: uriOrLocation.uri.toJSON(),
					range: uriOrLocation.range,
				};
			})
		};
	}
}

function fixCodeText(text: string, languageId: string | undefined): string {
	if (languageId === 'php') {
		// <?php or short tag version <?
		if (!text.trim().startsWith('<?')) {
			return `<?php\n${text}`;
		}
	}

	return text;
}
