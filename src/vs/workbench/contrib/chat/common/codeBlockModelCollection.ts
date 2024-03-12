/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IChatRequestViewModel, IChatResponseViewModel, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';


export class CodeBlockModelCollection extends Disposable {

	private readonly _models = new ResourceMap<Promise<IReference<IResolvedTextEditorModel>>>();

	constructor(
		@ITextModelService private readonly textModelService: ITextModelService
	) {
		super();
	}

	public override dispose(): void {
		super.dispose();
		this.clear();
	}

	get(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): Promise<IReference<IResolvedTextEditorModel>> | undefined {
		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		return this._models.get(uri);
	}

	getOrCreate(sessionId: string, chat: IChatRequestViewModel | IChatResponseViewModel, codeBlockIndex: number): Promise<IReference<IResolvedTextEditorModel>> {
		const existing = this.get(sessionId, chat, codeBlockIndex);
		if (existing) {
			return existing;
		}

		const uri = this.getUri(sessionId, chat, codeBlockIndex);
		const ref = this.textModelService.createModelReference(uri);
		this._models.set(uri, ref);
		return ref;
	}

	clear(): void {
		this._models.forEach(async (model) => (await model).dispose());
		this._models.clear();
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
				if (URI.isUri(ref.reference)) {
					return {
						uri: ref.reference.toJSON()
					};
				}

				return {
					uri: ref.reference.uri.toJSON(),
					range: ref.reference.range,
				};
			})
		};
	}
}
