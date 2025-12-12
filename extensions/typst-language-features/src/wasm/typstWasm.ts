/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This module provides integration with the Typst WASM compiler.
 *
 * Uses @myriaddreamin/typst-ts-web-compiler for compilation
 * and @myriaddreamin/typst.ts as the high-level API.
 *
 * @see https://github.com/Myriad-Dreamin/typst.ts
 * @see https://www.npmjs.com/package/@myriaddreamin/typst-ts-web-compiler
 */

// Use 'any' for the typst instance since the exact types are complex

let typstInstance: any = null;
let initPromise: Promise<void> | null = null;

export interface CompileResult {
	success: boolean;
	pdf?: Uint8Array;
	svg?: string;
	errors?: DiagnosticInfo[];
}

export interface DiagnosticInfo {
	message: string;
	severity: 'error' | 'warning' | 'info';
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
}

interface TypstDiagnostic {
	message?: string;
	msg?: string;
	severity?: string;
	line?: number;
	column?: number;
	col?: number;
	range?: {
		start?: { line?: number; character?: number; column?: number };
		end?: { line?: number; character?: number; column?: number };
	};
}

/**
 * Function type for reading WASM files
 * Returns the WASM module bytes as Uint8Array
 */
export type WasmFileReader = (filename: string) => Promise<Uint8Array>;

/**
 * Options for initializing the Typst WASM compiler
 */
export interface TypstWasmOptions {
	/** Function to read WASM files - returns file bytes */
	readWasmFile?: WasmFileReader;
	/** Base URI for fallback CDN loading (used if readWasmFile is not provided) */
	wasmBaseUri?: string;
}

/**
 * Initialize the Typst WASM compiler
 * @param options Options for WASM initialization
 */
export async function initializeTypstWasm(options?: TypstWasmOptions | string): Promise<void> {
	if (typstInstance) {
		return;
	}

	if (initPromise) {
		return initPromise;
	}

	// Handle legacy string argument for backwards compatibility
	const normalizedOptions: TypstWasmOptions = typeof options === 'string'
		? { wasmBaseUri: options }
		: options ?? {};

	initPromise = doInitialize(normalizedOptions);
	return initPromise;
}

async function doInitialize(options: TypstWasmOptions): Promise<void> {
	try {
		console.log('[Typst WASM] Loading typst.ts module...');

		// Dynamic import of typst.ts snippet module
		const snippetModule = await import('@myriaddreamin/typst.ts/contrib/snippet');
		const $typst = snippetModule.$typst;

		if (!$typst) {
			throw new Error('Could not find $typst in typst.ts/contrib/snippet module');
		}

		const { readWasmFile, wasmBaseUri } = options;

		// Configure the compiler to load WASM
		// Priority: 1. File reader (works in all environments), 2. URL fallback, 3. CDN
		if (readWasmFile) {
			// Use file reader to load WASM bytes directly
			// This works in production web (vscode-server) where fetch(file://) fails
			console.log('[Typst WASM] Using file reader for WASM loading');

			$typst.setCompilerInitOptions({
				getModule: async () => {
					console.log('[Typst WASM] Loading compiler WASM via file reader...');
					const bytes = await readWasmFile('typst_ts_web_compiler_bg.wasm');
					return bytes;
				},
			});

			$typst.setRendererInitOptions({
				getModule: async () => {
					console.log('[Typst WASM] Loading renderer WASM via file reader...');
					const bytes = await readWasmFile('typst_ts_renderer_bg.wasm');
					return bytes;
				},
			});
		} else if (wasmBaseUri) {
			// Use URL-based loading (works in local development)
			const compilerWasmUrl = `${wasmBaseUri}/typst_ts_web_compiler_bg.wasm`;
			const rendererWasmUrl = `${wasmBaseUri}/typst_ts_renderer_bg.wasm`;

			console.log('[Typst WASM] Compiler WASM URL:', compilerWasmUrl);
			console.log('[Typst WASM] Renderer WASM URL:', rendererWasmUrl);

			$typst.setCompilerInitOptions({
				getModule: () => compilerWasmUrl,
			});

			$typst.setRendererInitOptions({
				getModule: () => rendererWasmUrl,
			});
		} else {
			// CDN fallback
			const compilerWasmUrl = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm';
			const rendererWasmUrl = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm';

			console.log('[Typst WASM] Using CDN fallback');
			console.log('[Typst WASM] Compiler WASM URL:', compilerWasmUrl);
			console.log('[Typst WASM] Renderer WASM URL:', rendererWasmUrl);

			$typst.setCompilerInitOptions({
				getModule: () => compilerWasmUrl,
			});

			$typst.setRendererInitOptions({
				getModule: () => rendererWasmUrl,
			});
		}

		typstInstance = $typst;
		console.log('[Typst WASM] Typst compiler initialized successfully');
	} catch (error) {
		console.error('[Typst WASM] Failed to initialize:', error);
		initPromise = null;
		throw error;
	}
}

/**
 * Check if the WASM compiler is loaded
 */
export function isWasmLoaded(): boolean {
	return typstInstance !== null;
}

/**
 * Compile Typst source code to PDF
 */
export async function compileToPdf(source: string): Promise<CompileResult> {
	if (!typstInstance) {
		return {
			success: false,
			errors: [{
				message: 'Typst WASM compiler not initialized',
				severity: 'error',
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
			}]
		};
	}

	try {
		const pdf = await typstInstance.pdf({
			mainContent: source,
		});

		if (pdf) {
			return { success: true, pdf };
		} else {
			return {
				success: false,
				errors: [{
					message: 'Compilation returned no output',
					severity: 'error',
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
				}]
			};
		}
	} catch (error) {
		return parseCompilationError(error, source);
	}
}

/**
 * Compile Typst source code to SVG
 */
export async function compileToSvg(source: string): Promise<CompileResult> {
	if (!typstInstance) {
		return {
			success: false,
			errors: [{
				message: 'Typst WASM compiler not initialized',
				severity: 'error',
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
			}]
		};
	}

	try {
		const svg = await typstInstance.svg({
			mainContent: source,
		});

		return { success: true, svg };
	} catch (error) {
		// Log the error for debugging
		console.error('[Typst WASM] Compilation error:', error);
		return parseCompilationError(error, source);
	}
}

/**
 * Validate Typst source code and get diagnostics with proper location information
 */
export async function validateSource(source: string): Promise<DiagnosticInfo[]> {
	if (!typstInstance) {
		return [];
	}

	try {
		// Check if getDiagnostics method is available (proper API)
		if (typeof typstInstance.getDiagnostics === 'function') {
			const diagnostics = await typstInstance.getDiagnostics({
				mainContent: source,
			});

			if (Array.isArray(diagnostics)) {
				return diagnostics.map((diag: any) => {
					let lineNum = 0;
					let colNum = 0;

					// Try to decode span if decode method is available
					if (diag.span && typeof typstInstance.decode === 'function') {
						try {
							const decoded = typstInstance.decode(diag.span);
							if (decoded && typeof decoded.line === 'number') {
								lineNum = Math.max(0, decoded.line - 1);
							}
							if (decoded && typeof decoded.column === 'number') {
								colNum = Math.max(0, decoded.column - 1);
							}
						} catch (e) {
							// Fallback if decode fails
							console.warn('[Typst WASM] Failed to decode span:', e);
						}
					}

					// Check for direct line/column properties
					if (typeof diag.line === 'number') {
						lineNum = Math.max(0, diag.line - 1);
					}
					if (typeof diag.column === 'number' || typeof diag.col === 'number') {
						colNum = Math.max(0, (diag.column || diag.col || 0) - 1);
					}

					// Check for range property
					if (diag.range && typeof diag.range === 'object') {
						if (typeof diag.range.start?.line === 'number') {
							lineNum = Math.max(0, diag.range.start.line);
						}
						if (typeof diag.range.start?.character === 'number' || typeof diag.range.start?.column === 'number') {
							colNum = Math.max(0, diag.range.start.character || diag.range.start.column || 0);
						}
					}

					const severity = (diag.severity || 'error').toLowerCase() === 'error' ? 'error' :
						(diag.severity || 'error').toLowerCase() === 'warning' ? 'warning' : 'info';

					return {
						message: diag.message || diag.msg || String(diag),
						severity: severity,
						range: {
							start: { line: lineNum, character: colNum },
							end: { line: lineNum, character: colNum + (diag.length || 100) }
						}
					};
				});
			}
		}

		// Fallback: Try to compile - if it fails, we get errors
		await typstInstance.svg({
			mainContent: source,
		});
		return []; // No errors
	} catch (error) {
		const result = parseCompilationError(error, source);
		return result.errors ?? [];
	}
}

/**
 * Parse compilation error into DiagnosticInfo
 * Handles both string error messages and Rust diagnostic object formats
 */
function parseCompilationError(error: unknown, source?: string): CompileResult {
	// Check if error is an array of diagnostic objects (structured format from Typst compiler)
	if (Array.isArray(error)) {
		const errors: DiagnosticInfo[] = [];
		for (const diagnostic of error) {
			if (diagnostic && typeof diagnostic === 'object') {
				const diag = diagnostic as TypstDiagnostic;
				const message = diag.message || diag.msg || String(diagnostic);
				const severity = (diag.severity || 'error').toLowerCase() === 'error' ? 'error' :
					(diag.severity || 'error').toLowerCase() === 'warning' ? 'warning' : 'info';

				// Try to extract location from diagnostic object
				let lineNum = 0;
				let colNum = 0;

				// Check for line/column properties
				if (typeof diag.line === 'number') {
					lineNum = Math.max(0, diag.line - 1);
				}
				if (typeof diag.column === 'number' || typeof diag.col === 'number') {
					colNum = Math.max(0, (diag.column || diag.col || 0) - 1);
				}

				// Check for range/span properties
				if (diag.range && typeof diag.range === 'object') {
					if (typeof diag.range.start?.line === 'number') {
						lineNum = Math.max(0, diag.range.start.line);
					}
					if (typeof diag.range.start?.character === 'number' || typeof diag.range.start?.column === 'number') {
						colNum = Math.max(0, diag.range.start.character || diag.range.start.column || 0);
					}
				}

				errors.push({
					message: message,
					severity: severity,
					range: {
						start: { line: lineNum, character: colNum },
						end: { line: lineNum, character: colNum + 100 }
					}
				});
			}
		}

		if (errors.length > 0) {
			return {
				success: false,
				errors: errors
			};
		}
	}

	// Handle different error types (fallback to string parsing)
	let errorMessage: string;
	if (error instanceof Error) {
		errorMessage = error.message;
	} else if (typeof error === 'string') {
		errorMessage = error;
	} else if (error && typeof error === 'object' && error !== null) {
		// Check if object has toString method
		const errorObj = error as { toString?: () => string };
		if (errorObj.toString && typeof errorObj.toString === 'function') {
			errorMessage = errorObj.toString();
		} else {
			errorMessage = String(error);
		}
	} else {
		errorMessage = String(error);
	}

	// Parse multiple errors if present
	const errors: DiagnosticInfo[] = [];

	// Check if error is in Rust diagnostic format: [SourceDiagnostic { ... }, SourceDiagnostic { ... }]
	// Try to extract ALL individual diagnostic objects (not just the first one)
	// Pattern matches: SourceDiagnostic { severity: Error, span: Span(...), message: "...", trace: [...], hints: [...] }
	// We also try to extract trace information which might contain location hints
	// Note: The pattern is flexible to handle variations in whitespace and optional fields
	const diagnosticPattern = /SourceDiagnostic\s*\{\s*severity:\s*(\w+)\s*,\s*span:\s*Span\(([^)]+)\)\s*,\s*message:\s*"([^"]+)"\s*(?:,\s*trace:\s*\[([^\]]*)\])?\s*(?:,\s*hints:\s*\[([^\]]*)\])?\s*\}/g;
	let match;
	let foundDiagnostics = false;

	// Reset regex lastIndex to ensure we search from the beginning
	diagnosticPattern.lastIndex = 0;

	while ((match = diagnosticPattern.exec(errorMessage)) !== null) {
		foundDiagnostics = true;
		const severityStr = match[1].toLowerCase();
		const severity = severityStr === 'error' ? 'error' :
			severityStr === 'warning' ? 'warning' : 'info';
		let message = match[3];
		const trace = match[4] || '';
		const hints = match[5] || '';

		// Try multiple methods to extract location:
		// 1. From the error message itself
		// 2. From trace information
		// 3. From hints
		let lineNum = 0;
		let colNum = 0;

		// Method 1: Check the message
		let lineMatch = message.match(/(?:at|on|line|Ln|line)\s+(\d+)(?:\s*,\s*col(?:umn)?\s*(\d+)|[:\s]+(\d+))?/i);
		if (lineMatch) {
			lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
			colNum = (lineMatch[2] || lineMatch[3]) ? Math.max(0, parseInt(lineMatch[2] || lineMatch[3] || '0', 10) - 1) : 0;
		}

		// Method 2: Check trace for location hints
		if (lineNum === 0 && trace) {
			lineMatch = trace.match(/(?:line|Ln)\s*(\d+)(?:\s*,\s*col(?:umn)?\s*(\d+)|[:\s]+(\d+))?/i);
			if (lineMatch) {
				lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
				colNum = (lineMatch[2] || lineMatch[3]) ? Math.max(0, parseInt(lineMatch[2] || lineMatch[3] || '0', 10) - 1) : 0;
			}
		}

		// Method 3: Check hints
		if (lineNum === 0 && hints) {
			lineMatch = hints.match(/(?:line|Ln)\s*(\d+)(?:\s*,\s*col(?:umn)?\s*(\d+)|[:\s]+(\d+))?/i);
			if (lineMatch) {
				lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
				colNum = (lineMatch[2] || lineMatch[3]) ? Math.max(0, parseInt(lineMatch[2] || lineMatch[3] || '0', 10) - 1) : 0;
			}
		}

		// Method 4: If we have source code, try to find the error location by searching for context
		// This is a heuristic approach when span decoding isn't available
		if (lineNum === 0 && source) {
			const lines = source.split('\n');

			// Try to extract keywords from the error message that might appear in the source
			// Common patterns: "unknown variable: X" -> search for "X"
			const varMatch = message.match(/unknown variable:\s*(\w+)/i);
			if (varMatch) {
				const varName = varMatch[1];
				for (let i = 0; i < lines.length; i++) {
					// Look for the variable name in a context that suggests it's being used incorrectly
					if (lines[i].includes(varName) && !lines[i].trim().startsWith('//')) {
						lineNum = i;
						const colIndex = lines[i].indexOf(varName);
						colNum = colIndex >= 0 ? colIndex : 0;
						break;
					}
				}
			}

			// For "can only be used when context is known" - often related to counter.display()
			if (lineNum === 0 && message.includes('can only be used when context is known')) {
				for (let i = 0; i < lines.length; i++) {
					if (lines[i].includes('.display()') || lines[i].includes('counter(')) {
						lineNum = i;
						break;
					}
				}
			}

			// For "unclosed delimiter" - try to find unmatched brackets by parsing
			if (lineNum === 0 && message.includes('unclosed delimiter')) {
				// Simple bracket matching to find likely unclosed delimiters
				const bracketStack: Array<{ char: string; line: number; col: number }> = [];
				let inString = false;
				let inCodeBlock = false;
				let stringChar = '';
				let unclosedBracket: { char: string; line: number; col: number } | null = null;

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					for (let j = 0; j < line.length; j++) {
						const char = line[j];

						// Handle strings
						if ((char === '\"' || char === '\'') && (j === 0 || line[j - 1] !== '\\')) {
							if (!inString) {
								inString = true;
								stringChar = char;
							} else if (char === stringChar) {
								inString = false;
								stringChar = '';
							}
							continue;
						}

						if (inString) { continue; }

						// Handle code blocks
						if (char === '`' && j + 2 < line.length && line.substring(j, j + 3) === '```') {
							inCodeBlock = !inCodeBlock;
							j += 2;
							continue;
						}

						if (inCodeBlock) { continue; }

						// Handle comments
						if (char === '/' && j + 1 < line.length && line[j + 1] === '/') {
							break; // Rest of line is comment
						}

						// Track brackets
						if (char === '(' || char === '[' || char === '{') {
							bracketStack.push({ char, line: i, col: j });
						} else if (char === ')' || char === ']' || char === '}') {
							if (bracketStack.length === 0) {
								// Unmatched closing bracket - likely error location
								lineNum = i;
								colNum = j;
								unclosedBracket = { char, line: i, col: j };
								break;
							}
							const last = bracketStack.pop();
							const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
							if (last && pairs[last.char] !== char) {
								// Mismatched bracket - likely error location
								lineNum = i;
								colNum = j;
								unclosedBracket = { char: last.char, line: last.line, col: last.col };
								break;
							}
						}
					}
					if (lineNum > 0) { break; }
				}

				// If we found unclosed brackets at the end, use the last one
				if (lineNum === 0 && bracketStack.length > 0) {
					unclosedBracket = bracketStack[bracketStack.length - 1];
					lineNum = unclosedBracket.line;
					colNum = unclosedBracket.col;
				}

				// Enhance error message with context if we found the location
				if (unclosedBracket) {
					const bracketNames: Record<string, string> = { '(': 'parenthesis', '[': 'square bracket', '{': 'curly brace' };
					const bracketName = bracketNames[unclosedBracket.char] || 'delimiter';
					message = `${message} (unclosed ${bracketName} opened at line ${unclosedBracket.line + 1}, column ${unclosedBracket.col + 1})`;
				}
			}

			// For "expected comma" - search for function calls or lists that might be missing commas
			if (lineNum === 0 && message.includes('expected comma')) {
				// Look for patterns like "value value" or "value )" which suggest missing comma
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					// Pattern: word followed by word or closing bracket without comma
					const commaPattern = /\w+\s+\w+|\w+\s*[)\]}]/;
					if (commaPattern.test(line) && !line.trim().startsWith('//')) {
						lineNum = i;
						// Find the position where comma might be missing
						const match = line.match(/(\w+)\s+(\w+|[)\]}])/);
						if (match && match.index !== undefined) {
							colNum = match.index + match[1].length;
						}
						break;
					}
				}
			}

			// For "the character `#` is not valid in code" - find lines with # outside of code blocks or comments
			if (lineNum === 0 && message.includes('character') && message.includes('not valid in code')) {
				// Extract the character from the message (e.g., `#` or `:`)
				const charMatch = message.match(/character\s+`([^`]+)`/);
				if (charMatch) {
					const invalidChar = charMatch[1];
					let inCodeBlock = false;
					for (let i = 0; i < lines.length; i++) {
						const line = lines[i];
						// Skip comments
						if (line.trim().startsWith('//')) {
							continue;
						}
						// Check for code blocks
						if (line.includes('```')) {
							inCodeBlock = !inCodeBlock;
							continue;
						}
						if (inCodeBlock) {
							continue;
						}
						// Look for the invalid character in text (not in code expressions)
						// Check if it's in backticks (code) or in regular text
						const charIndex = line.indexOf(invalidChar);
						if (charIndex >= 0) {
							// Check if it's inside backticks (which is valid) or outside
							const beforeChar = line.substring(0, charIndex);
							const backtickCount = (beforeChar.match(/`/g) || []).length;
							// If even number of backticks before, we're outside a code block
							if (backtickCount % 2 === 0 && !line.trim().startsWith('#')) {
								lineNum = i;
								colNum = charIndex;
								break;
							}
						}
					}
				}
			}

			// For "expected semicolon or line break" - be very conservative
			// This error often appears as a cascading error from other issues, so we should
			// only try to locate it if we're very confident, otherwise leave it at the compiler's location
			// Don't try to guess - let the compiler's location stand unless we have strong evidence
			// (This heuristic is intentionally minimal to avoid false positives)

			// For "unexpected colon" - find lines with colons in wrong places
			// Note: Colons are valid in Typst for named arguments (e.g., title: "value")
			// So we need to be very careful - only flag if we're confident it's invalid
			// If we can't find a clearly invalid colon, don't override the compiler's location
			if (lineNum === 0 && message.includes('unexpected colon')) {
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					// Skip comments
					if (line.trim().startsWith('//')) {
						continue;
					}

					// Look for colons that are clearly invalid
					// Valid colons appear in: function(args: value), #set page(margin: 2cm), etc.
					// Invalid colons: standalone :, : after operators like + :, etc.

					// Check each colon in the line
					let colonIndex = -1;
					while ((colonIndex = line.indexOf(':', colonIndex + 1)) >= 0) {
						const beforeColon = line.substring(0, colonIndex);
						const afterColon = line.substring(colonIndex + 1);

						// Skip if in quotes or code blocks
						const quoteCount = (beforeColon.match(/["']/g) || []).length;
						const backtickCount = (beforeColon.match(/`/g) || []).length;
						if (quoteCount % 2 !== 0 || backtickCount % 2 !== 0) {
							continue;
						}

						// Check if colon is clearly invalid (after operator, at start, etc.)
						const beforeTrimmed = beforeColon.trim();
						const afterTrimmed = afterColon.trim();

						// Invalid patterns:
						// - Colon at start of line (after whitespace/comments)
						// - Colon immediately after operators: + :, = :, etc.
						// - Colon with nothing meaningful after it
						if (beforeTrimmed === '' || beforeTrimmed.endsWith('+') ||
							beforeTrimmed.endsWith('-') || beforeTrimmed.endsWith('*') ||
							beforeTrimmed.endsWith('/') || beforeTrimmed.endsWith('=') ||
							beforeTrimmed.endsWith('<') || beforeTrimmed.endsWith('>') ||
							afterTrimmed === '' || afterTrimmed.startsWith(')') ||
							afterTrimmed.startsWith(']') || afterTrimmed.startsWith('}')) {
							// This looks like an invalid colon
							lineNum = i;
							colNum = colonIndex;
							break;
						}
					}
					if (lineNum > 0) {
						break;
					}
				}
			}

			// For "unclosed label" - find labels missing closing >
			if (lineNum === 0 && message.includes('unclosed label')) {
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					// Look for < that doesn't have a matching >
					const openLabelIndex = line.indexOf('<');
					if (openLabelIndex >= 0) {
						const afterOpen = line.substring(openLabelIndex + 1);
						const closeLabelIndex = afterOpen.indexOf('>');
						if (closeLabelIndex === -1) {
							// Found unclosed label
							lineNum = i;
							colNum = openLabelIndex;
							break;
						}
					}
				}
			}
		}

		errors.push({
			message: message,
			severity: severity,
			range: {
				start: { line: lineNum, character: colNum },
				end: { line: lineNum, character: colNum + 100 }
			}
		});
	}

	// Also try a more flexible pattern that handles variations in whitespace
	// This will catch ALL diagnostic messages, not just the first one
	if (!foundDiagnostics) {
		const flexiblePattern = /message:\s*"([^"]+)"/g;
		flexiblePattern.lastIndex = 0;
		while ((match = flexiblePattern.exec(errorMessage)) !== null) {
			// Check if this looks like a diagnostic message (appears near SourceDiagnostic)
			const beforeMatch = errorMessage.substring(Math.max(0, match.index - 100), match.index);
			if (beforeMatch.includes('SourceDiagnostic') || beforeMatch.includes('severity')) {
				foundDiagnostics = true;
				const message = match[1];

				// Try to extract line number from message
				let lineNum = 0;
				let colNum = 0;
				const lineMatch = message.match(/(?:at|on|line)\s+(\d+)(?::(\d+))?/i);
				if (lineMatch) {
					lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
					colNum = lineMatch[2] ? Math.max(0, parseInt(lineMatch[2], 10) - 1) : 0;
				}

				errors.push({
					message: message,
					severity: 'error',
					range: {
						start: { line: lineNum, character: colNum },
						end: { line: lineNum, character: colNum + 100 }
					}
				});
			}
		}
	}

	// If we didn't find diagnostic objects, try to parse as plain text
	if (!foundDiagnostics) {
		const errorLines = errorMessage.split('\n');

		for (const line of errorLines) {
			if (line.trim()) {
				// Try to extract line/column info from error message
				// Common formats: "error: ... at line 5", "5:10: error..."
				const lineMatch = line.match(/(?:line\s*|:)(\d+)(?::(\d+))?/i);
				const lineNum = lineMatch ? parseInt(lineMatch[1], 10) - 1 : 0;
				const colNum = lineMatch?.[2] ? parseInt(lineMatch[2], 10) - 1 : 0;

				errors.push({
					message: line.trim(),
					severity: line.toLowerCase().includes('warning') ? 'warning' : 'error',
					range: {
						start: { line: Math.max(0, lineNum), character: colNum },
						end: { line: Math.max(0, lineNum), character: colNum + 100 }
					}
				});
			}
		}
	}

	return {
		success: false,
		errors: errors.length > 0 ? errors : [{
			message: foundDiagnostics ? 'Compilation error (see details above)' : errorMessage,
			severity: 'error',
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
		}]
	};
}

/**
 * Reset the compiler state
 */
export async function resetCompiler(): Promise<void> {
	if (typstInstance?.resetShadow) {
		await typstInstance.resetShadow();
	}
}

/**
 * Query the document using Typst's introspection query API
 * This is useful for finding labels, elements, etc.
 * 
 * @param source The Typst source code
 * @param selector The Typst selector string (e.g., "label(<name>)" for labels)
 * @param field Optional field to extract from the result
 * @returns The query result, or undefined if query fails
 */
export async function queryDocument<T = any>(
	source: string,
	selector: string,
	field?: string
): Promise<T | undefined> {
	if (!typstInstance) {
		return undefined;
	}

	try {
		const result = await typstInstance.query({
			mainContent: source,
			selector: selector,
			field: field,
		});
		return result as T;
	} catch (error) {
		console.warn('[Typst WASM] Query failed:', error);
		return undefined;
	}
}

/**
 * Dispose of the WASM module
 */
export function disposeWasm(): void {
	typstInstance = null;
	initPromise = null;
}
