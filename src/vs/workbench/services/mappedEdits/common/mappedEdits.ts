/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';

export interface RelatedContextItem {
	readonly uri: URI;
	readonly range: Range;
}

export interface MappedEditsContext {
	selections: Selection[];

	/**
	 * If there's no context, the array should be empty. It's also empty until we figure out how to compute this or retrieve from an extension (eg, copilot chat)
	 *
	 * TODO@ulugbekna: should this array be sorted from highest priority to lowest?
	 */
	related: RelatedContextItem[];
}

export interface IMappedEditsProvider {

	selector: LanguageSelector;

	/**
	 * Provide mapped edits for a given document.
	 *
	 * @param document The document to provide mapped edits for.
	 * @param codeBlocks Code blocks that come from an LLM's reply.
	 * 						"Insert at cursor" in the panel chat only sends one edit that the user clicks on, but inline chat can send multiple blocks and let the lang server decide what to do with them.
	 * @param context The context for providing mapped edits.
	 * @param token A cancellation token.
	 * @returns A provider result of text edits.
	 */
	provideMappedEdits(
		document: ITextModel,
		codeBlocks: string[],
		context: MappedEditsContext,
		token: CancellationToken
	): Promise<WorkspaceEdit | null>;
}


export const IMappedEditsService = createDecorator<IMappedEditsService>('mappedEditsService');

export interface IMappedEditsService {
	_serviceBrand: undefined;
	registerMappedEditsProvider(provider: IMappedEditsProvider): IDisposable;
	provideMappedEdits(
		document: ITextModel,
		codeBlocks: string[],
		context: MappedEditsContext,
		token: CancellationToken): Promise<WorkspaceEdit | null>;
}
