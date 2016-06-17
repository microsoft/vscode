/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Types = require('vs/editor/common/modes/monarch/monarchTypes');
import Compile = require('vs/editor/common/modes/monarch/monarchCompile');
import Modes = require('vs/editor/common/modes');
import {htmlTokenTypes} from 'vs/languages/html/common/html';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {LanguageConfigurationRegistry, LanguageConfiguration} from 'vs/editor/common/modes/languageConfigurationRegistry';
import {wireCancellationToken} from 'vs/base/common/async';

export const TOKEN_HEADER_LEAD = 'entity.name.tag';
export const TOKEN_HEADER = 'entity.name.tag';
export const TOKEN_EXT_HEADER = 'entity.other.attribute-name';
export const TOKEN_SEPARATOR = 'meta.separator';
export const TOKEN_QUOTE = 'comment';
export const TOKEN_LIST = 'keyword';
export const TOKEN_BLOCK = 'string';
export const TOKEN_BLOCK_CODE = 'variable.source';

export const language =
	<Types.IMonarchLanguage>{
		defaultToken: '',
		tokenPostfix: '.md',

		// escape codes
		control: /[\\`*_\[\]{}()#+\-\.!]/,
		noncontrol: /[^\\`*_\[\]{}()#+\-\.!]/,
		escapes: /\\(?:@control)/,

		// escape codes for javascript/CSS strings
		jsescapes: /\\(?:[btnfr\\"']|[0-7][0-7]?|[0-3][0-7]{2})/,

		// non matched elements
		empty: [
			'area', 'base', 'basefont', 'br', 'col', 'frame',
			'hr', 'img', 'input', 'isindex', 'link', 'meta', 'param'
		],

		tokenizer: {
			root: [

				// headers (with #)
				[/^(\s{0,3})(#+)((?:[^\\#]|@escapes)+)((?:#+)?)/, ['white', TOKEN_HEADER_LEAD, TOKEN_HEADER, TOKEN_HEADER]],

				// headers (with =)
				[/^\s*(=+|\-+)\s*$/, TOKEN_EXT_HEADER],

				// headers (with ***)
				[/^\s*((\*[ ]?)+)\s*$/, TOKEN_SEPARATOR],

				// quote
				[/^\s*>+/, TOKEN_QUOTE],

				// list (starting with * or number)
				[/^\s*([\*\-+:]|\d+\.)\s/, TOKEN_LIST],

				// code block (4 spaces indent)
				[/^(\t|[ ]{4})[^ ].*$/, TOKEN_BLOCK],

				// code block (3 tilde)
				[/^\s*~{3}\s*((?:\w|[\/\-#])+)?\s*$/, { token: TOKEN_BLOCK, next: '@codeblock' }],

				// github style code blocks (with backticks and language)
				[/^\s*```\s*((?:\w|[\/\-#])+)\s*$/, { token: TOKEN_BLOCK, next: '@codeblockgh', nextEmbedded: '$1' }],

				// github style code blocks (with backticks but no language)
				[/^\s*`{3}\s*$/, { token: TOKEN_BLOCK, next: '@codeblock' }],

				// markup within lines
				{ include: '@linecontent' },
			],

			codeblock: [
				[/^\s*~{3}\s*$/, { token: TOKEN_BLOCK, next: '@pop' }],
				[/^\s*`{3}\s*$/, { token: TOKEN_BLOCK, next: '@pop' }],
				[/.*$/, TOKEN_BLOCK_CODE],
			],

			// github style code blocks
			codeblockgh: [
				[/```\s*$/, { token: '@rematch', switchTo: '@codeblockghend', nextEmbedded: '@pop' }],
				[/[^`]*$/, TOKEN_BLOCK_CODE],
			],

			codeblockghend: [
				[/\s*```/, { token: TOKEN_BLOCK_CODE, next: '@pop' }],
				[/./, '@rematch', '@pop'],
			],

			linecontent: [

				// escapes
				[/&\w+;/, 'string.escape'],
				[/@escapes/, 'escape'],

				// various markup
				[/\b__([^\\_]|@escapes|_(?!_))+__\b/, 'strong'],
				[/\*\*([^\\*]|@escapes|\*(?!\*))+\*\*/, 'strong'],
				[/\b_[^_]+_\b/, 'emphasis'],
				[/\*([^\\*]|@escapes)+\*/, 'emphasis'],
				[/`([^\\`]|@escapes)+`/, 'variable'],

				// links
				[/\{[^}]+\}/, 'string.target'],
				[/(!?\[)((?:[^\]\\]|@escapes)*)(\]\([^\)]+\))/, ['string.link', '', 'string.link']],
				[/(!?\[)((?:[^\]\\]|@escapes)*)(\])/, 'string.link'],

				// or html
				{ include: 'html' },
			],

			// Note: it is tempting to rather switch to the real HTML mode instead of building our own here
			// but currently there is a limitation in Monarch that prevents us from doing it: The opening
			// '<' would start the HTML mode, however there is no way to jump 1 character back to let the
			// HTML mode also tokenize the opening angle bracket. Thus, even though we could jump to HTML,
			// we cannot correctly tokenize it in that mode yet.
			html: [
				// html tags
				[/<(\w+)\/>/, htmlTokenTypes.getTag('$1')],
				[/<(\w+)/, {
					cases: {
						'@empty': { token: htmlTokenTypes.getTag('$1'), next: '@tag.$1' },
						'@default': { token: htmlTokenTypes.getTag('$1'), bracket: '@open', next: '@tag.$1' }
					}
				}],
				[/<\/(\w+)\s*>/, { token: htmlTokenTypes.getTag('$1'), bracket: '@close' }],

				[/<!--/, 'comment', '@comment']
			],

			comment: [
				[/[^<\-]+/, 'comment.content'],
				[/-->/, 'comment', '@pop'],
				[/<!--/, 'comment.content.invalid'],
				[/[<\-]/, 'comment.content']
			],

			// Almost full HTML tag matching, complete with embedded scripts & styles
			tag: [
				[/[ \t\r\n]+/, 'white'],
				[/(type)(\s*=\s*)(")([^"]+)(")/, [htmlTokenTypes.ATTRIB_NAME, htmlTokenTypes.DELIM_ASSIGN, htmlTokenTypes.ATTRIB_VALUE,
					{ token: htmlTokenTypes.ATTRIB_VALUE, switchTo: '@tag.$S2.$4' },
					htmlTokenTypes.ATTRIB_VALUE]],
				[/(type)(\s*=\s*)(')([^']+)(')/, [htmlTokenTypes.ATTRIB_NAME, htmlTokenTypes.DELIM_ASSIGN, htmlTokenTypes.ATTRIB_VALUE,
					{ token: htmlTokenTypes.ATTRIB_VALUE, switchTo: '@tag.$S2.$4' },
					htmlTokenTypes.ATTRIB_VALUE]],
				[/(\w+)(\s*=\s*)("[^"]*"|'[^']*')/, [htmlTokenTypes.ATTRIB_NAME, htmlTokenTypes.DELIM_ASSIGN, htmlTokenTypes.ATTRIB_VALUE]],
				[/\w+/, htmlTokenTypes.ATTRIB_NAME],
				[/\/>/, htmlTokenTypes.getTag('$S2'), '@pop'],
				[/>/, {
					cases: {
						'$S2==style': { token: htmlTokenTypes.getTag('$S2'), switchTo: '@embedded.$S2', nextEmbedded: 'text/css' },
						'$S2==script': {
							cases: {
								'$S3': { token: htmlTokenTypes.getTag('$S2'), switchTo: '@embedded.$S2', nextEmbedded: '$S3' },
								'@default': { token: htmlTokenTypes.getTag('$S2'), switchTo: '@embedded.$S2', nextEmbedded: 'text/javascript' }
							}
						},
						'@default': { token: htmlTokenTypes.getTag('$S2'), next: '@pop' }
					}
				}],
			],

			embedded: [
				[/[^"'<]+/, ''],
				[/<\/(\w+)\s*>/, {
					cases: {
						'$1==$S2': { token: '@rematch', next: '@pop', nextEmbedded: '@pop' },
						'@default': ''
					}
				}],
				[/"([^"\\]|\\.)*$/, 'string.invalid'],  // non-teminated string
				[/'([^'\\]|\\.)*$/, 'string.invalid'],  // non-teminated string
				[/"/, 'string', '@string."'],
				[/'/, 'string', '@string.\''],
				[/</, '']
			],

			// scan embedded strings in javascript or css
			string: [
				[/[^\\"']+/, 'string'],
				[/@jsescapes/, 'string.escape'],
				[/\\./, 'string.escape.invalid'],
				[/["']/, {
					cases: {
						'$#==$S2': { token: 'string', next: '@pop' },
						'@default': 'string'
					}
				}]
			]
		}
	};

export class MarkdownMode extends AbstractMode {

	public static LANG_CONFIG: LanguageConfiguration = {
		comments: {
			blockComment: ['<!--', '-->',]
		},
		brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']],
		autoClosingPairs: []
	};

	public tokenizationSupport: Modes.ITokenizationSupport;

	constructor(
		descriptor: Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IModeService modeService: IModeService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(descriptor.id);
		let lexer = Compile.compile(descriptor.id, language);

		this.tokenizationSupport = createTokenizationSupport(modeService, this, lexer);

		LanguageConfigurationRegistry.register(this.getId(), MarkdownMode.LANG_CONFIG);

		Modes.SuggestRegistry.register(this.getId(), {
			triggerCharacters: [],
			shouldAutotriggerSuggest: false,
			provideCompletionItems: (model, position, token) => {
				return wireCancellationToken(token, editorWorkerService.textualSuggest(model.uri, position));
			}
		}, true);
	}
}