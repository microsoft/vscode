/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Utility for processing inline shortcuts in search queries
 * Converts shortcuts like :ts to file patterns and updates the include pattern
 */

export interface ShortcutResult {
	/** The search query with shortcuts removed */
	query: string;
	/** The file patterns to add to includes */
	filePatterns: string[];
	/** Whether any shortcut was found and processed */
	hasShortcut: boolean;
}

/**
 * Maps shortcuts to file patterns
 */
const SHORTCUT_MAP: Record<string, string> = {
	// TypeScript & JavaScript
	':ts': '**/*.ts',
	':tsx': '**/*.tsx',
	':js': '**/*.js',
	':jsx': '**/*.jsx',
	':mjs': '**/*.mjs',
	':cjs': '**/*.cjs',

	// Markup & Documentation
	':md': '**/*.md',
	':mdx': '**/*.mdx',
	':rst': '**/*.rst',
	':txt': '**/*.txt',
	':adoc': '**/*.adoc',
	':asciidoc': '**/*.asciidoc',

	// Python
	':py': '**/*.py',
	':pyw': '**/*.pyw',
	':pyi': '**/*.pyi',
	':pyx': '**/*.pyx',
	':pxd': '**/*.pxd',

	// Data & Configuration
	':json': '**/*.json',
	':yaml': '**/*.yaml',
	':toml': '**/*.toml',
	':ini': '**/*.ini',
	':cfg': '**/*.cfg',
	':conf': '**/*.conf',
	':xml': '**/*.xml',
	':csv': '**/*.csv',
	':tsv': '**/*.tsv',

	// Web Technologies
	':css': '**/*.css',
	':scss': '**/*.scss',
	':sass': '**/*.sass',
	':less': '**/*.less',
	':html': '**/*.html',
	':htm': '**/*.htm',
	':xhtml': '**/*.xhtml',

	// C/C++ Family
	':c': '**/*.c',
	':cpp': '**/*.cpp',
	':cc': '**/*.cc',
	':cxx': '**/*.cxx',
	':h': '**/*.h',
	':hpp': '**/*.hpp',
	':hxx': '**/*.hxx',
	':m': '**/*.m',
	':mm': '**/*.mm',

	// Java & JVM
	':java': '**/*.java',
	':kt': '**/*.kt',
	':scala': '**/*.scala',
	':groovy': '**/*.groovy',
	':clj': '**/*.clj',

	// Go & Rust
	':go': '**/*.go',
	':rs': '**/*.rs',

	// PHP
	':php': '**/*.php',
	':phtml': '**/*.phtml',

	// Ruby
	':rb': '**/*.rb',
	':erb': '**/*.erb',

	// Shell & Scripts
	':sh': '**/*.sh',
	':bash': '**/*.bash',
	':zsh': '**/*.zsh',
	':fish': '**/*.fish',
	':ps1': '**/*.ps1',
	':bat': '**/*.bat',
	':cmd': '**/*.cmd',

	// Database
	':sql': '**/*.sql',
	':db': '**/*.db',
	':sqlite': '**/*.sqlite',

	// Docker & Containers
	':dockerfile': '**/*.dockerfile',
	':docker': '**/*.docker',

	// Build & Package
	':lock': '**/*.lock',
	':gradle': '**/*.gradle',
	':pom': '**/*.pom',
	':sbt': '**/*.sbt',
	':cmake': '**/*.cmake',
	':makefile': '**/*.makefile',
	':mk': '**/*.mk',

	// Documentation & Config
	':readme': '**/README*',
	':license': '**/LICENSE*',
	':changelog': '**/CHANGELOG*',
	':contributing': '**/CONTRIBUTING*',
	':gitignore': '**/.gitignore',
	':env': '**/.env*',
	':config': '**/*.config.*',

	// Images & Media
	':png': '**/*.png',
	':jpg': '**/*.jpg',
	':jpeg': '**/*.jpeg',
	':gif': '**/*.gif',
	':svg': '**/*.svg',
	':ico': '**/*.ico',
	':webp': '**/*.webp',

	// Fonts
	':ttf': '**/*.ttf',
	':otf': '**/*.otf',
	':woff': '**/*.woff',
	':woff2': '**/*.woff2',

	// Archives
	':zip': '**/*.zip',
	':tar': '**/*.tar',
	':gz': '**/*.gz',
	':rar': '**/*.rar',
	':7z': '**/*.7z'
};

/**
 * Processes a search query for inline shortcuts
 * @param query The search query from the user
 * @param currentIncludePattern The current include pattern value
 * @returns Processed result with shortcuts removed and file pattern to add
 */
export function processSearchShortcuts(query: string, currentIncludePattern: string): ShortcutResult {
	let processedQuery = query;
	const filePatterns: string[] = [];
	let hasShortcut = false;

	// Check for shortcuts in the query
	for (const [shortcut, pattern] of Object.entries(SHORTCUT_MAP)) {
		if (processedQuery.includes(shortcut)) {
			// Remove the shortcut from the query
			processedQuery = processedQuery.replace(new RegExp(shortcut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
			filePatterns.push(pattern);
			hasShortcut = true;
		}
	}

	// Clean up the query (remove extra spaces, trim)
	processedQuery = processedQuery.replace(/\s+/g, ' ').trim();

	// If query is empty after removing shortcuts, set it to empty string (not undefined)
	if (processedQuery === '') {
		processedQuery = '';
	}

	return {
		query: processedQuery,
		filePatterns,
		hasShortcut
	};
}


