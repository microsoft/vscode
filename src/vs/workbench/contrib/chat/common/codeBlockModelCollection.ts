/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { EndOfLinePreference } from '../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { extractCodeblockUrisFromText, extractVulnerabilitiesFromText, IMarkdownVulnerability } from './annotations.js';
import { IChatRequestViewModel, IChatResponseViewModel, isResponseVM } from './chatViewModel.js';


export class CodeBlockModelCollection extends Disposable {

	private readonly _models = new ResourceMap<{
		readonly model: Promise<IReference<IResolvedTextEditorModel>>;
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
		@ITextModelService private readonly textModelService: ITextModelService
	) {
		super();
	}

	public override dispose(): void {
		super.dispose();
		this.clear();
	}

	get(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): { model: Promise<IResolvedTextEditorModel>; readonly vulns: readonly IMarkdownVulnerability[]; readonly codemapperUri?: URI } | undefined {
		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		const entry = this._models.get(uri);
		if (!entry) {
			return;
		}
		return { model: entry.model.then(ref => ref.object), vulns: entry.vulns, codemapperUri: entry.codemapperUri };
	}

	getOrCreate(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): { model: Promise<IResolvedTextEditorModel>; readonly vulns: readonly IMarkdownVulnerability[]; readonly codemapperUri?: URI } {
		const existing = this.get(sessionId, chat, codeBlockIndex);
		if (existing) {
			return existing;
		}

		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		const ref = this.textModelService.createModelReference(uri);
		this._models.set(uri, { model: ref, vulns: [], codemapperUri: undefined });

		while (this._models.size > this.maxModelCount) {
			const first = Array.from(this._models.keys()).at(0);
			if (!first) {
				break;
			}
			this.delete(first);
		}

		return { model: ref.then(ref => ref.object), vulns: [], codemapperUri: undefined };
	}

	private delete(codeBlockUri: URI) {
		const entry = this._models.get(codeBlockUri);
		if (!entry) {
			return;
		}

		entry.model.then(ref => ref.dispose());
		this._models.delete(codeBlockUri);
	}

	clear(): void {
		this._models.forEach(async entry => (await entry.model).dispose());
		this._models.clear();
	}

	updateSync(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, content: { text: string; languageId?: string }) {
		const entry = this.getOrCreate(sessionId, chat, codeBlockIndex);

		const extractedVulns = extractVulnerabilitiesFromText(content.text);
		const newText = fixCodeText(extractedVulns.newText, content.languageId);
		this.setVulns(sessionId, chat, codeBlockIndex, extractedVulns.vulnerabilities);

		const codeblockUri = extractCodeblockUrisFromText(newText);
		if (codeblockUri) {
			this.setCodemapperUri(sessionId, chat, codeBlockIndex, codeblockUri.uri);
		}

		return this.get(sessionId, chat, codeBlockIndex) ?? entry;
	}

	async update(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, content: { text: string; languageId?: string }) {
		const entry = this.getOrCreate(sessionId, chat, codeBlockIndex);

		const extractedVulns = extractVulnerabilitiesFromText(content.text);
		let newText = fixCodeText(extractedVulns.newText, content.languageId);
		this.setVulns(sessionId, chat, codeBlockIndex, extractedVulns.vulnerabilities);

		const codeblockUri = extractCodeblockUrisFromText(newText);
		if (codeblockUri) {
			this.setCodemapperUri(sessionId, chat, codeBlockIndex, codeblockUri.uri);
			newText = codeblockUri.textWithoutResult;
		}

		const textModel = (await entry.model).textEditorModel;
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
		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		const entry = this._models.get(uri);
		if (entry) {
			entry.codemapperUri = codemapperUri;
		}
	}

	private setVulns(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, vulnerabilities: IMarkdownVulnerability[]) {
		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		const entry = this._models.get(uri);
		if (entry) {
			entry.vulns = vulnerabilities;
		}
	}

	private getUri(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, index: number): URI {
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
