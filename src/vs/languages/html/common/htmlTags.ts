/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');

var emptyElements:string[] = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

export function isEmptyElement(e: string) : boolean {
	return arrays.binarySearch(emptyElements, e,(s1: string, s2: string) => s1.localeCompare(s2)) >= 0;
}

export interface IHTMLTagProvider {
	collectTags(collector: (tag:string) => void): void;
	collectAttributes(tag: string, collector: (attribute: string, type: string) => void): void;
	collectValues(tag: string, attribute: string, collector: (value: string) => void): void;
}

export function getHTML5TagProvider(): IHTMLTagProvider {
	var none: string[] = [];

	var html5Tags : { [tag:string]: string[]} = {
		html: ['manifest'],
		head: none,
		title: none,
		noscript: none,
		main: none,
		section: none,
		nav: none,
		article: none,
		aside: none,
		h1: none,
		h2: none,
		h3: none,
		h4: none,
		h5: none,
		h6: none,
		hgroup: none,
		header: none,
		footer: none,
		address: none,
		p: none,
		hr: none,
		pre: none,
		blockquote: ['cite'],
		ol: ['reversed:v', 'start', 'type:lt'],
		ul: none,
		li: ['value'],
		dl: none,
		dt: none,
		dd: none,
		figure: none,
		figcaption: none,
		div: none,
		a: ['href', 'target', 'download', 'ping', 'rel', 'hreflang', 'type'],
		em: none,
		strong: none,
		small: none,
		s: none,
		cite: none,
		q: ['cite'],
		dfn: none,
		abbr: none,
		data: ['value'],
		time: ['datetime'],
		code: none,
		var: none,
		samp: none,
		kbd: none,
		sub: none,
		sup: none,
		i: none,
		b: none,
		u: none,
		mark: none,
		ruby: none,
		rb: none,
		rp: none,
		rt: none,
		rtc: none,
		bdi: none,
		bdo: none,
		span: none,
		br: none,
		wbr: none,
		ins: ['cite', 'datetime'],
		del: ['cite', 'datetime'],
		img: ['alt', 'src', 'srcset', 'crossorigin:xo', 'usemap', 'ismap:v', 'width', 'height'],
		iframe: ['src', 'srcdoc', 'name', 'sandbox:sb', 'seamless:v', 'allowfullscreen:v', 'width', 'height'],
		embed: ['src', 'type', 'width', 'height'],
		object: ['data', 'type', 'typemustmatch:v', 'name', 'usemap', 'form', 'width', 'height'],
		param: ['name', 'value'],
		video: ['src', 'crossorigin:xo', 'poster', 'preload:pl', 'autoplay:v', 'mediagroup', 'loop:v', 'muted:v', 'controls:v', 'width', 'height'],
		audio: ['src', 'crossorigin:xo', 'preload:pl', 'autoplay:v', 'mediagroup', 'loop:v', 'muted:v', 'controls:v'],
		source: ['src', 'type'],
		track: ['default:v', 'kind:tk', 'label', 'src', 'srclang'],
		canvas: ['width', 'height'],
		map: ['name'],
		area: ['alt', 'coords', 'shape:sh', 'href', 'target', 'download', 'ping', 'rel', 'hreflang', 'type'],
		base: ['href', 'target'],
		link: ['href', 'crossorigin:xo', 'rel', 'media', 'hreflang', 'type', 'sizes'],
		meta: ['name', 'http-equiv', 'content', 'charset'],
		style: ['media', 'nonce', 'type', 'scoped:v'],
		script: ['src', 'type', 'charset', 'async:v', 'defer:v', 'crossorigin:xo', 'nonce'],
		template: none,
		body: ['onafterprint', 'onbeforeprint', 'onbeforeunload', 'onhashchange', 'onlanguagechange', 'onmessage', 'onoffline', 'ononline', 'onpagehide',
			'onpageshow', 'onpopstate', 'onstorage', 'onunload'],
		table: ['sortable:v', 'border'],
		caption: none,
		colgroup: ['span'],
		col: ['span'],
		tbody: none,
		thead: none,
		tfoot: none,
		tr: none,
		td: ['colspan', 'rowspan', 'headers'],
		th: ['colspan', 'rowspan', 'headers', 'scope:s', 'sorted', 'abbr'],
		form: ['accept-charset', 'action', 'autocomplete:o', 'enctype:et', 'method:m', 'name', 'novalidate:v', 'target'],
		fieldset: ['disabled:v', 'form', 'name'],
		legend: none,
		label: ['form', 'for'],
		input: ['accept', 'alt', 'autocomplete:o', 'autofocus:v', 'checked:v', 'dirname', 'disabled:v', 'form', 'formaction', 'formenctype:et',
			'formmethod:fm', 'formnovalidate:v', 'formtarget', 'height', 'inputmode:im', 'list', 'max', 'maxlength', 'min', 'minlength', 'multiple:v', 'name',
			'pattern', 'placeholder', 'readonly:v', 'required:v', 'size', 'src', 'step', 'type:t', 'value', 'width'],
		button: ['autofocus:v', 'disabled:v', 'form', 'formaction', 'formenctype:et', 'formmethod:fm', 'formnovalidate:v', 'formtarget', 'name', 'type:bt', 'value'],
		select: ['autocomplete:o', 'autofocus:v', 'disabled:v', 'form', 'multiple:v', 'name', 'required:v', 'size'],
		datalist: none,
		optgroup: ['disabled:v', 'label'],
		option: ['disabled:v', 'label', 'selected:v', 'value'],
		textarea: ['autocomplete:o', 'autofocus:v', 'cols', 'dirname', 'disabled:v', 'form', 'inputmode:im', 'maxlength', 'minlength', 'name', 'placeholder', 'readonly:v', 'required:v', 'rows', 'wrap:w'],
		keygen: ['autofocus:v', 'challenge', 'disabled:v', 'form', 'keytype', 'name'],
		output: ['for', 'form', 'name'],
		progress: ['value', 'max'],
		meter: ['value', 'min', 'max', 'low', 'high', 'optimum'],
		details: ['open:v'],
		summary: none,
		menu: ['type:mt', 'label'],
		menuitem: ['type:mit', 'label', 'icon', 'disabled:v', 'checked:v', 'radiogroup', 'default:v', 'command'],
		dialog: ['open:v']
	};

	var globalAttributes = [
		'aria-activedescendant', 'aria-atomic:b', 'aria-autocomplete:autocomplete', 'aria-busy:b', 'aria-checked:tristate', 'aria-colcount', 'aria-colindex', 'aria-colspan', 'aria-controls', 'aria-current:current', 'aria-describedat',
		'aria-describedby', 'aria-disabled:b', 'aria-dropeffect:dropeffect', 'aria-errormessage', 'aria-expanded:u', 'aria-flowto', 'aria-grabbed:u', 'aria-haspopup:b', 'aria-hidden:b', 'aria-invalid:invalid', 'aria-kbdshortcuts',
		'aria-label', 'aria-labelledby', 'aria-level', 'aria-live:live', 'aria-modal:b', 'aria-multiline:b', 'aria-multiselectable:b', 'aria-orientation:orientation', 'aria-owns', 'aria-placeholder', 'aria-posinset', 'aria-pressed:tristate',
		'aria-readonly:b','aria-relevant:relevant', 'aria-required:b', 'aria-roledescription', 'aria-rowcount', 'aria-rowindex', 'aria-rowspan', 'aria-selected:u', 'aria-setsize', 'aria-sort:sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext',
		'accesskey', 'class', 'contenteditable:b', 'contextmenu', 'dir:d', 'draggable:b', 'dropzone', 'hidden:v', 'id', 'itemid', 'itemprop', 'itemref', 'itemscope:v', 'itemtype', 'lang', 'role:roles', 'spellcheck:b', 'style', 'tabindex',
		'title', 'translate:y'];

	var eventHandlers = ['onabort', 'onblur', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'oncontextmenu', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover', 'ondragstart',
		'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus', 'onformchange', 'onforminput', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata',
		'onloadstart', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel', 'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange', 'onreset', 'onresize', 'onreadystatechange', 'onscroll',
		'onseeked', 'onseeking', 'onselect', 'onshow', 'onstalled', 'onsubmit', 'onsuspend', 'ontimeupdate', 'onvolumechange', 'onwaiting'];

	var valueSets : { [tag:string]: string[]} = {
		b: ['true', 'false'],
		u: ['true', 'false', 'undefined'],
		o: ['on', 'off'],
		y: ['yes', 'no'],
		w: ['soft', 'hard'],
		d: ['ltr', 'rtl', 'auto'],
		m: ['GET', 'POST', 'dialog'],
		fm: ['GET', 'POST'],
		s: ['row', 'col', 'rowgroup', 'colgroup'],
		t: ['hidden', 'text', 'search', 'tel', 'url', 'email', 'password', 'datetime', 'date', 'month', 'week', 'time', 'datetime-local', 'number', 'range', 'color', 'checkbox', 'radio', 'file', 'submit', 'image', 'reset', 'button'],
		im: ['verbatim', 'latin', 'latin-name', 'latin-prose', 'full-width-latin', 'kana', 'kana-name', 'katakana', 'numeric', 'tel', 'email', 'url'],
		bt: ['button', 'submit', 'reset', 'menu'],
		lt: ['1', 'a', 'A', 'i', 'I'],
		mt: ['context', 'toolbar'],
		mit: ['command', 'checkbox', 'radio'],
		et: ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
		tk: ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'],
		pl: ['none', 'metadata', 'auto'],
		sh: ['circle', 'default', 'poly', 'rect'],
		xo: ['anonymous', 'use-credentials'],
		sb: ['allow-forms', 'allow-modals', 'allow-pointer-lock', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-same-origin', 'allow-scripts', 'allow-top-navigation'],
		tristate: ['true', 'false', 'mixed', 'undefined'],
		autocomplete: ['inline', 'list', 'both', 'none'],
		current: ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
		dropeffect: ['copy', 'move', 'link', 'execute', 'popup', 'none'],
		invalid: ['grammar', 'false', 'spelling', 'true'],
		live: ['off', 'polite', 'assertive'],
		orientation: ['vertical', 'horizontal', 'undefined'],
		relevant: ['additions', 'removals', 'text', 'all', 'additions text'],
		sort: ['ascending', 'descending', 'none', 'other'],
		roles: ['alert', 'alertdialog', 'button', 'checkbox', 'dialog', 'gridcell', 'link', 'log', 'marquee', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'progressbar', 'radio', 'scrollbar', 'searchbox', 'slider',
			'spinbutton', 'status', 'switch', 'tab', 'tabpanel', 'textbox', 'timer', 'tooltip', 'treeitem', 'combobox', 'grid', 'listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid',
			'application', 'article', 'cell', 'columnheader', 'definition', 'directory', 'document', 'feed', 'figure', 'group', 'heading', 'img', 'list', 'listitem', 'math', 'none', 'note', 'presentation', 'region', 'row', 'rowgroup',
			'rowheader', 'separator', 'table', 'term', 'text', 'toolbar',
			'banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search']
	};

	return {
		collectTags: (collector: (tag: string) => void) => {
			for (var tag in html5Tags) {
				collector(tag);
			}
		},
		collectAttributes: (tag: string, collector: (attribute: string, type: string) => void) => {
			globalAttributes.forEach(attr => {
				var segments = attr.split(':');
				collector(segments[0], segments[1]);
			});
			eventHandlers.forEach(handler => {
				collector(handler, 'event');
			});
			if (tag) {
				var attributes = html5Tags[tag];
				if (attributes) {
					attributes.forEach(attr => {
						var segments = attr.split(':');
						collector(segments[0], segments[1]);
					});
				}
			}
		},
		collectValues: (tag: string, attribute: string, collector: (value: string) => void) => {
			var prefix = attribute + ':';
			var processAttributes = (attributes: string[]) => {
				attributes.forEach((attr) => {
					if (attr.length > prefix.length && strings.startsWith(attr, prefix)) {
						var typeInfo = attr.substr(prefix.length);
						if (typeInfo === 'v') {
							collector(attribute);
						} else {
							var values = valueSets[typeInfo];
							if (values) {
								values.forEach(collector);
							}
						}
					}
				});
			};
			var attributes = html5Tags[tag];
			if (attributes) {
				processAttributes(attributes);
			}
			processAttributes(globalAttributes); // no need to look in event handlers
		}
	};
}


export function getAngularTagProvider() : IHTMLTagProvider {
	var customTags : { [tag:string]: string[]} = {
		input: ['ng-model', 'ng-required', 'ng-minlength', 'ng-maxlength', 'ng-pattern', 'ng-trim'],
		select: ['ng-model'],
		textarea: ['ng-model', 'ng-required', 'ng-minlength', 'ng-maxlength', 'ng-pattern', 'ng-trim']
	};

	var globalAttributes = 	['ng-app', 'ng-bind', 'ng-bindhtml', 'ng-bindtemplate', 'ng-blur', 'ng-change', 'ng-checked', 'ng-class', 'ng-classeven', 'ng-classodd',
		'ng-click', 'ng-cloak', 'ng-controller', 'ng-copy', 'ng-csp', 'ng-cut', 'ng-dblclick', 'ng-disabled', 'ng-focus', 'ng-form', 'ng-hide', 'ng-href', 'ng-if',
		'ng-include', 'ng-init', 'ng-jq', 'ng-keydown', 'ng-keypress', 'ng-keyup', 'ng-list', 'ng-modelOptions', 'ng-mousedown', 'ng-mouseenter', 'ng-mouseleave',
		'ng-mousemove', 'ng-mouseover', 'ng-mouseup', 'ng-nonbindable', 'ng-open', 'ng-options', 'ng-paste', 'ng-pluralize', 'ng-readonly', 'ng-repeat', 'ng-selected',
		'ng-show', 'ng-src', 'ng-srcset', 'ng-style', 'ng-submit', 'ng-switch', 'ng-transclude', 'ng-value'
	];

	return {
		collectTags: (collector: (tag: string) => void) => {
			// no extra tags
		},
		collectAttributes: (tag: string, collector: (attribute: string, type: string) => void) => {
			if (tag) {
				var attributes = customTags[tag];
				if (attributes) {
					attributes.forEach((a) => {
						collector(a, null);
						collector('data-' + a, null);
					});
				}
			}
			globalAttributes.forEach((a) => {
				collector(a, null);
				collector('data-' + a, null);
			});
		},
		collectValues: (tag: string, attribute: string, collector: (value: string) => void) => {
			// no values
		}
	};
}
