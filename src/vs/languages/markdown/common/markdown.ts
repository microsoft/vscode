/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import Monarch = require('vs/editor/common/modes/monarch/monarch');
import URI from 'vs/base/common/uri';
import Types = require('vs/editor/common/modes/monarch/monarchTypes');
import Compile = require('vs/editor/common/modes/monarch/monarchCompile');
import Modes = require('vs/editor/common/modes');
import MarkdownWorker = require('vs/languages/markdown/common/markdownWorker');
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {htmlTokenTypes} from 'vs/languages/html/common/html';
import markdownTokenTypes = require('vs/languages/markdown/common/markdownTokenTypes');
import {IModeService} from 'vs/editor/common/services/modeService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';

export const language =
	<Types.ILanguage>{
		displayName: 'Markdown',
		name: 'md',
		defaultToken: '',

		suggestSupport: {
			disableAutoTrigger: true,
		},

		autoClosingPairs: [],

		blockCommentStart: '<!--',
		blockCommentEnd: '-->',

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
				[/^(\s{0,3})(#+)((?:[^\\#]|@escapes)+)((?:#+)?)/, ['white', markdownTokenTypes.TOKEN_HEADER_LEAD, markdownTokenTypes.TOKEN_HEADER, markdownTokenTypes.TOKEN_HEADER]],

				// headers (with =)
				[/^\s*(=+|\-+)\s*$/, markdownTokenTypes.TOKEN_EXT_HEADER],

				// headers (with ***)
				[/^\s*((\*[ ]?)+)\s*$/, markdownTokenTypes.TOKEN_SEPARATOR],

				// quote
				[/^\s*>+/, markdownTokenTypes.TOKEN_QUOTE],

				// list (starting with * or number)
				[/^\s*([\*\-+:]|\d+\.)\s/, markdownTokenTypes.TOKEN_LIST],

				// code block (4 spaces indent)
				[/^(\t|[ ]{4})[^ ].*$/, markdownTokenTypes.TOKEN_BLOCK],

				// code block (3 tilde)
				[/^\s*~{3}\s*((?:\w|[\/\-#])+)?\s*$/, { token: markdownTokenTypes.TOKEN_BLOCK, next: '@codeblock' }],

				// github style code blocks (with backticks and language)
				[/^\s*```\s*((?:\w|[\/\-#])+)\s*$/, { token: markdownTokenTypes.TOKEN_BLOCK, next: '@codeblockgh', nextEmbedded: '$1' }],

				// github style code blocks (with backticks but no language)
				[/^\s*`{3}\s*$/, { token: markdownTokenTypes.TOKEN_BLOCK, next: '@codeblock' }],

				// markup within lines
				{ include: '@linecontent' },
			],

			codeblock: [
				[/^\s*~{3}\s*$/, { token: markdownTokenTypes.TOKEN_BLOCK, next: '@pop' }],
				[/^\s*`{3}\s*$/, { token: markdownTokenTypes.TOKEN_BLOCK, next: '@pop' }],
				[/.*$/, markdownTokenTypes.TOKEN_BLOCK_CODE],
			],

			// github style code blocks
			codeblockgh: [
				[/```\s*$/, { token: '@rematch', switchTo: '@codeblockghend', nextEmbedded: '@pop' }],
				[/[^`]*$/, markdownTokenTypes.TOKEN_BLOCK_CODE],
			],

			codeblockghend: [
				[/\s*```/, { token: markdownTokenTypes.TOKEN_BLOCK_CODE, next: '@pop' }],
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

export class MarkdownMode extends Monarch.MonarchMode implements Modes.IEmitOutputSupport {

	public emitOutputSupport: Modes.IEmitOutputSupport;
	public configSupport:Modes.IConfigurationSupport;

	private _modeWorkerManager: ModeWorkerManager<MarkdownWorker.MarkdownWorker>;
	private _threadService:IThreadService;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id, Compile.compile(language), modeService, modelService, editorWorkerService);
		this._modeWorkerManager = new ModeWorkerManager<MarkdownWorker.MarkdownWorker>(descriptor, 'vs/languages/markdown/common/markdownWorker', 'MarkdownWorker', null, instantiationService);
		this._threadService = threadService;

		this.emitOutputSupport = this;
		this.configSupport = this;
	}

	private _worker<T>(runner:(worker:MarkdownWorker.MarkdownWorker)=>WinJS.TPromise<T>): WinJS.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	public configure(options:any): WinJS.TPromise<void> {
		if (this._threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(MarkdownMode, MarkdownMode.prototype._configureWorkers);
	private _configureWorkers(options:any): WinJS.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	static $getEmitOutput = OneWorkerAttr(MarkdownMode, MarkdownMode.prototype.getEmitOutput);
	public getEmitOutput(resource: URI, absoluteWorkerResourcesPath?: string): WinJS.TPromise<Modes.IEmitOutput> { // TODO@Ben technical debt: worker cannot resolve paths absolute
		return this._worker((w) => w.getEmitOutput(resource, absoluteWorkerResourcesPath));
	}
}
