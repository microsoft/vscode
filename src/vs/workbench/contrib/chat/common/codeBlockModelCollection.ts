/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';


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

	get(sessionId: string, responseId: string, codeBlockIndex: number): Promise<IReference<IResolvedTextEditorModel>> | undefined {
		const uri = this.getUri(sessionId, responseId, codeBlockIndex);
		return this._models.get(uri);
	}

	getOrCreate(sessionId: string, responseId: string, codeBlockIndex: number): Promise<IReference<IResolvedTextEditorModel>> {
		const existing = this.get(sessionId, responseId, codeBlockIndex);
		if (existing) {
			return existing;
		}

		const uri = this.getUri(sessionId, responseId, codeBlockIndex);
		const ref = this.textModelService.createModelReference(uri);
		this._models.set(uri, ref);
		return ref;
	}

	clear(): void {
		this._models.forEach(async (model) => (await model).dispose());
		this._models.clear();
	}

	private getUri(sessionId: string, responseId: string, index: number): URI {
		return URI.from({ scheme: Schemas.vscodeChatCodeBlock, authority: sessionId, path: `/${responseId}/${index}` });
	}
}
