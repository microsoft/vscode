// Son of Anton — Tree-sitter Parser Manager
// Manages Tree-sitter parsers for multiple languages with lazy initialization.

import Parser from 'tree-sitter';

// Language grammar packages
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';

/** Mapping from language identifier to file extensions. */
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
	typescript: ['.ts', '.tsx'],
	javascript: ['.js', '.jsx', '.mjs', '.cjs'],
	python: ['.py'],
	rust: ['.rs'],
	csharp: ['.cs'],
	c: ['.c', '.h'],
	cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h'],
};

/** Reverse lookup: extension to language identifier. */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {};
for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
	for (const ext of exts) {
		EXTENSION_TO_LANGUAGE[ext] = lang;
	}
}

export class TreeSitterManager {
	private parsers = new Map<string, Parser>();
	private enabledLanguages: Set<string>;

	constructor(languages: string[]) {
		this.enabledLanguages = new Set(languages);
	}

	/**
	 * Get the language identifier for a file based on its extension.
	 * Returns undefined if the language is not supported or not enabled.
	 */
	getLanguageForFile(filePath: string): string | undefined {
		const ext = this.getExtension(filePath);
		const language = EXTENSION_TO_LANGUAGE[ext];
		if (language && this.enabledLanguages.has(language)) {
			return language;
		}
		// Handle TypeScript files matching both 'typescript' and 'javascript'
		if (language === 'javascript' && this.enabledLanguages.has('javascript')) {
			return 'javascript';
		}
		return undefined;
	}

	/**
	 * Check if a file is supported for parsing.
	 */
	isSupported(filePath: string): boolean {
		return this.getLanguageForFile(filePath) !== undefined;
	}

	/**
	 * Parse a source file and return the AST tree.
	 */
	parse(source: string, language: string, previousTree?: Parser.Tree): Parser.Tree {
		const parser = this.getOrCreateParser(language);
		if (previousTree) {
			return parser.parse(source, previousTree);
		}
		return parser.parse(source);
	}

	/**
	 * Get all file extensions for enabled languages.
	 */
	getSupportedExtensions(): string[] {
		const extensions: string[] = [];
		for (const lang of this.enabledLanguages) {
			const exts = LANGUAGE_EXTENSIONS[lang];
			if (exts) {
				extensions.push(...exts);
			}
		}
		return extensions;
	}

	/**
	 * Get glob patterns for file watching.
	 */
	getWatchGlobs(): string[] {
		const extensions = this.getSupportedExtensions();
		return extensions.map(ext => `**/*${ext}`);
	}

	private getOrCreateParser(language: string): Parser {
		let parser = this.parsers.get(language);
		if (parser) {
			return parser;
		}

		parser = new Parser();
		const grammar = this.loadGrammar(language);
		parser.setLanguage(grammar);
		this.parsers.set(language, parser);

		return parser;
	}

	private loadGrammar(language: string): unknown {
		switch (language) {
			case 'typescript':
				return TypeScript.typescript;
			case 'tsx':
				return TypeScript.tsx;
			case 'javascript':
				return JavaScript;
			case 'python':
				return Python;
			default:
				throw new Error(`Grammar not available for language: ${language}. Install the corresponding tree-sitter grammar package.`);
		}
	}

	private getExtension(filePath: string): string {
		// Handle compound extensions like .d.ts
		if (filePath.endsWith('.d.ts')) {
			return '.d.ts';
		}
		const lastDot = filePath.lastIndexOf('.');
		if (lastDot < 0) {
			return '';
		}
		return filePath.substring(lastDot);
	}
}
