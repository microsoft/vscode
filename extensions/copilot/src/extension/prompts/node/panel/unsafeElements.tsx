/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { createFencedCodeBlock } from '../../../../util/common/markdown';

export type UnsafeCodeBlockProps = PromptElementProps<{
	code: string;
	languageId?: string;
	/**
	 * Invokes `code.trim()`
	 *
	 * @default true
	 */
	shouldTrim?: boolean;
	includeFilepath?: boolean;
	uri?: vscode.Uri;
}>;

/**
 * !!! WARNING: Do not use this element for text from user's code files, instead use `SafeCodeBlock` from {@link file://./safeElements.tsx} !!!
 */
export class UnsafeCodeBlock extends PromptElement<UnsafeCodeBlockProps> {
	constructor(props: UnsafeCodeBlockProps,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	async render() {
		const filePath = this.props.uri && this.props.includeFilepath ? this._promptPathRepresentationService.getFilePath(this.props.uri) : undefined;
		const code = createFencedCodeBlock(this.props.languageId ?? '', this.props.code, this.props.shouldTrim ?? true, filePath);
		return <TextChunk>
			{code}
		</TextChunk>;
	}
}
