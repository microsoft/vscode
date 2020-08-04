/*
The MIT License (MIT)

Copyright © 2015 Nicolas Bevacqua

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

let __insane_func;

(function () { function r(e, n, t) { function o(i, f) { if (!n[i]) { if (!e[i]) { var c = "function" == typeof require && require; if (!f && c) return c(i, !0); if (u) return u(i, !0); var a = new Error("Cannot find module '" + i + "'"); throw a.code = "MODULE_NOT_FOUND", a } var p = n[i] = { exports: {} }; e[i][0].call(p.exports, function (r) { var n = e[i][1][r]; return o(n || r) }, p, p.exports, r, e, n, t) } return n[i].exports } for (var u = "function" == typeof require && require, i = 0; i < t.length; i++)o(t[i]); return o } return r })()({
	1: [function (require, module, exports) {
		'use strict';

		var toMap = require('./toMap');
		var uris = ['background', 'base', 'cite', 'href', 'longdesc', 'src', 'usemap'];

		module.exports = {
			uris: toMap(uris) // attributes that have an href and hence need to be sanitized
		};

	}, { "./toMap": 10 }], 2: [function (require, module, exports) {
		'use strict';

		var defaults = {
			allowedAttributes: {
				'*': ['title', 'accesskey'],
				a: ['href', 'name', 'target', 'aria-label'],
				iframe: ['allowfullscreen', 'frameborder', 'src'],
				img: ['src', 'alt', 'title', 'aria-label']
			},
			allowedClasses: {},
			allowedSchemes: ['http', 'https', 'mailto'],
			allowedTags: [
				'a', 'abbr', 'article', 'b', 'blockquote', 'br', 'caption', 'code', 'del', 'details', 'div', 'em',
				'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'main', 'mark',
				'ol', 'p', 'pre', 'section', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table',
				'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
			],
			filter: null
		};

		module.exports = defaults;

	}, {}], 3: [function (require, module, exports) {
		'use strict';

		var toMap = require('./toMap');
		var voids = ['area', 'br', 'col', 'hr', 'img', 'wbr', 'input', 'base', 'basefont', 'link', 'meta'];

		module.exports = {
			voids: toMap(voids)
		};

	}, { "./toMap": 10 }], 4: [function (require, module, exports) {
		'use strict';

		var he = require('he');
		var assign = require('assignment');
		var parser = require('./parser');
		var sanitizer = require('./sanitizer');
		var defaults = require('./defaults');

		function insane(html, options, strict) {
			var buffer = [];
			var configuration = strict === true ? options : assign({}, defaults, options);
			var handler = sanitizer(buffer, configuration);

			parser(html, handler);

			return buffer.join('');
		}

		insane.defaults = defaults;
		module.exports = insane;
		__insane_func = insane;

	}, { "./defaults": 2, "./parser": 7, "./sanitizer": 8, "assignment": 6, "he": 9 }], 5: [function (require, module, exports) {
		'use strict';

		module.exports = function lowercase(string) {
			return typeof string === 'string' ? string.toLowerCase() : string;
		};

	}, {}], 6: [function (require, module, exports) {
		'use strict';

		function assignment(result) {
			var stack = Array.prototype.slice.call(arguments, 1);
			var item;
			var key;
			while (stack.length) {
				item = stack.shift();
				for (key in item) {
					if (item.hasOwnProperty(key)) {
						if (Object.prototype.toString.call(result[key]) === '[object Object]') {
							result[key] = assignment(result[key], item[key]);
						} else {
							result[key] = item[key];
						}
					}
				}
			}
			return result;
		}

		module.exports = assignment;

	}, {}], 7: [function (require, module, exports) {
		'use strict';

		var he = require('he');
		var lowercase = require('./lowercase');
		var attributes = require('./attributes');
		var elements = require('./elements');
		var rstart = /^<\s*([\w:-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)\s*>/;
		var rend = /^<\s*\/\s*([\w:-]+)[^>]*>/;
		var rattrs = /([\w:-]+)(?:\s*=\s*(?:(?:"((?:[^"])*)")|(?:'((?:[^'])*)')|([^>\s]+)))?/g;
		var rtag = /^</;
		var rtagend = /^<\s*\//;

		function createStack() {
			var stack = [];
			stack.lastItem = function lastItem() {
				return stack[stack.length - 1];
			};
			return stack;
		}

		function parser(html, handler) {
			var stack = createStack();
			var last = html;
			var chars;

			while (html) {
				parsePart();
			}
			parseEndTag(); // clean up any remaining tags

			function parsePart() {
				chars = true;
				parseTag();

				var same = html === last;
				last = html;

				if (same) { // discard, because it's invalid
					html = '';
				}
			}

			function parseTag() {
				if (html.substr(0, 4) === '<!--') { // comments
					parseComment();
				} else if (rtagend.test(html)) {
					parseEdge(rend, parseEndTag);
				} else if (rtag.test(html)) {
					parseEdge(rstart, parseStartTag);
				}
				parseTagDecode();
			}

			function parseEdge(regex, parser) {
				var match = html.match(regex);
				if (match) {
					html = html.substring(match[0].length);
					match[0].replace(regex, parser);
					chars = false;
				}
			}

			function parseComment() {
				var index = html.indexOf('-->');
				if (index >= 0) {
					if (handler.comment) {
						handler.comment(html.substring(4, index));
					}
					html = html.substring(index + 3);
					chars = false;
				}
			}

			function parseTagDecode() {
				if (!chars) {
					return;
				}
				var text;
				var index = html.indexOf('<');
				if (index >= 0) {
					text = html.substring(0, index);
					html = html.substring(index);
				} else {
					text = html;
					html = '';
				}
				if (handler.chars) {
					handler.chars(text);
				}
			}

			function parseStartTag(tag, tagName, rest, unary) {
				var attrs = {};
				var low = lowercase(tagName);
				var u = elements.voids[low] || !!unary;

				rest.replace(rattrs, attrReplacer);

				if (!u) {
					stack.push(low);
				}
				if (handler.start) {
					handler.start(low, attrs, u);
				}

				function attrReplacer(match, name, doubleQuotedValue, singleQuotedValue, unquotedValue) {
					if (doubleQuotedValue === void 0 && singleQuotedValue === void 0 && unquotedValue === void 0) {
						attrs[name] = void 0; // attribute is like <button disabled></button>
					} else {
						attrs[name] = he.decode(doubleQuotedValue || singleQuotedValue || unquotedValue || '');
					}
				}
			}

			function parseEndTag(tag, tagName) {
				var i;
				var pos = 0;
				var low = lowercase(tagName);
				if (low) {
					for (pos = stack.length - 1; pos >= 0; pos--) {
						if (stack[pos] === low) {
							break; // find the closest opened tag of the same type
						}
					}
				}
				if (pos >= 0) {
					for (i = stack.length - 1; i >= pos; i--) {
						if (handler.end) { // close all the open elements, up the stack
							handler.end(stack[i]);
						}
					}
					stack.length = pos;
				}
			}
		}

		module.exports = parser;

	}, { "./attributes": 1, "./elements": 3, "./lowercase": 5, "he": 9 }], 8: [function (require, module, exports) {
		'use strict';

		var he = require('he');
		var lowercase = require('./lowercase');
		var attributes = require('./attributes');
		var elements = require('./elements');

		function sanitizer(buffer, options) {
			var last;
			var context;
			var o = options || {};

			reset();

			return {
				start: start,
				end: end,
				chars: chars
			};

			function out(value) {
				buffer.push(value);
			}

			function start(tag, attrs, unary) {
				var low = lowercase(tag);

				if (context.ignoring) {
					ignore(low); return;
				}
				if ((o.allowedTags || []).indexOf(low) === -1) {
					ignore(low); return;
				}
				if (o.filter && !o.filter({ tag: low, attrs: attrs })) {
					ignore(low); return;
				}

				out('<');
				out(low);
				Object.keys(attrs).forEach(parse);
				out(unary ? '/>' : '>');

				function parse(key) {
					var value = attrs[key];
					var classesOk = (o.allowedClasses || {})[low] || [];
					var attrsOk = (o.allowedAttributes || {})[low] || [];
					attrsOk = attrsOk.concat((o.allowedAttributes || {})['*'] || []);
					var valid;
					var lkey = lowercase(key);
					if (lkey === 'class' && attrsOk.indexOf(lkey) === -1) {
						value = value.split(' ').filter(isValidClass).join(' ').trim();
						valid = value.length;
					} else {
						valid = attrsOk.indexOf(lkey) !== -1 && (attributes.uris[lkey] !== true || testUrl(value));
					}
					if (valid) {
						out(' ');
						out(key);
						if (typeof value === 'string') {
							out('="');
							out(he.encode(value));
							out('"');
						}
					}
					function isValidClass(className) {
						return classesOk && classesOk.indexOf(className) !== -1;
					}
				}
			}

			function end(tag) {
				var low = lowercase(tag);
				var allowed = (o.allowedTags || []).indexOf(low) !== -1;
				if (allowed) {
					if (context.ignoring === false) {
						out('</');
						out(low);
						out('>');
					} else {
						unignore(low);
					}
				} else {
					unignore(low);
				}
			}

			function testUrl(text) {
				var start = text[0];
				if (start === '#' || start === '/') {
					return true;
				}
				var colon = text.indexOf(':');
				if (colon === -1) {
					return true;
				}
				var questionmark = text.indexOf('?');
				if (questionmark !== -1 && colon > questionmark) {
					return true;
				}
				var hash = text.indexOf('#');
				if (hash !== -1 && colon > hash) {
					return true;
				}
				return o.allowedSchemes.some(matches);

				function matches(scheme) {
					return text.indexOf(scheme + ':') === 0;
				}
			}

			function chars(text) {
				if (context.ignoring === false) {
					out(o.transformText ? o.transformText(text) : text);
				}
			}

			function ignore(tag) {
				if (elements.voids[tag]) {
					return;
				}
				if (context.ignoring === false) {
					context = { ignoring: tag, depth: 1 };
				} else if (context.ignoring === tag) {
					context.depth++;
				}
			}

			function unignore(tag) {
				if (context.ignoring === tag) {
					if (--context.depth <= 0) {
						reset();
					}
				}
			}

			function reset() {
				context = { ignoring: false, depth: 0 };
			}
		}

		module.exports = sanitizer;

	}, { "./attributes": 1, "./elements": 3, "./lowercase": 5, "he": 9 }], 9: [function (require, module, exports) {
		'use strict';

		var escapes = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		};
		var unescapes = {
			'&amp;': '&',
			'&lt;': '<',
			'&gt;': '>',
			'&quot;': '"',
			'&#39;': "'"
		};
		var rescaped = /(&amp;|&lt;|&gt;|&quot;|&#39;)/g;
		var runescaped = /[&<>"']/g;

		function escapeHtmlChar(match) {
			return escapes[match];
		}
		function unescapeHtmlChar(match) {
			return unescapes[match];
		}

		function escapeHtml(text) {
			return text == null ? '' : String(text).replace(runescaped, escapeHtmlChar);
		}

		function unescapeHtml(html) {
			return html == null ? '' : String(html).replace(rescaped, unescapeHtmlChar);
		}

		escapeHtml.options = unescapeHtml.options = {};

		module.exports = {
			encode: escapeHtml,
			escape: escapeHtml,
			decode: unescapeHtml,
			unescape: unescapeHtml,
			version: '1.0.0-browser'
		};

	}, {}], 10: [function (require, module, exports) {
		'use strict';

		function toMap(list) {
			return list.reduce(asKey, {});
		}

		function asKey(accumulator, item) {
			accumulator[item] = true;
			return accumulator;
		}

		module.exports = toMap;

	}, {}]
}, {}, [4]);

// ESM-comment-begin
define(function() { return { insane: __insane_func }; });
// ESM-comment-end

// ESM-uncomment-begin
// export var insane = __insane_func;
// ESM-uncomment-end
