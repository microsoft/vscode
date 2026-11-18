/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { extname } from '../vs/base/common/resources';
import { URI } from '../vs/base/common/uri';

/**
 * Interface for writing single-line comments in a given language.
 * Does not include the terminal new-line character (i.e. for many languages,
 * `end` will just be the empty string).
 */
interface CommentMarker {
	readonly start: string;
	readonly end?: string;
}

/**
 * A tuple of two characters, like a pair of
 * opening and closing brackets.
 */
export type CharacterPair = [string, string];

export interface ILanguageInfo {
	readonly aliases?: string[];
	readonly extensions?: string[];
	readonly lineComment: CommentMarker;
	/**
	 * The block comment character pair, like `/* block comment *&#47;`
	 */
	readonly blockComment?: CharacterPair;
	readonly alternativeLineComments?: CommentMarker[];
	readonly markdownLanguageIds?: string[]; // if not set, defaults to the language id
}

export interface ILanguage extends ILanguageInfo {
	readonly languageId: string;
}

/**
 * Well known language [from VSCode](https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers)
 * Markdown ids from https://raw.githubusercontent.com/highlightjs/highlight.js/refs/heads/main/SUPPORTED_LANGUAGES.md
 */
const languages = Object.freeze({
	'abap': {
		lineComment: { start: '\'' },
		markdownLanguageIds: ['abap', 'sap-abap']
	},
	'bat': {
		lineComment: { start: 'REM' },
		alternativeLineComments: [{ start: '::' }],
		aliases: [
			'Batch',
			'bat'
		],
		extensions: [
			'.bat',
			'.cmd'
		],
	},
	'bibtex': {
		lineComment: { start: '%' },
		aliases: [
			'BibTeX',
			'bibtex'
		],
		extensions: [
			'.bib'
		]
	},
	'blade': {
		lineComment: { start: '#' }
	},
	'c': {
		lineComment: { start: '//' },
		aliases: [
			'C',
			'c'
		],
		extensions: [
			'.c',
			'.i'
		],
		markdownLanguageIds: ['c', 'h']
	},
	'clojure': {
		lineComment: { start: ';' },
		aliases: [
			'Clojure',
			'clojure'
		],
		extensions: [
			'.clj',
			'.cljs',
			'.cljc',
			'.cljx',
			'.clojure',
			'.edn'
		],
		markdownLanguageIds: ['clojure', 'clj']
	},
	'coffeescript': {
		lineComment: { start: '//' },
		aliases: [
			'CoffeeScript',
			'coffeescript',
			'coffee'
		],
		extensions: [
			'.coffee',
			'.cson',
			'.iced'
		],
		markdownLanguageIds: ['coffeescript', 'coffee', 'cson', 'iced'],
		blockComment: ['###', '###']
	},
	'cpp': {
		lineComment: { start: '//' },
		aliases: [
			'C++',
			'Cpp',
			'cpp'
		],
		extensions: [
			'.cpp',
			'.cc',
			'.cxx',
			'.c++',
			'.hpp',
			'.hh',
			'.hxx',
			'.h++',
			'.h',
			'.ii',
			'.ino',
			'.inl',
			'.ipp',
			'.ixx',
			'.tpp',
			'.txx',
			'.hpp.in',
			'.h.in'
		],
		markdownLanguageIds: ['cpp', 'hpp', 'cc', 'hh', 'c++', 'h++', 'cxx', 'hxx'],
		blockComment: ['/*', '*/']
	},
	'csharp': {
		lineComment: { start: '//' },
		aliases: [
			'C#',
			'csharp'
		],
		extensions: [
			'.cs',
			'.csx',
			'.cake'
		],
		markdownLanguageIds: ['csharp', 'cs'],
		blockComment: ['/*', '*/']
	},
	'css': {
		lineComment: { start: '/*', end: '*/' },
		aliases: [
			'CSS',
			'css'
		],
		extensions: [
			'.css'
		],
		blockComment: ['/*', '*/']
	},
	'dart': {
		lineComment: { start: '//' },
		aliases: [
			'Dart'
		],
		extensions: [
			'.dart'
		],
		blockComment: ['/*', '*/']
	},
	'dockerfile': {
		lineComment: { start: '#' },
		aliases: [
			'Docker',
			'Dockerfile',
			'Containerfile'
		],
		extensions: [
			'.dockerfile',
			'.containerfile'
		],
		markdownLanguageIds: ['dockerfile', 'docker']
	},
	'elixir': {
		lineComment: { start: '#' },
	},
	'erb': {
		lineComment: { start: '<%#', end: '%>' }
	},
	'erlang': {
		lineComment: { start: '%' },
		markdownLanguageIds: ['erlang', 'erl']
	},
	'fsharp': {
		lineComment: { start: '//' },
		aliases: [
			'F#',
			'FSharp',
			'fsharp'
		],
		extensions: [
			'.fs',
			'.fsi',
			'.fsx',
			'.fsscript'
		],
		markdownLanguageIds: ['fsharp', 'fs', 'fsx', 'fsi', 'fsscript'],
		blockComment: ['(*', '*)']
	},
	'go': {
		lineComment: { start: '//' },
		aliases: [
			'Go'
		],
		extensions: [
			'.go'
		],
		markdownLanguageIds: ['go', 'golang'],
		blockComment: ['/*', '*/']
	},
	'groovy': {
		lineComment: { start: '//' },
		aliases: [
			'Groovy',
			'groovy'
		],
		extensions: [
			'.groovy',
			'.gvy',
			'.gradle',
			'.jenkinsfile',
			'.nf'
		],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'haml': {
		lineComment: { start: '-#' }
	},
	'handlebars': {
		lineComment: { start: '{{!', end: '}}' },
		extensions: [
			'.hbs',
			'.handlebars'
		],
		markdownLanguageIds: ['handlebars', 'hbs', 'html.hbs', 'html.handlebars'],
		blockComment: [
			'{{!--',
			'--}}'
		]
	},
	'haskell': {
		lineComment: { start: '--' },
		markdownLanguageIds: ['haskell', 'hs']
	},
	'html': {
		lineComment: { start: '<!--', end: '-->' },
		aliases: [
			'HTML',
			'htm',
			'html',
			'xhtml'
		],
		extensions: [
			'.html',
			'.htm',
			'.shtml',
			'.xhtml',
			'.xht',
			'.mdoc',
			'.jsp',
			'.asp',
			'.aspx',
			'.jshtm',
			'.volt',
			'.ejs',
			'.rhtml'
		],
		markdownLanguageIds: ['html', 'xhtml'],
		blockComment: [
			'<!--',
			'-->'
		]
	},
	'ini': {
		lineComment: { start: ';' },
		blockComment: [
			';',
			' '
		]
	},
	'java': {
		lineComment: { start: '//' },
		extensions: [
			'.java',
			'.class'
		],
		markdownLanguageIds: ['java', 'jsp'],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'javascript': {
		lineComment: { start: '//' },
		aliases: [
			'JavaScript',
			'javascript',
			'js'
		],
		extensions: [
			'.js',
			'.es6',
			'.mjs',
			'.cjs',
			'.pac'
		],
		markdownLanguageIds: ['javascript', 'js'],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'javascriptreact': {
		lineComment: { start: '//' },
		aliases: [
			'JavaScript JSX',
			'JavaScript React',
			'jsx'
		],
		extensions: [
			'.jsx'
		],
		markdownLanguageIds: ['jsx']
	},
	'json': {
		extensions: [
			'.json',
		],
		lineComment: { start: '//' },
		blockComment: [
			'/*',
			'*/'
		]
	},
	'jsonc': {
		lineComment: { start: '//' }
	},
	'jsx': {
		lineComment: { start: '//' },
		markdownLanguageIds: ['jsx']
	},
	'julia': {
		lineComment: { start: '#' },
		aliases: [
			'Julia',
			'julia'
		],
		extensions: [
			'.jl'
		],
		markdownLanguageIds: ['julia', 'jl'],
		blockComment: [
			'#=',
			'=#'
		]
	},
	'kotlin': {
		lineComment: { start: '//' },
		markdownLanguageIds: ['kotlin', 'kt']
	},
	'latex': {
		lineComment: { start: '%' },
		aliases: [
			'LaTeX',
			'latex'
		],
		extensions: [
			'.tex',
			'.ltx',
			'.ctx'
		],
		markdownLanguageIds: ['tex']
	},
	'less': {
		lineComment: { start: '//' },
		aliases: [
			'Less',
			'less'
		],
		extensions: [
			'.less'
		],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'lua': {
		lineComment: { start: '--' },
		aliases: [
			'Lua',
			'lua'
		],
		extensions: [
			'.lua'
		],
		markdownLanguageIds: ['lua', 'pluto'],
		blockComment: [
			'--[[',
			']]'
		]
	},
	'makefile': {
		lineComment: { start: '#' },
		aliases: [
			'Makefile',
			'makefile'
		],
		extensions: [
			'.mak',
			'.mk'
		],
		markdownLanguageIds: ['makefile', 'mk', 'mak', 'make']
	},
	'markdown': {
		lineComment: { start: '<!--', end: '-->' },
		alternativeLineComments: [
			{ start: '[]: #' }
		],
		aliases: [
			'Markdown',
			'markdown'
		],
		extensions: [
			'.md',
			'.mkd',
			'.mdwn',
			'.mdown',
			'.markdown',
			'.markdn',
			'.mdtxt',
			'.mdtext',
			'.workbook'
		],
		markdownLanguageIds: ['markdown', 'md', 'mkdown', 'mkd']
	},
	'objective-c': {
		lineComment: { start: '//' },
		aliases: [
			'Objective-C'
		],
		extensions: [
			'.m'
		],
		markdownLanguageIds: ['objectivec', 'mm', 'objc', 'obj-c'],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'objective-cpp': {
		lineComment: { start: '//' },
		aliases: [
			'Objective-C++'
		],
		extensions: [
			'.mm'
		],
		markdownLanguageIds: ['objectivec++', 'objc+']
	},
	'perl': {
		lineComment: { start: '#' },
		aliases: [
			'Perl',
			'perl'
		],
		extensions: [
			'.pl',
			'.pm',
			'.pod',
			'.t',
			'.PL',
			'.psgi'
		],
		markdownLanguageIds: ['perl', 'pl', 'pm']
	},
	'php': {
		lineComment: { start: '//' },
		aliases: [
			'PHP',
			'php'
		],
		extensions: [
			'.php',
			'.php4',
			'.php5',
			'.phtml',
			'.ctp'
		],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'powershell': {
		lineComment: { start: '#' },
		aliases: [
			'PowerShell',
			'powershell',
			'ps',
			'ps1'
		],
		extensions: [
			'.ps1',
			'.psm1',
			'.psd1',
			'.pssc',
			'.psrc'
		],
		markdownLanguageIds: ['powershell', 'ps', 'ps1'],
		blockComment: [
			'<#',
			'#>'
		]
	},
	'pug': {
		lineComment: { start: '//' }
	},
	'python': {
		lineComment: { start: '#' },
		aliases: [
			'Python',
			'py'
		],
		extensions: [
			'.py',
			'.rpy',
			'.pyw',
			'.cpy',
			'.gyp',
			'.gypi',
			'.pyi',
			'.ipy',
			'.pyt'
		],
		markdownLanguageIds: ['python', 'py', 'gyp'],
		blockComment: [
			'"""',
			'"""'
		]
	},
	'ql': {
		lineComment: { start: '//' }
	},
	'r': {
		lineComment: { start: '#' },
		aliases: [
			'R',
			'r'
		],
		extensions: [
			'.r',
			'.rhistory',
			'.rprofile',
			'.rt'
		]
	},
	'razor': {
		lineComment: { start: '<!--', end: '-->' },
		aliases: [
			'Razor',
			'razor'
		],
		extensions: [
			'.cshtml',
			'.razor'
		],
		markdownLanguageIds: ['cshtml', 'razor', 'razor-cshtml'],
		blockComment: [
			'<!--',
			'-->'
		]
	},
	'ruby': {
		lineComment: { start: '#' },
		aliases: [
			'Ruby',
			'rb'
		],
		extensions: [
			'.rb',
			'.rbx',
			'.rjs',
			'.gemspec',
			'.rake',
			'.ru',
			'.erb',
			'.podspec',
			'.rbi'
		],
		markdownLanguageIds: ['ruby', 'rb', 'gemspec', 'podspec', 'thor', 'irb'],
		blockComment: [
			'=begin',
			'=end'
		]
	},
	'rust': {
		lineComment: { start: '//' },
		aliases: [
			'Rust',
			'rust'
		],
		extensions: [
			'.rs'
		],
		markdownLanguageIds: ['rust', 'rs'],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'sass': {
		lineComment: { start: '//' }
	},
	'scala': {
		lineComment: { start: '//' }
	},
	'scss': {
		lineComment: { start: '//' },
		aliases: [
			'SCSS',
			'scss'
		],
		extensions: [
			'.scss'
		],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'shellscript': {
		lineComment: { start: '#' },
		aliases: [
			'Shell Script',
			'shellscript',
			'bash',
			'fish',
			'sh',
			'zsh',
			'ksh',
			'csh'
		],
		extensions: [
			'.sh',
			'.bash',
			'.bashrc',
			'.bash_aliases',
			'.bash_profile',
			'.bash_login',
			'.ebuild',
			'.profile',
			'.bash_logout',
			'.xprofile',
			'.xsession',
			'.xsessionrc',
			'.Xsession',
			'.zsh',
			'.zshrc',
			'.zprofile',
			'.zlogin',
			'.zlogout',
			'.zshenv',
			'.zsh-theme',
			'.fish',
			'.ksh',
			'.csh',
			'.cshrc',
			'.tcshrc',
			'.yashrc',
			'.yash_profile'
		],
		markdownLanguageIds: ['bash', 'sh', 'zsh']
	},
	'slim': {
		lineComment: { start: '/' }
	},
	'solidity': {
		lineComment: { start: '//' },
		markdownLanguageIds: ['solidity', 'sol']
	},
	'sql': {
		lineComment: { start: '--' },
		aliases: [
			'SQL'
		],
		extensions: [
			'.sql',
			'.dsql'
		],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'stylus': {
		lineComment: { start: '//' }
	},
	'svelte': {
		lineComment: { start: '<!--', end: '-->' }
	},
	'swift': {
		lineComment: { start: '//' },
		aliases: [
			'Swift',
			'swift'
		],
		extensions: [
			'.swift'
		],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'terraform': {
		lineComment: { start: '#' }
	},
	'tex': {
		lineComment: { start: '%' },
		aliases: [
			'TeX',
			'tex'
		],
		extensions: [
			'.sty',
			'.cls',
			'.bbx',
			'.cbx'
		]
	},
	'typescript': {
		lineComment: { start: '//' },
		aliases: [
			'TypeScript',
			'ts',
			'typescript'
		],
		extensions: [
			'.ts',
			'.cts',
			'.mts'
		],
		markdownLanguageIds: ['typescript', 'ts'],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'typescriptreact': {
		lineComment: { start: '//' },
		aliases: [
			'TypeScript JSX',
			'TypeScript React',
			'tsx'
		],
		extensions: [
			'.tsx'
		],
		markdownLanguageIds: ['tsx'],
		blockComment: [
			'/*',
			'*/'
		]
	},
	'vb': {
		lineComment: { start: '\'' },
		aliases: [
			'Visual Basic',
			'vb'
		],
		extensions: [
			'.vb',
			'.brs',
			'.vbs',
			'.bas',
			'.vba'
		],
		markdownLanguageIds: ['vb', 'vbscript']
	},
	'verilog': {
		lineComment: { start: '//' }
	},
	'vue-html': {
		lineComment: { start: '<!--', end: '-->' }
	},
	'vue': {
		lineComment: { start: '//' },
		extensions: [
			'.vue'
		]
	},
	'xml': {
		lineComment: { start: '<!--', end: '-->' },
		aliases: [
			'XML',
			'xml'
		],
		extensions: [
			'.xml',
			'.xsd',
			'.ascx',
			'.atom',
			'.axml',
			'.axaml',
			'.bpmn',
			'.cpt',
			'.csl',
			'.csproj',
			'.csproj.user',
			'.dita',
			'.ditamap',
			'.dtd',
			'.ent',
			'.mod',
			'.dtml',
			'.fsproj',
			'.fxml',
			'.iml',
			'.isml',
			'.jmx',
			'.launch',
			'.menu',
			'.mxml',
			'.nuspec',
			'.opml',
			'.owl',
			'.proj',
			'.props',
			'.pt',
			'.publishsettings',
			'.pubxml',
			'.pubxml.user',
			'.rbxlx',
			'.rbxmx',
			'.rdf',
			'.rng',
			'.rss',
			'.shproj',
			'.storyboard',
			'.svg',
			'.targets',
			'.tld',
			'.tmx',
			'.vbproj',
			'.vbproj.user',
			'.vcxproj',
			'.vcxproj.filters',
			'.wsdl',
			'.wxi',
			'.wxl',
			'.wxs',
			'.xaml',
			'.xbl',
			'.xib',
			'.xlf',
			'.xliff',
			'.xpdl',
			'.xul',
			'.xoml'
		],
		blockComment: [
			'<!--',
			'-->'
		]
	},
	'xsl': {
		lineComment: { start: '<!--', end: '-->' },
		aliases: [
			'XSL',
			'xsl'
		],
		extensions: [
			'.xsl',
			'.xslt'
		]
	},
	'yaml': {
		lineComment: { start: '#' },
		markdownLanguageIds: ['yaml', 'yml']
	}
} satisfies Record<string, ILanguageInfo>);

export type WellKnownLanguageId = keyof typeof languages;

export const wellKnownLanguages = new Map<string, ILanguage>(
	Object.entries(languages).map(([languageId, info]) => [languageId, { languageId, ...info }]));

export function getLanguage(languageId: string | undefined): ILanguage;
export function getLanguage(document: { languageId: string } | undefined): ILanguage;
export function getLanguage(v: string | { languageId: string } | undefined): ILanguage {
	if (typeof v === 'string') {
		return _getLanguage(v);
	}
	if (typeof v === 'undefined') {
		return _getLanguage('plaintext');
	}
	return _getLanguage(v.languageId);
}

function _getLanguage(languageId: string): ILanguage {
	return (
		wellKnownLanguages.get(languageId.toLowerCase())
		?? { languageId, lineComment: { start: '//' } }
	);
}

export function getLanguageForResource(uri: URI): ILanguage {
	const ext = extname(uri).toLowerCase();
	for (const info of wellKnownLanguages.values()) {
		if (info.extensions?.includes(ext)) {
			return info;
		}
	}
	return getLanguage('plaintext');
}
