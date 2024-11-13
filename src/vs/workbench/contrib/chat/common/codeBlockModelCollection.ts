/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { EndOfLinePreference, ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { extractCodeblockUrisFromText, extractVulnerabilitiesFromText, IMarkdownVulnerability } from './annotations.js';
import { IChatRequestViewModel, IChatResponseViewModel, isResponseVM } from './chatViewModel.js';


interface CodeBlockContent {
	readonly text: string;
	readonly languageId?: string;
	readonly isComplete: boolean;
}

interface CodeBlockEntry {
	readonly model: Promise<ITextModel>;
	readonly vulns: readonly IMarkdownVulnerability[];
	readonly codemapperUri?: URI;
}

type CodeBlockTextModel = {
	readonly type: 'incomplete';
	readonly value: ITextModel;
} | {
	readonly type: 'complete';
	readonly value: Promise<IReference<IResolvedTextEditorModel>>;
};

export class CodeBlockModelCollection extends Disposable {

	private readonly _models = new Map<string, {
		model: CodeBlockTextModel;
		vulns: readonly IMarkdownVulnerability[];
		codemapperUri?: URI;
	}>();

	/**
	 * Max number of models to keep in memory.
	 *
	 * Currently always maintains the most recently created models.
	 */
	private readonly maxModelCount = 100;

	constructor(
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();
	}

	public override dispose(): void {
		super.dispose();
		this.clear();
	}

	get(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): CodeBlockEntry | undefined {
		const entry = this._models.get(this.getKey(sessionId, chat, codeBlockIndex));
		if (!entry) {
			return;
		}
		return {
			model: entry.model.type === 'incomplete' ? Promise.resolve(entry.model.value) : entry.model.value.then(ref => ref.object.textEditorModel),
			vulns: entry.vulns,
			codemapperUri: entry.codemapperUri
		};
	}

	getOrCreate(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): CodeBlockEntry {
		const existing = this.get(sessionId, chat, codeBlockIndex);
		if (existing) {
			return existing;
		}

		const uri = this.getIncompleteModelUri(sessionId, chat, codeBlockIndex);
		const model = this.modelService.createModel('', null, uri, true);
		this._models.set(this.getKey(sessionId, chat, codeBlockIndex), {
			model: { type: 'incomplete', value: model },
			vulns: [],
			codemapperUri: undefined,
		});

		while (this._models.size > this.maxModelCount) {
			const first = Iterable.first(this._models.keys());
			if (!first) {
				break;
			}
			this.delete(first);
		}

		return { model: Promise.resolve(model), vulns: [], codemapperUri: undefined };
	}

	private delete(key: string) {
		const entry = this._models.get(key);
		if (!entry) {
			return;
		}

		this.disposeModel(entry.model);

		this._models.delete(key);
	}

	private disposeModel(model: CodeBlockTextModel) {
		if (model.type === 'complete') {
			model.value.then(ref => ref.dispose());
		} else {
			this.modelService.destroyModel(model.value.uri);
		}
	}

	clear(): void {
		this._models.forEach(async entry => this.disposeModel(entry.model));
		this._models.clear();
	}

	updateSync(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, content: CodeBlockContent): CodeBlockEntry {
		const entry = this.getOrCreate(sessionId, chat, codeBlockIndex);

		const extractedVulns = extractVulnerabilitiesFromText(content.text);
		const newText = fixCodeText(extractedVulns.newText, content.languageId);
		this.setVulns(sessionId, chat, codeBlockIndex, extractedVulns.vulnerabilities);

		const codeblockUri = extractCodeblockUrisFromText(newText);
		if (codeblockUri) {
			this.setCodemapperUri(sessionId, chat, codeBlockIndex, codeblockUri.uri);
		}

		if (content.isComplete) {
			this.markCodeBlockCompleted(sessionId, chat, codeBlockIndex);
		}

		return this.get(sessionId, chat, codeBlockIndex) ?? entry;
	}

	markCodeBlockCompleted(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): void {
		const entry = this._models.get(this.getKey(sessionId, chat, codeBlockIndex));
		if (!entry || entry.model.type === 'complete') {
			return;
		}

		this.disposeModel(entry.model);

		const uri = this.getCompletedModelUri(sessionId, chat, codeBlockIndex);
		const newModel = this.textModelService.createModelReference(uri);
		entry.model = { type: 'complete', value: newModel };
	}

	async update(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, content: CodeBlockContent): Promise<CodeBlockEntry> {
		const entry = this.getOrCreate(sessionId, chat, codeBlockIndex);

		const extractedVulns = extractVulnerabilitiesFromText(content.text);
		let newText = fixCodeText(extractedVulns.newText, content.languageId);
		this.setVulns(sessionId, chat, codeBlockIndex, extractedVulns.vulnerabilities);

		const codeblockUri = extractCodeblockUrisFromText(newText);
		if (codeblockUri) {
			this.setCodemapperUri(sessionId, chat, codeBlockIndex, codeblockUri.uri);
			newText = codeblockUri.textWithoutResult;
		}

		if (content.isComplete) {
			this.markCodeBlockCompleted(sessionId, chat, codeBlockIndex);
		}

		const textModel = await entry.model;
		if (textModel.isDisposed()) {
			return entry;
		}

		if (content.languageId) {
			const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(content.languageId);
			if (vscodeLanguageId && vscodeLanguageId !== textModel.getLanguageId()) {
				textModel.setLanguage(vscodeLanguageId);
			}
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

	private setCodemapperUri(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, codemapperUri: URI) {
		const entry = this._models.get(this.getKey(sessionId, chat, codeBlockIndex));
		if (entry) {
			entry.codemapperUri = codemapperUri;
		}
	}

	private setVulns(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, vulnerabilities: IMarkdownVulnerability[]) {
		const entry = this._models.get(this.getKey(sessionId, chat, codeBlockIndex));
		if (entry) {
			entry.vulns = vulnerabilities;
		}
	}

	private getKey(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, index: number): string {
		return `${sessionId}/${chat.id}/${index}`;
	}

	private getIncompleteModelUri(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, index: number): URI {
		return URI.from({
			scheme: Schemas.inMemory,
			authority: 'chat-code-block',
			path: `/${sessionId}/${chat.id}/${index}`
		});
	}

	private getCompletedModelUri(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, index: number): URI {
		const metadata = this.getUriMetaData(chat);
		return URI.from({
			scheme: Schemas.vscodeChatCodeBlock,
			authority: sessionId,
			path: `/${chat.id}/${index}`,
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
		if (!text.trim().startsWith('<')) {
			return `<?php\n${text}`;
		}
	}

	return text;
}
