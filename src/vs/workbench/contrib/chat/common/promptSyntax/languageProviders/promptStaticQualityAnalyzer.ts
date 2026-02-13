/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../../editor/common/model.js';
import { IMarkerData, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { localize } from '../../../../../../nls.js';
import { STRENGTH_PATTERNS, WEAK_TO_STRONG, AMBIGUOUS_QUANTIFIERS, QUANTIFIER_SUGGESTIONS, CHARS_PER_TOKEN } from './promptQualityConstants.js';

const VAGUE_TERMS: readonly string[] = [
	'appropriate', 'professional', 'good', 'bad', 'nice', 'proper', 'suitable', 'reasonable', 'adequate',
];

/**
 * Common runtime context variables that are typically injected at runtime
 * and should not be flagged as undefined.
 */
const COMMON_CONTEXT_VARIABLES = new Set([
	'user_input', 'user_name', 'context', 'input', 'query',
	'message', 'date', 'time', 'user', 'file', 'selection',
	'language', 'workspace', 'repo', 'branch',
]);

/**
 * Static quality analyzer for prompt/agent/instruction files.
 *
 * Detects instruction-strength issues, ambiguous language, structural
 * problems, redundancy, and missing examples \u2014 all without hitting an LLM.
 */
export class PromptStaticQualityAnalyzer {

	/**
	 * Run the full suite of static quality checks on the body text of a
	 * prompt file. The `bodyStartLine` is the 1-based line number where the
	 * body begins so that reported ranges align with the real model.
	 */
	public analyze(model: ITextModel, bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		const lineCount = model.getLineCount();
		const lines: string[] = [];
		for (let i = bodyStartLine; i <= lineCount; i++) {
			lines.push(model.getLineContent(i));
		}

		this.analyzeVariables(lines, bodyStartLine, report);
		this.analyzeInstructionStrength(lines, bodyStartLine, report);
		this.analyzeAmbiguity(lines, bodyStartLine, report);
		this.analyzeStructure(lines, bodyStartLine, report);
		this.analyzeRedundancy(lines, bodyStartLine, report);
		this.analyzeExamples(lines, bodyStartLine, report);
		this.analyzeTokenUsage(lines, bodyStartLine, report);
	}

	// --- Instruction strength --------------------------------------------------

	private analyzeInstructionStrength(lines: string[], bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNumber = bodyStartLine + i;
			for (const weakPattern of STRENGTH_PATTERNS.weak) {
				const regex = new RegExp(`\\b${weakPattern}\\b`, 'gi');
				let match: RegExpExecArray | null;
				while ((match = regex.exec(line)) !== null) {
					const suggestion = WEAK_TO_STRONG[match[0].toLowerCase()] ?? 'Must';
					report({
						severity: MarkerSeverity.Info,
						message: localize(
							'promptQuality.weakInstruction',
							"Weak instruction language: \"{0}\". Consider using \"{1}\" for more consistent model behavior.",
							match[0],
							suggestion,
						),
						startLineNumber: lineNumber,
						startColumn: match.index + 1,
						endLineNumber: lineNumber,
						endColumn: match.index + match[0].length + 1,
						code: `prompt-quality-weak-instruction:suggestion:${suggestion}`,
					});
				}
			}
		}

		// Check for too many competing constraints
		let constraintCount = 0;
		const constraintWords = [...STRENGTH_PATTERNS.strong, ...STRENGTH_PATTERNS.medium];
		for (const line of lines) {
			const lowerLine = line.toLowerCase();
			if (constraintWords.some(w => lowerLine.includes(w))) {
				constraintCount++;
			}
		}
		if (constraintCount > 15) {
			report({
				severity: MarkerSeverity.Warning,
				message: localize(
					'promptQuality.instructionDilution',
					"High number of constraints ({0}). Too many competing instructions may dilute their effectiveness \u2014 consider consolidating.",
					constraintCount,
				),
				startLineNumber: bodyStartLine,
				startColumn: 1,
				endLineNumber: bodyStartLine,
				endColumn: 2,
				code: 'prompt-quality-instruction-dilution',
			});
		}
	}

	// --- Ambiguity detection ---------------------------------------------------

	private analyzeAmbiguity(lines: string[], bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNumber = bodyStartLine + i;

			for (const quantifier of AMBIGUOUS_QUANTIFIERS) {
				const regex = new RegExp(`\\b${quantifier}\\b`, 'gi');
				let match: RegExpExecArray | null;
				while ((match = regex.exec(line)) !== null) {
					const quantifierSuggestion = QUANTIFIER_SUGGESTIONS[match[0].toLowerCase()] ?? 'a specific value';
					report({
						severity: MarkerSeverity.Info,
						message: localize(
							'promptQuality.ambiguousQuantifier',
							"Ambiguous quantifier: \"{0}\". The model may interpret this inconsistently \u2014 consider specifying \"{1}\".",
							match[0],
							quantifierSuggestion,
						),
						startLineNumber: lineNumber,
						startColumn: match.index + 1,
						endLineNumber: lineNumber,
						endColumn: match.index + match[0].length + 1,
						code: `prompt-quality-ambiguous-quantifier:suggestion:${quantifierSuggestion}`,
					});
				}
			}

			for (const term of VAGUE_TERMS) {
				const regex = new RegExp(`\\bbe ${term}\\b|\\bin a ${term}\\b`, 'gi');
				let match: RegExpExecArray | null;
				while ((match = regex.exec(line)) !== null) {
					report({
						severity: MarkerSeverity.Info,
						message: localize(
							'promptQuality.vagueTerm',
							"Vague term: \"{0}\". Define what this means specifically for your use case.",
							match[0],
						),
						startLineNumber: lineNumber,
						startColumn: match.index + 1,
						endLineNumber: lineNumber,
						endColumn: match.index + match[0].length + 1,
						code: 'prompt-quality-vague-term',
					});
				}
			}

			// Unresolved positional references
			const unresolvedPatterns = [
				/\b(?:mentioned|described|shown|listed|given)\s+(?:above|below|earlier|previously|before)\b/gi,
				/\bthe\s+(?:above|below|following|preceding)\s+(?:format|example|instructions?|rules?|guidelines?)\b/gi,
				/\bsee\s+(?:above|below)\b/gi,
				/\bas\s+(?:mentioned|described|stated)\b/gi,
			];
			for (const pattern of unresolvedPatterns) {
				let match: RegExpExecArray | null;
				while ((match = pattern.exec(line)) !== null) {
					report({
						severity: MarkerSeverity.Info,
						message: localize(
							'promptQuality.unresolvedReference',
							"Potentially unresolved reference: \"{0}\". Ensure the referenced content exists and is clear.",
							match[0],
						),
						startLineNumber: lineNumber,
						startColumn: match.index + 1,
						endLineNumber: lineNumber,
						endColumn: match.index + match[0].length + 1,
						code: 'prompt-quality-unresolved-reference',
					});
				}
			}
		}
	}

	// --- Structure linting -----------------------------------------------------

	private analyzeStructure(lines: string[], bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		const text = lines.join('\n');

		const hasXmlTags = /<[a-z]+>/i.test(text);
		const hasMarkdownHeaders = /^#{1,6}\s+/m.test(text);

		if (hasXmlTags && hasMarkdownHeaders) {
			report({
				severity: MarkerSeverity.Info,
				message: localize(
					'promptQuality.mixedConventions',
					"Mixed XML and Markdown formatting detected. Consider using a consistent convention throughout.",
				),
				startLineNumber: bodyStartLine,
				startColumn: 1,
				endLineNumber: bodyStartLine,
				endColumn: 2,
				code: 'prompt-quality-mixed-conventions',
			});
		}

		// Check for mismatched XML tags
		const openTags = new Map<string, number>();
		const closeTags = new Map<string, number>();

		let match: RegExpExecArray | null;
		const xmlOpen = /<([a-z_]+)>/gi;
		while ((match = xmlOpen.exec(text)) !== null) {
			const tag = match[1].toLowerCase();
			openTags.set(tag, (openTags.get(tag) ?? 0) + 1);
		}
		const xmlClose = /<\/([a-z_]+)>/gi;
		while ((match = xmlClose.exec(text)) !== null) {
			const tag = match[1].toLowerCase();
			closeTags.set(tag, (closeTags.get(tag) ?? 0) + 1);
		}

		for (const [tag, count] of openTags) {
			const closeCount = closeTags.get(tag) ?? 0;
			if (count !== closeCount) {
				report({
					severity: MarkerSeverity.Warning,
					message: localize(
						'promptQuality.unclosedTag',
						"Mismatched XML tag: <{0}> appears {1} time(s) but </{0}> appears {2} time(s).",
						tag,
						count,
						closeCount,
					),
					startLineNumber: bodyStartLine,
					startColumn: 1,
					endLineNumber: bodyStartLine,
					endColumn: 2,
					code: 'prompt-quality-unclosed-tag',
				});
			}
		}
	}

	// --- Redundancy detection --------------------------------------------------

	private analyzeRedundancy(lines: string[], bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		const instructionPatterns = new Map<string, number[]>();
		const instructionRegex = /\b(?:must|should|always|never|avoid|do not|don't)\s+([^.!?]+)/gi;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let match: RegExpExecArray | null;
			while ((match = instructionRegex.exec(line)) !== null) {
				const normalized = match[1].toLowerCase().trim().replace(/\s+/g, ' ');
				if (normalized.length > 10) {
					const existing = instructionPatterns.get(normalized) ?? [];
					existing.push(i);
					instructionPatterns.set(normalized, existing);
				}
			}
		}

		for (const [, lineIndices] of instructionPatterns) {
			if (lineIndices.length > 1) {
				const displayLines = lineIndices.map(l => l + bodyStartLine);
				report({
					severity: MarkerSeverity.Info,
					message: localize(
						'promptQuality.redundantInstruction',
						"Similar instruction appears {0} times (lines {1}). Consider consolidating.",
						lineIndices.length,
						displayLines.join(', '),
					),
					startLineNumber: lineIndices[0] + bodyStartLine,
					startColumn: 1,
					endLineNumber: lineIndices[0] + bodyStartLine,
					endColumn: (lines[lineIndices[0]]?.length ?? 0) + 1,
					code: 'prompt-quality-redundant-instruction',
				});
			}
		}

		// "Never X" subsumes "Avoid X"
		const neverPatterns: { text: string; line: number }[] = [];
		const avoidPatterns: { text: string; line: number }[] = [];

		for (let i = 0; i < lines.length; i++) {
			const neverMatch = lines[i].match(/never\s+([^.!?]+)/i);
			if (neverMatch) {
				neverPatterns.push({ text: neverMatch[1].toLowerCase(), line: i });
			}
			const avoidMatch = lines[i].match(/avoid\s+([^.!?]+)/i);
			if (avoidMatch) {
				avoidPatterns.push({ text: avoidMatch[1].toLowerCase(), line: i });
			}
		}

		for (const avoidP of avoidPatterns) {
			for (const neverP of neverPatterns) {
				const overlaps =
					avoidP.text.includes(neverP.text.substring(0, 20)) ||
					neverP.text.includes(avoidP.text.substring(0, 20));
				if (overlaps) {
					report({
						severity: MarkerSeverity.Info,
						message: localize(
							'promptQuality.subsumedConstraint',
							"\"Avoid\" on line {0} may be subsumed by \"Never\" on line {1}. Consider removing the weaker constraint.",
							avoidP.line + bodyStartLine,
							neverP.line + bodyStartLine,
						),
						startLineNumber: avoidP.line + bodyStartLine,
						startColumn: 1,
						endLineNumber: avoidP.line + bodyStartLine,
						endColumn: (lines[avoidP.line]?.length ?? 0) + 1,
						code: 'prompt-quality-subsumed-constraint',
					});
					break;
				}
			}
		}
	}

	// --- Example sufficiency ---------------------------------------------------

	private analyzeExamples(lines: string[], bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		const text = lines.join('\n');

		const examplePatterns = [
			/example[s]?:/i,
			/for example/i,
			/e\.g\./i,
			/such as:/i,
			/here's how/i,
			/sample\s+(?:input|output|response)/i,
		];

		const hasExamples = examplePatterns.some(p => p.test(text));
		const hasJsonOutput = /json|object|array|\{|\[/i.test(text) && /output|respond|return/i.test(text);
		const hasFormatRequirement = /format|structure|schema/i.test(text);

		if ((hasJsonOutput || hasFormatRequirement) && !hasExamples) {
			report({
				severity: MarkerSeverity.Info,
				message: localize(
					'promptQuality.missingExamples',
					"Output format specified but no examples provided. Adding a few-shot example can clarify expected output structure.",
				),
				startLineNumber: bodyStartLine,
				startColumn: 1,
				endLineNumber: bodyStartLine,
				endColumn: 2,
				code: 'prompt-quality-missing-examples',
			});
		}

		if (hasExamples) {
			const inputExamples = (text.match(/input\s*:/gi) ?? []).length;
			const outputExamples = (text.match(/output\s*:/gi) ?? []).length;

			if (inputExamples > 0 && outputExamples > 0 && inputExamples !== outputExamples) {
				report({
					severity: MarkerSeverity.Warning,
					message: localize(
						'promptQuality.exampleMismatch',
						"Found {0} input example(s) but {1} output example(s). Ensure each input has a corresponding output.",
						inputExamples,
						outputExamples,
					),
					startLineNumber: bodyStartLine,
					startColumn: 1,
					endLineNumber: bodyStartLine,
					endColumn: 2,
					code: 'prompt-quality-example-mismatch',
				});
			}
		}
	}

	// --- Variable/placeholder validation ---------------------------------------

	private analyzeVariables(lines: string[], bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		const variablePattern = /\{\{(\w+)\}\}/g;
		const emptyVarPattern = /\{\{\s*\}\}/g;

		// Collect all definition sites (heuristic: `varName:` or `varName =`)
		const definedVariables = new Set<string>();
		const definitionPatterns = [
			/(\w+)\s*[:=]/g,
			/define\s+(\w+)/gi,
			/\{\{(\w+)\}\}\s*[:=]/g,
		];
		for (const line of lines) {
			for (const defPattern of definitionPatterns) {
				const regex = new RegExp(defPattern.source, defPattern.flags);
				let match: RegExpExecArray | null;
				while ((match = regex.exec(line)) !== null) {
					definedVariables.add(match[1].toLowerCase());
				}
			}
		}

		// Collect all usages
		const usedVariables = new Map<string, { line: number; col: number }[]>();
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const regex = new RegExp(variablePattern.source, variablePattern.flags);
			let match: RegExpExecArray | null;
			while ((match = regex.exec(line)) !== null) {
				const varName = match[1];
				const occurrences = usedVariables.get(varName) ?? [];
				occurrences.push({ line: i, col: match.index });
				usedVariables.set(varName, occurrences);
			}
		}

		// Flag undefined variables
		for (const [varName, occurrences] of usedVariables) {
			if (!definedVariables.has(varName.toLowerCase()) && !COMMON_CONTEXT_VARIABLES.has(varName.toLowerCase())) {
				for (const occurrence of occurrences) {
					report({
						severity: MarkerSeverity.Warning,
						message: localize(
							'promptQuality.undefinedVariable',
							"Variable '{{{{{0}}}}}' is referenced but may not be defined. Ensure it is provided in the runtime context.",
							varName,
						),
						startLineNumber: occurrence.line + bodyStartLine,
						startColumn: occurrence.col + 1,
						endLineNumber: occurrence.line + bodyStartLine,
						endColumn: occurrence.col + varName.length + 4 + 1,
						code: 'prompt-quality-undefined-variable',
					});
				}
			}
		}

		// Flag empty variable placeholders
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const regex = new RegExp(emptyVarPattern.source, emptyVarPattern.flags);
			let match: RegExpExecArray | null;
			while ((match = regex.exec(line)) !== null) {
				report({
					severity: MarkerSeverity.Error,
					message: localize(
						'promptQuality.emptyVariable',
						"Empty variable placeholder '{{{{}}}}' detected.",
					),
					startLineNumber: i + bodyStartLine,
					startColumn: match.index + 1,
					endLineNumber: i + bodyStartLine,
					endColumn: match.index + match[0].length + 1,
					code: 'prompt-quality-empty-variable',
				});
			}
		}
	}

	// --- Token usage analysis --------------------------------------------------

	private analyzeTokenUsage(lines: string[], bodyStartLine: number, report: (marker: IMarkerData) => void): void {
		const text = lines.join('\n');
		const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN);

		if (estimatedTokens > 2000) {
			report({
				severity: MarkerSeverity.Info,
				message: localize(
					'promptQuality.largePrompt',
					"Prompt uses ~{0} tokens. Large prompts leave less room for the model's response.",
					estimatedTokens,
				),
				startLineNumber: bodyStartLine,
				startColumn: 1,
				endLineNumber: bodyStartLine,
				endColumn: 2,
				code: 'prompt-quality-large-prompt',
			});
		}

		// Emoji-heavy content
		const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu;
		const emojiMatches = text.match(emojiPattern);
		if (emojiMatches && emojiMatches.length > 10) {
			report({
				severity: MarkerSeverity.Hint,
				message: localize(
					'promptQuality.emojiTokens',
					"{0} emojis detected. Emojis can use multiple tokens each \u2014 consider reducing if token budget is tight.",
					emojiMatches.length,
				),
				startLineNumber: bodyStartLine,
				startColumn: 1,
				endLineNumber: bodyStartLine,
				endColumn: 2,
				code: 'prompt-quality-emoji-tokens',
			});
		}

		// Poorly-tokenized content: long acronyms, very long words, long numbers
		const poorlyTokenized = [
			/[A-Z]{10,}/g,  // Long acronyms
			/\w{20,}/g,     // Very long words
			/\d{10,}/g,     // Long numbers
		];

		for (let i = 0; i < lines.length; i++) {
			for (const pattern of poorlyTokenized) {
				const regex = new RegExp(pattern.source, pattern.flags);
				let match: RegExpExecArray | null;
				while ((match = regex.exec(lines[i])) !== null) {
					report({
						severity: MarkerSeverity.Hint,
						message: localize(
							'promptQuality.inefficientTokenization',
							"\"{0}\" may tokenize inefficiently. Consider breaking up or abbreviating.",
							match[0].length > 20 ? match[0].substring(0, 20) + '...' : match[0],
						),
						startLineNumber: i + bodyStartLine,
						startColumn: match.index + 1,
						endLineNumber: i + bodyStartLine,
						endColumn: match.index + match[0].length + 1,
						code: 'prompt-quality-inefficient-tokenization',
					});
				}
			}
		}
	}
}
