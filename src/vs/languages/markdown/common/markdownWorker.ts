/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import URI from 'vs/base/common/uri';
import Types = require('vs/base/common/types');
import Modes = require('vs/editor/common/modes');
import Paths = require('vs/base/common/paths');
import Marked = require('vs/base/common/marked/marked');
import {tokenizeToString} from 'vs/editor/common/modes/textToHtmlTokenizer';
import {isMacintosh} from 'vs/base/common/platform';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {IMarkerService} from 'vs/platform/markers/common/markers';

enum Theme {
	LIGHT,
	DARK,
	HC_BLACK
}

export class MarkdownWorker {

	private static DEFAULT_MODE = 'text/plain';

	private cssLinks: string[];
	private theme: Theme = Theme.DARK;

	// Custom Scrollbar CSS (inlined because of pseudo elements that cannot be made theme aware)
	private static LIGHT_SCROLLBAR_CSS: string = [
		'<style type="text/css">',
		'	::-webkit-scrollbar {',
		'		width: 14px;',
		'		height: 14px;',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb {',
		'		background-color: rgba(100, 100, 100, 0.4);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:hover {',
		'		background-color: rgba(100, 100, 100, 0.7);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:active {',
		'		background-color: rgba(0, 0, 0, 0.6);',
		'	}',
		'</style>'
	].join('\n');

	private static DARK_SCROLLBAR_CSS: string = [
		'<style type="text/css">',
		'	::-webkit-scrollbar {',
		'		width: 14px;',
		'		height: 14px;',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb {',
		'		background-color: rgba(121, 121, 121, 0.4);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:hover {',
		'		background-color: rgba(100, 100, 100, 0.7);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:active {',
		'		background-color: rgba(85, 85, 85, 0.8);',
		'	}',
		'</style>'
	].join('\n');

	private static HC_BLACK_SCROLLBAR_CSS: string = [
		'<style type="text/css">',
		'	::-webkit-scrollbar {',
		'		width: 14px;',
		'		height: 14px;',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb {',
		'		background-color: rgba(111, 195, 223, 0.3);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:hover {',
		'		background-color: rgba(111, 195, 223, 0.4);',
		'	}',
		'',
		'	::-webkit-scrollbar-thumb:active {',
		'		background-color: rgba(111, 195, 223, 0.4);',
		'	}',
		'</style>'
	].join('\n');

	private modeService: IModeService;
	private resourceService:IResourceService;
	private markerService: IMarkerService;
	private _modeId: string;

	constructor(
		modeId: string,
		participants: Modes.IWorkerParticipant[],
		@IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService,
		@IModeService modeService: IModeService
	) {
		this._modeId = modeId;
		this.resourceService = resourceService;
		this.markerService = markerService;
		this.modeService = modeService;
	}

	_doConfigure(options: any): WinJS.TPromise<void> {
		if (options && options.theme) {
			this.theme = (options.theme === 'vs-dark') ? Theme.DARK : (options.theme === 'vs') ? Theme.LIGHT : Theme.HC_BLACK;
		}

		if (options && Types.isArray(options.styles)) {
			this.cssLinks = options.styles;
		}

		return WinJS.TPromise.as(void 0);
	}

	public getEmitOutput(resource: URI, absoluteWorkersResourcePath: string): WinJS.TPromise<Modes.IEmitOutput> { // TODO@Ben technical debt: worker cannot resolve paths absolute
		let model = this.resourceService.get(resource);
		let cssLinks: string[] = this.cssLinks || [];

		// Custom Renderer to fix href in images
		let renderer = new Marked.marked.Renderer();
		let $this = this;
		renderer.image = function(href: string, title: string, text: string): string {
			let out = '<img src="' + $this.fixHref(resource, href) + '" alt="' + text + '"';
			if (title) {
				out += ' title="' + title + '"';
			}

			out += (this.options && this.options.xhtml) ? '/>' : '>';

			return out;
		};

		// Custom Renderer to open links always in a new tab
		let superRenderLink = renderer.link;
		renderer.link = function(href: string, title: string, text: string): string {
			let link = superRenderLink.call(this, href, title, text);

			// We cannot support local anchor tags because the iframe editor does not have a src set
			if (href && href[0] === '#') {
				link = link.replace('href=', 'localhref=');
			} else {
				link = link.replace('<a', '<a target="_blank"');
			}

			return link;
		};

		let modeService = this.modeService;

		// Custom highlighter to use our modes to render code
		let highlighter = function(code: string, lang: string, callback?: (error: Error, result: string) => void) {

			// Lookup the mode and use the tokenizer to get the HTML
			let mimeForLang = modeService.getModeIdForLanguageName(lang) || lang || MarkdownWorker.DEFAULT_MODE;
			modeService.getOrCreateMode(mimeForLang).then((mode) => {
				callback(null, tokenizeToString(code, mode));
			});
		};

		return new WinJS.Promise((c, e) => {

			// Render markdown file contents to HTML
			Marked.marked(model.getValue(), {
				gfm: true, // GitHub flavored markdown
				renderer: renderer,
				highlight: highlighter
			}, (error: Error, htmlResult: string) => {

				// Compute head
				let head = [
					'<!DOCTYPE html>',
					'<html>',
					'<head>',
					'<meta http-equiv="Content-type" content="text/html;charset=UTF-8">',
					(cssLinks.length === 0) ? '<link rel="stylesheet" href="' + absoluteWorkersResourcePath + '/markdown.css" type="text/css" media="screen">' : '',
					(cssLinks.length === 0) ? '<link rel="stylesheet" href="' + absoluteWorkersResourcePath + '/tokens.css" type="text/css" media="screen">' : '',
					(this.theme === Theme.LIGHT) ? MarkdownWorker.LIGHT_SCROLLBAR_CSS : (this.theme === Theme.DARK) ? MarkdownWorker.DARK_SCROLLBAR_CSS : MarkdownWorker.HC_BLACK_SCROLLBAR_CSS,
					cssLinks.map((style) => {
						return '<link rel="stylesheet" href="' + this.fixHref(resource, style) + '" type="text/css" media="screen">';
					}).join('\n'),
					'</head>',
					isMacintosh ? '<body class="mac">' : '<body>'
				].join('\n');

				// Compute body
				let body = [
					(this.theme === Theme.LIGHT) ? '<div class="monaco-editor vs">' : (this.theme === Theme.DARK) ? '<div class="monaco-editor vs-dark">' : '<div class="monaco-editor hc-black">',
					htmlResult,
					'</div>',
				].join('\n');

				// Tail
				let tail = [
					'</body>',
					'</html>'
				].join('\n');

				c({
					head: head,
					body: body,
					tail: tail
				});
			});
		});
	}

	private fixHref(resource: URI, href: string): string {
		if (href) {

			// Return early if href is already a URL
			if (URI.parse(href).scheme) {
				return href;
			}

			// Otherwise convert to a file URI by joining the href with the resource location
			return URI.file(Paths.join(Paths.dirname(resource.fsPath), href)).toString();
		}

		return href;
	}
}