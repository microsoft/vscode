/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IChatRequestViewModel, IChatResponseViewModel, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { extractVulnerabilitiesFromText, IMarkdownVulnerability } from './annotations';


export class CodeBlockModelCollection extends Disposable {

	private readonly _models = new ResourceMap<{
		readonly model: Promise<IReference<IResolvedTextEditorModel>>;
		vulns: readonly IMarkdownVulnerability[];
	}>();

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

	get(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): { model: Promise<IResolvedTextEditorModel>; readonly vulns: readonly IMarkdownVulnerability[] } | undefined {
		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		const entry = this._models.get(uri);
		if (!entry) {
			return;
		}
		return { model: entry.model.then(ref => ref.object), vulns: entry.vulns };
	}

	getOrCreate(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): { model: Promise<IResolvedTextEditorModel>; readonly vulns: readonly IMarkdownVulnerability[] } {
		const existing = this.get(sessionId, chat, codeBlockIndex);
		if (existing) {
			return existing;
		}

		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		const ref = this.textModelService.createModelReference(uri);
		this._models.set(uri, { model: ref, vulns: [] });
		return { model: ref.then(ref => ref.object), vulns: [] };
	}

	clear(): void {
		this._models.forEach(async entry => (await entry.model).dispose());
		this._models.clear();
	}

	async update(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number, content: { text: string; languageId?: string }) {
		const entry = this.getOrCreate(sessionId, chat, codeBlockIndex);

		const extractedVulns = extractVulnerabilitiesFromText(content.text);
		const newText = extractedVulns.newText;
		this.setVulns(sessionId, chat, codeBlockIndex, extractedVulns.vulnerabilities);

		const textModel = (await entry.model).textEditorModel;
		if (content.languageId) {
			const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(content.languageId);
			if (vscodeLanguageId && vscodeLanguageId !== textModel.getLanguageId()) {
				textModel.setLanguage(vscodeLanguageId);
			}
		}

		const currentText = textModel.getValue(EndOfLinePreference.LF);
		if (newText === currentText) {
			return;
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
