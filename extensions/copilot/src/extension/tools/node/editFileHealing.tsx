// Copyright 2025 Google LLC
//
// This is adapted from the edit corrector in the Gemini CLI which can be found
// at https://github.com/google-gemini/gemini-cli/blob/5008aea90d4ea7ac6bb5872f3702f3c7a7878ed0/packages/core/src/utils/editCorrector.ts
// and is available under the following license:
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//        http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// eslint-disable-next-line header/header
import { Raw } from '@vscode/prompt-tsx';
import * as JSONC from 'jsonc-parser';
import type { LanguageModelChat } from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes.js';
import { ObjectJsonSchema } from '../../../platform/configuration/common/jsonSchema.js';
import { isHiddenModelF } from '../../../platform/endpoint/common/chatModelCapabilities.js';
import { IChatEndpoint } from '../../../platform/networking/common/networking.js';
import { extractCodeBlocks } from '../../../util/common/markdown.js';
import { CancellationToken } from '../../../util/vs/base/common/cancellation.js';
import { count } from '../../../util/vs/base/common/strings.js';
import { findAndReplaceOne } from './editFileToolUtils.js';
import { IReplaceStringToolParams } from './replaceStringTool.js';

/**
 * Defines the structure of the parameters within CorrectedEditResult
 */
interface CorrectedEditParams {
	filePath: string;
	oldString: string;
	newString: string;
}

/**
 * Defines the result structure for ensureCorrectEdit.
 */
export interface CorrectedEditResult {
	params: CorrectedEditParams;
	occurrences: number;
}

function matchAndCount(currentContent: string, oldString: string, eol: string) {
	const r = findAndReplaceOne(currentContent, oldString, '<none>', eol);
	return r.type === 'multiple' ? r.matchPositions.length : r.editPosition.length;
}

/**
 * Attempts to correct edit parameters if the original oldString is not found.
 * It tries unescaping, and then LLM-based correction.
 * Results are cached to avoid redundant processing.
 *
 * @param currentContent The current content of the file.
 * @param originalParams The original EditToolParams
 * @param healEndpoint The GeminiClient for LLM calls.
 * @returns A promise resolving to an object containing the (potentially corrected)
 *          EditToolParams (as CorrectedEditParams) and the final occurrences count.
 */
export async function healReplaceStringParams(
	model: LanguageModelChat | undefined,
	currentContent: string,
	originalParams: IReplaceStringToolParams & { expected_replacements?: number }, // This is the EditToolParams from edit.ts, without \'corrected\'
	eol: string,
	healEndpoint: IChatEndpoint,
	token: CancellationToken,
): Promise<CorrectedEditResult> {
	let finalNewString = originalParams.newString!;
	const unescapeStringForGeminiBug = model?.family.toLowerCase().includes('gemini') || (model && isHiddenModelF(model)) ? _unescapeStringForGeminiBug : (s: string) => s;
	const newStringPotentiallyEscaped =
		unescapeStringForGeminiBug(originalParams.newString!) !==
		originalParams.newString;

	const expectedReplacements = originalParams.expected_replacements ?? 1;

	let finalOldString = originalParams.oldString!;
	let occurrences = count(currentContent, finalOldString);

	if (occurrences === expectedReplacements) {
		if (newStringPotentiallyEscaped) {
			finalNewString = await correctNewStringEscaping(
				healEndpoint,
				finalOldString,
				originalParams.newString!,
				token,
			);
		}
	} else if (occurrences > expectedReplacements) {
		const expectedReplacements = originalParams.expected_replacements ?? 1;

		// If user expects multiple replacements, return as-is
		if (occurrences === expectedReplacements) {
			const result: CorrectedEditResult = {
				params: { ...originalParams },
				occurrences,
			};
			return result;
		}

		// If user expects 1 but found multiple, try to correct (existing behavior)
		if (expectedReplacements === 1) {
			const result: CorrectedEditResult = {
				params: { ...originalParams },
				occurrences,
			};
			return result;
		}

		// If occurrences don't match expected, return as-is (will fail validation later)
		const result: CorrectedEditResult = {
			params: { ...originalParams },
			occurrences,
		};
		return result;
	} else {
		// occurrences is 0 or some other unexpected state initially
		const unescapedOldStringAttempt = unescapeStringForGeminiBug(
			originalParams.oldString,
		);
		occurrences = matchAndCount(currentContent, unescapedOldStringAttempt, eol);

		if (occurrences === expectedReplacements) {
			finalOldString = unescapedOldStringAttempt;
			if (newStringPotentiallyEscaped) {
				finalNewString = await correctNewString(
					healEndpoint,
					originalParams.oldString, // original old
					unescapedOldStringAttempt, // corrected old
					originalParams.newString, // original new (which is potentially escaped)
					token,
				);
			}
		} else if (occurrences === 0) {
			const llmCorrectedOldString = await correctOldStringMismatch(
				healEndpoint,
				currentContent,
				unescapedOldStringAttempt,
				token,
			);
			const llmOldOccurrences = matchAndCount(
				currentContent,
				llmCorrectedOldString,
				eol,
			);

			if (llmOldOccurrences === expectedReplacements) {
				finalOldString = llmCorrectedOldString;
				occurrences = llmOldOccurrences;

				if (newStringPotentiallyEscaped) {
					const baseNewStringForLLMCorrection = unescapeStringForGeminiBug(
						originalParams.newString,
					);
					finalNewString = await correctNewString(
						healEndpoint,
						originalParams.oldString, // original old
						llmCorrectedOldString, // corrected old
						baseNewStringForLLMCorrection, // base new for correction
						token,
					);
				}
			} else {
				// LLM correction also failed for oldString
				const result: CorrectedEditResult = {
					params: { ...originalParams },
					occurrences: 0, // Explicitly 0 as LLM failed
				};
				return result;
			}
		} else {
			// Unescaping oldString resulted in > 1 occurrences
			const result: CorrectedEditResult = {
				params: { ...originalParams },
				occurrences, // This will be > 1
			};
			return result;
		}
	}

	const { targetString, pair } = trimPairIfPossible(
		finalOldString,
		finalNewString,
		currentContent,
		expectedReplacements,
	);
	finalOldString = targetString;
	finalNewString = pair;

	// Final result construction
	const result: CorrectedEditResult = {
		params: {
			filePath: originalParams.filePath,
			oldString: finalOldString,
			newString: finalNewString,
		},
		occurrences: count(currentContent, finalOldString), // Recalculate occurrences with the final oldString
	};
	return result;
}

// Define the expected JSON schema for the LLM response for oldString correction
const oldString_CORRECTION_SCHEMA: ObjectJsonSchema = {
	type: 'object',
	properties: {
		corrected_target_snippet: {
			type: 'string',
			description:
				'The corrected version of the target snippet that exactly and uniquely matches a segment within the provided file content.',
		},
	},
	required: ['corrected_target_snippet'],
};

export async function correctOldStringMismatch(
	healEndpoint: IChatEndpoint,
	fileContent: string,
	problematicSnippet: string,
	token: CancellationToken,
): Promise<string> {
	const prompt = `
Context: A process needs to find an exact literal, unique match for a specific text snippet within a file's content. The provided snippet failed to match exactly. This is most likely because it has been overly escaped.

Task: Analyze the provided file content and the problematic target snippet. Identify the segment in the file content that the snippet was *most likely* intended to match. Output the *exact*, literal text of that segment from the file content. Focus *only* on removing extra escape characters and correcting formatting, whitespace, or minor differences to achieve a PERFECT literal match. The output must be the exact literal text as it appears in the file.

Problematic target snippet:
\`\`\`
${problematicSnippet}
\`\`\`

File Content:
\`\`\`
${fileContent}
\`\`\`

For example, if the problematic target snippet was "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" and the file content had content that looked like "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;", then corrected_target_snippet should likely be "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;" to fix the incorrect escaping to match the original file content.
If the differences are only in whitespace or formatting, apply similar whitespace/formatting changes to the corrected_target_snippet.

Return ONLY the corrected target snippet in the specified JSON format with the key 'corrected_target_snippet'. If no clear, unique match can be found, return an empty string for 'corrected_target_snippet'.
`.trim();

	try {
		const result = await getJsonResponse(healEndpoint, prompt, oldString_CORRECTION_SCHEMA, { corrected_target_snippet: '<corrected target snippet here>' }, token);
		if (
			result &&
			typeof result.corrected_target_snippet === 'string' &&
			result.corrected_target_snippet.length > 0
		) {
			return result.corrected_target_snippet;
		} else {
			return problematicSnippet;
		}
	} catch (error) {
		return problematicSnippet;
	}
}

// Define the expected JSON schema for the newString correction LLM response
const newString_CORRECTION_SCHEMA: ObjectJsonSchema = {
	type: 'object',
	properties: {
		corrected_newString: {
			type: 'string',
			description:
				'The original_newString adjusted to be a suitable replacement for the corrected_oldString, while maintaining the original intent of the change.',
		},
	},
	required: ['corrected_newString'],
};

/**
 * Adjusts the newString to align with a corrected oldString, maintaining the original intent.
 */
export async function correctNewString(
	endpoint: IChatEndpoint,
	originalOldString: string,
	correctedOldString: string,
	originalNewString: string,
	token: CancellationToken,
): Promise<string> {
	if (originalOldString === correctedOldString) {
		return originalNewString;
	}

	const prompt = `
Context: A text replacement operation was planned. The original text to be replaced (original_oldString) was slightly different from the actual text in the file (corrected_oldString). The original_oldString has now been corrected to match the file content.
We now need to adjust the replacement text (original_newString) so that it makes sense as a replacement for the corrected_oldString, while preserving the original intent of the change.

original_oldString (what was initially intended to be found):
\`\`\`
${originalOldString}
\`\`\`

corrected_oldString (what was actually found in the file and will be replaced):
\`\`\`
${correctedOldString}
\`\`\`

original_newString (what was intended to replace original_oldString):
\`\`\`
${originalNewString}
\`\`\`

Task: Based on the differences between original_oldString and corrected_oldString, and the content of original_newString, generate a corrected_newString. This corrected_newString should be what original_newString would have been if it was designed to replace corrected_oldString directly, while maintaining the spirit of the original transformation.

For example, if original_oldString was "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" and corrected_oldString is "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;", and original_newString was "\\\\\\nconst greeting = \`Hello \\\\\`\${name} \${lastName}\\\\\`\`;", then corrected_newString should likely be "\nconst greeting = \`Hello ${'\\`'}\${name} \${lastName}${'\\`'}\`;" to fix the incorrect escaping.
If the differences are only in whitespace or formatting, apply similar whitespace/formatting changes to the corrected_newString.

Return ONLY the corrected string in the specified JSON format with the key 'corrected_newString'. If no adjustment is deemed necessary or possible, return the original_newString.
  `.trim();

	try {
		const result = await getJsonResponse(endpoint, prompt, newString_CORRECTION_SCHEMA, { corrected_newString: '<corrected newString here>' }, token);
		if (
			result &&
			typeof result.corrected_newString === 'string' &&
			result.corrected_newString.length > 0
		) {
			return result.corrected_newString;
		} else {
			return originalNewString;
		}
	} catch (error) {
		return originalNewString;
	}
}

const CORRECT_newString_ESCAPING_SCHEMA: ObjectJsonSchema = {
	type: 'object',
	properties: {
		corrected_newString_escaping: {
			type: 'string',
			description:
				'The newString with corrected escaping, ensuring it is a proper replacement for the oldString, especially considering potential over-escaping issues from previous LLM generations.',
		},
	},
	required: ['corrected_newString_escaping'],
};

export async function correctNewStringEscaping(
	geminiClient: IChatEndpoint,
	oldString: string,
	potentiallyProblematicNewString: string,
	token: CancellationToken,
): Promise<string> {
	const prompt = `
Context: A text replacement operation is planned. The text to be replaced (oldString) has been correctly identified in the file. However, the replacement text (newString) might have been improperly escaped by a previous LLM generation (e.g. too many backslashes for newlines like \\n instead of \n, or unnecessarily quotes like \\"Hello\\" instead of "Hello").

oldString (this is the exact text that will be replaced):
\`\`\`
${oldString}
\`\`\`

potentially_problematic_newString (this is the text that should replace oldString, but MIGHT have bad escaping, or might be entirely correct):
\`\`\`
${potentiallyProblematicNewString}
\`\`\`

Task: Analyze the potentially_problematic_newString. If it's syntactically invalid due to incorrect escaping (e.g., "\n", "\t", "\\", "\\'", "\\""), correct the invalid syntax. The goal is to ensure the newString, when inserted into the code, will be a valid and correctly interpreted.

For example, if oldString is "foo" and potentially_problematic_newString is "bar\\nbaz", the corrected_newString_escaping should be "bar\nbaz".
If potentially_problematic_newString is console.log(\\"Hello World\\"), it should be console.log("Hello World").

Return ONLY the corrected string in the specified JSON format with the key 'corrected_newString_escaping'. If no escaping correction is needed, return the original potentially_problematic_newString.
  `.trim();

	try {
		const result = await getJsonResponse(geminiClient, prompt, CORRECT_newString_ESCAPING_SCHEMA, { corrected_newString_escaping: '<corrected newString here>' }, token);
		if (
			result &&
			typeof result.corrected_newString_escaping === 'string' &&
			result.corrected_newString_escaping.length > 0
		) {
			return result.corrected_newString_escaping;
		} else {
			return potentiallyProblematicNewString;
		}
	} catch (error) {
		return potentiallyProblematicNewString;
	}
}

const CORRECT_STRING_ESCAPING_SCHEMA: ObjectJsonSchema = {
	type: 'object',
	properties: {
		corrected_string_escaping: {
			type: 'string',
			description:
				'The string with corrected escaping, ensuring it is valid, specially considering potential over-escaping issues from previous LLM generations.',
		},
	},
	required: ['corrected_string_escaping'],
};

async function getJsonResponse(endpoint: IChatEndpoint, prompt: string, schema: ObjectJsonSchema, example: object, token: CancellationToken) {
	prompt += `\n\nYour response must follow the JSON format:

	\`\`\`
${JSON.stringify(schema, null, 2)}
\`\`\`

For example: ${JSON.stringify(example)}
`.trim();

	const contents: Raw.ChatMessage[] = [
		// Some system message to avoid tripping CAPI
		{ role: Raw.ChatRole.System, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'You are an expert at analyzing files and patterns.' }] },
		{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: prompt }] },
	];

	const result = await endpoint.makeChatRequest2({
		debugName: 'healStringReplace',
		messages: contents,
		finishedCb: undefined,
		location: ChatLocation.Other,
		enableRetryOnFilter: true,
	}, token);

	if (result.type !== ChatFetchResponseType.Success) {
		return undefined;
	}

	for (const block of extractCodeBlocks(result.value)) {
		try {
			return JSONC.parse(block.code);
		} catch {
			// ignored
		}
	}

	const idx = result.value.indexOf('{');
	return JSONC.parse(result.value.slice(idx)) || undefined;
}

export async function correctStringEscaping(
	potentiallyProblematicString: string,
	endpoint: IChatEndpoint,
	token: CancellationToken,
): Promise<string> {
	const prompt = `
Context: An LLM has just generated potentially_problematic_string and the text might have been improperly escaped (e.g. too many backslashes for newlines like \\n instead of \n, or unnecessarily quotes like \\"Hello\\" instead of "Hello").

potentially_problematic_string (this text MIGHT have bad escaping, or might be entirely correct):
\`\`\`
${potentiallyProblematicString}
\`\`\`

Task: Analyze the potentially_problematic_string. If it's syntactically invalid due to incorrect escaping (e.g., "\n", "\t", "\\", "\\'", "\\""), correct the invalid syntax. The goal is to ensure the text will be a valid and correctly interpreted.

For example, if potentially_problematic_string is "bar\\nbaz", the corrected_newString_escaping should be "bar\nbaz".
If potentially_problematic_string is console.log(\\"Hello World\\"), it should be console.log("Hello World").

Return ONLY the corrected string in the specified JSON format with the key 'corrected_string_escaping'. If no escaping correction is needed, return the original potentially_problematic_string.
  `.trim();


	try {
		const result = await getJsonResponse(endpoint, prompt, CORRECT_STRING_ESCAPING_SCHEMA, { corrected_string_escaping: '<corrected string here>' }, token);

		if (
			result &&
			typeof result.corrected_string_escaping === 'string' &&
			result.corrected_string_escaping.length > 0
		) {
			return result.corrected_string_escaping;
		} else {
			return potentiallyProblematicString;
		}
	} catch (error) {
		return potentiallyProblematicString;
	}
}

function trimPairIfPossible(
	target: string,
	trimIfTargetTrims: string,
	currentContent: string,
	expectedReplacements: number,
) {
	const trimmedTargetString = target.trim();
	if (target.length !== trimmedTargetString.length) {
		const trimmedTargetOccurrences = count(
			currentContent,
			trimmedTargetString,
		);

		if (trimmedTargetOccurrences === expectedReplacements) {
			const trimmedReactiveString = trimIfTargetTrims.trim();
			return {
				targetString: trimmedTargetString,
				pair: trimmedReactiveString,
			};
		}
	}

	return {
		targetString: target,
		pair: trimIfTargetTrims,
	};
}

/**
 * Unescapes a string that might have been overly escaped by an LLM.
 */
export function _unescapeStringForGeminiBug(inputString: string): string {
	// Regex explanation:
	// \\ : Matches exactly one literal backslash character.
	// (n|t|r|'|"|`|\\|\n) : This is a capturing group. It matches one of the following:
	//   n, t, r, ', ", ` : These match the literal characters 'n', 't', 'r', single quote, double quote, or backtick.
	//                       This handles cases like "\\n", "\\`", etc.
	//   \\ : This matches a literal backslash. This handles cases like "\\\\" (escaped backslash).
	//   \n : This matches an actual newline character. This handles cases where the input
	//        string might have something like "\\\n" (a literal backslash followed by a newline).
	// g : Global flag, to replace all occurrences.

	return inputString.replace(
		/\\+(n|t|r|'|"|`|\\|\n)/g,
		(match, capturedChar) => {
			// 'match' is the entire erroneous sequence, e.g., if the input (in memory) was "\\\\`", match is "\\\\`".
			// 'capturedChar' is the character that determines the true meaning, e.g., '`'.

			switch (capturedChar) {
				case 'n':
					return '\n'; // Correctly escaped: \n (newline character)
				case 't':
					return '\t'; // Correctly escaped: \t (tab character)
				case 'r':
					return '\r'; // Correctly escaped: \r (carriage return character)
				case `'`:
					return `'`; // Correctly escaped: ' (apostrophe character)
				case '"':
					return '"'; // Correctly escaped: " (quotation mark character)
				case '`':
					return '`'; // Correctly escaped: ` (backtick character)
				case '\\': // This handles when 'capturedChar' is a literal backslash
					return '\\'; // Replace escaped backslash (e.g., "\\\\") with single backslash
				case '\n': // This handles when 'capturedChar' is an actual newline
					return '\n'; // Replace the whole erroneous sequence (e.g., "\\\n" in memory) with a clean newline
				default:
					// This fallback should ideally not be reached if the regex captures correctly.
					// It would return the original matched sequence if an unexpected character was captured.
					return match;
			}
		},
	);
}
