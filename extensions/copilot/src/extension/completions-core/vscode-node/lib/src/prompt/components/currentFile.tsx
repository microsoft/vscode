/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { Position } from 'vscode-languageserver-protocol';
import { ComponentContext, PromptElementProps, Text } from '../../../../prompt/src/components/components';
import { DEFAULT_SUFFIX_MATCH_THRESHOLD } from '../../../../prompt/src/prompt';
import { findEditDistanceScore } from '../../../../prompt/src/suffixMatchCriteria';
import { getTokenizer, TokenizerName } from '../../../../prompt/src/tokenization';
import {
	CompletionRequestDocument,
	isCompletionRequestData,
} from '../completionsPromptFactory/componentsCompletionsPromptFactory';

/** The maximum number of tokens that is used for calculate edit distance. */
export const MAX_EDIT_DISTANCE_LENGTH = 50;

function approximateMaxCharacters(maxPromptLength: number): number {
	const maxCharsInPrompt = maxPromptLength * 4; // approximate 4 chars per token
	const compensation = maxPromptLength * 0.1; // 10% overflow to compensate the token approximation
	return Math.floor(maxCharsInPrompt + compensation);
}

/**
 * A required component for the CompletionsPromptRenderer. It represents the document and position where completions should be shown.
 */
export function CurrentFile(_props: PromptElementProps, context: ComponentContext) {
	const [document, setDocument] = context.useState<CompletionRequestDocument>();
	const [position, setPosition] = context.useState<Position>();
	const [maxPromptLength, setMaxPromptLength] = context.useState<number>(0);
	const [suffixMatchThreshold, setSuffixMatchThreshold] = context.useState<number>();
	const [tokenizer, setTokenizer] = context.useState<TokenizerName>();

	context.useData(isCompletionRequestData, request => {
		const requestDocument = request.document;
		if (request.document.uri !== document?.uri || requestDocument.getText() !== document?.getText()) {
			setDocument(requestDocument);
		}

		if (request.position !== position) {
			setPosition(request.position);
		}

		if (request.suffixMatchThreshold !== suffixMatchThreshold) {
			setSuffixMatchThreshold(request.suffixMatchThreshold);
		}

		if (request.maxPromptTokens !== maxPromptLength) {
			setMaxPromptLength(request.maxPromptTokens);
		}

		if (request.tokenizer !== tokenizer) {
			setTokenizer(request.tokenizer);
		}
	});

	const maxCharacters = approximateMaxCharacters(maxPromptLength);
	return (
		<>
			<BeforeCursor document={document} position={position} maxCharacters={maxCharacters} />
			<AfterCursor
				document={document}
				position={position}
				suffixMatchThreshold={suffixMatchThreshold}
				maxCharacters={maxCharacters}
				tokenizer={tokenizer}
			/>
		</>
	);
}

export function BeforeCursor(props: {
	document: CompletionRequestDocument | undefined;
	position: Position | undefined;
	maxCharacters: number;
}) {
	if (props.document === undefined || props.position === undefined) {
		return <Text />;
	}

	let text = props.document.getText({ start: { line: 0, character: 0 }, end: props.position });
	if (text.length > props.maxCharacters) {
		text = text.slice(-props.maxCharacters);
	}
	return <Text>{text}</Text>;
}

export function AfterCursor(
	props: {
		document: CompletionRequestDocument | undefined;
		position: Position | undefined;
		maxCharacters: number;
		suffixMatchThreshold?: number;
		tokenizer?: TokenizerName;
	},
	context: ComponentContext
) {
	const [cachedSuffix, setCachedSuffix] = context.useState<string>('');

	if (props.document === undefined || props.position === undefined) {
		return <Text />;
	}

	let suffix = props.document.getText({
		start: props.position,
		end: { line: Number.MAX_VALUE, character: Number.MAX_VALUE },
	});
	if (suffix.length > props.maxCharacters) {
		suffix = suffix.slice(0, props.maxCharacters);
	}

	// Start the suffix at the beginning of the next line. This allows for consistent reconciliation of trailing punctuation.
	const trimmedSuffix = suffix.replace(/^.*/, '').trimStart();
	if (trimmedSuffix === '') {
		return <Text />;
	}

	// Cache hit
	if (cachedSuffix === trimmedSuffix) {
		return <Text>{cachedSuffix}</Text>;
	}

	let suffixToUse = trimmedSuffix;
	if (cachedSuffix !== '') {
		const tokenizer = getTokenizer(props.tokenizer);
		const firstSuffixTokens = tokenizer.takeFirstTokens(trimmedSuffix, MAX_EDIT_DISTANCE_LENGTH);
		const cachedSuffixTokens = tokenizer.takeFirstTokens(cachedSuffix, MAX_EDIT_DISTANCE_LENGTH);
		// Check if the suffix is similar to the cached suffix.
		// See docs/suffix_caching.md for some background about why we do this.
		// This tries to avoid cases of incorrect suffix captured in https://github.com/microsoft/vscode/issues/295450
		if (firstSuffixTokens.tokens.length > 0 && cachedSuffixTokens.tokens.length > 0) {
			// Require the first token to match to prevent using a stale cached suffix
			// whose beginning has structurally changed (e.g., when content like a comment
			// opener `/**` shifts from the suffix into the prefix as the user types).
			const firstTokensMatch = firstSuffixTokens.tokens[0] === cachedSuffixTokens.tokens[0];
			if (firstTokensMatch) {
				// Calculate the distance between the computed and cached suffixed using Levenshtein distance.
				// Only compare the first MAX_EDIT_DISTANCE_LENGTH tokens to speed up.
				const dist = findEditDistanceScore(
					firstSuffixTokens.tokens,
					cachedSuffixTokens.tokens
				)?.score;
				if (
					100 * dist <
					(props.suffixMatchThreshold ?? DEFAULT_SUFFIX_MATCH_THRESHOLD) * firstSuffixTokens.tokens.length
				) {
					suffixToUse = cachedSuffix;
				}
			}
		}
	}

	// Only set the suffix if it's different from the cached one, otherwise we rerender this component all the time
	if (suffixToUse !== cachedSuffix) {
		setCachedSuffix(suffixToUse);
	}

	return <Text>{suffixToUse}</Text>;
}

export function DocumentPrefix(_props: PromptElementProps, context: ComponentContext) {
	const [document, setDocument] = context.useState<CompletionRequestDocument>();
	const [position, setPosition] = context.useState<Position>();
	const [maxPromptLength, setMaxPromptLength] = context.useState<number>(0);

	context.useData(isCompletionRequestData, request => {
		const requestDocument = request.document;
		if (request.document.uri !== document?.uri || requestDocument.getText() !== document?.getText()) {
			setDocument(requestDocument);
		}

		if (request.position !== position) {
			setPosition(request.position);
		}

		if (request.maxPromptTokens !== maxPromptLength) {
			setMaxPromptLength(request.maxPromptTokens);
		}
	});

	const maxCharacters = approximateMaxCharacters(maxPromptLength);

	return <BeforeCursor document={document} position={position} maxCharacters={maxCharacters} />;
}

export function DocumentSuffix(_props: PromptElementProps, context: ComponentContext) {
	const [document, setDocument] = context.useState<CompletionRequestDocument>();
	const [position, setPosition] = context.useState<Position>();
	const [maxPromptLength, setMaxPromptLength] = context.useState<number>(0);
	const [suffixMatchThreshold, setSuffixMatchThreshold] = context.useState<number>();
	const [tokenizer, setTokenizer] = context.useState<TokenizerName>();

	context.useData(isCompletionRequestData, request => {
		const requestDocument = request.document;
		if (request.document.uri !== document?.uri || requestDocument.getText() !== document?.getText()) {
			setDocument(requestDocument);
		}

		if (request.position !== position) {
			setPosition(request.position);
		}

		if (request.suffixMatchThreshold !== suffixMatchThreshold) {
			setSuffixMatchThreshold(request.suffixMatchThreshold);
		}

		if (request.maxPromptTokens !== maxPromptLength) {
			setMaxPromptLength(request.maxPromptTokens);
		}

		if (request.tokenizer !== tokenizer) {
			setTokenizer(request.tokenizer);
		}
	});
	const maxCharacters = approximateMaxCharacters(maxPromptLength);
	return (
		<AfterCursor
			document={document}
			position={position}
			suffixMatchThreshold={suffixMatchThreshold}
			maxCharacters={maxCharacters}
			tokenizer={tokenizer}
		/>
	);
}
