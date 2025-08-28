/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { decode } from 'he';

const attrRE = /\s([^'"\/\s=><]+?)[\s\/>]|([^\s=]+)=\s?(".*?"|'.*?'|[^>\s]+)/g;

export interface HtmlNode {
	type: 'text' | 'tag' | 'comment';
	parent?: HtmlNode;
	name?: string;
	comment?: string;
	content?: string;
	voidElement?: boolean;
	attrs?: Record<string, string | Record<string, string>>;
	children?: Array<HtmlNode>;
}

const voidElements: Record<string, boolean> = {
	'area': true,
	'base': true,
	'br': true,
	'col': true,
	'embed': true,
	'hr': true,
	'img': true,
	'input': true,
	'link': true,
	'meta': true,
	'param': true,
	'source': true,
	'track': true,
	'wbr': true
};

function parseTag(tag: string, parent?: HtmlNode): HtmlNode {
	const res: HtmlNode = {
		type: 'tag',
		name: '',
		voidElement: false,
		attrs: {},
		children: [],
		parent
	};

	const tagMatch = tag.match(/<\/?([^\s]+?)[/\s>]/);
	if (tagMatch) {
		res.name = tagMatch[1];
		if (voidElements[tagMatch[1]] ||
			tag.charAt(tag.length - 2) === '/'
		) {
			res.voidElement = true;
		}

		if (res.name.startsWith('!--')) {
			const endIndex = tag.indexOf('-->');
			return {
				type: 'comment',
				parent,
				comment: endIndex !== -1 ? tag.slice(4, endIndex) : '',
			};
		}
	}

	const reg = new RegExp(attrRE);
	let result = null;
	for (; ;) {
		result = reg.exec(tag);

		if (result === null) {
			break;
		}

		if (!result[0].trim()) {
			continue;
		}

		if (result[1]) {
			const attr = result[1].trim();

			let arr: Array<any> = [attr, ''];

			if (attr.indexOf('=') > -1) {
				arr = attr.split('=');
			}

			if (!res.attrs) {
				res.attrs = {};
			}
			res.attrs[arr[0]] = arr[1];
			reg.lastIndex--;
		} else if (result[2]) {
			let attrName = result[2].trim();
			const lowerCaseAttrName = attrName.toLowerCase();

			if (lowerCaseAttrName.startsWith('on')) {
				continue;
			}

			if (lowerCaseAttrName === 'class') {
				attrName = 'className';
			} else if (lowerCaseAttrName === 'for') {
				attrName = 'htmlFor';
			} else if (lowerCaseAttrName === 'tabindex') {
				attrName = 'tabIndex';
			} else if (lowerCaseAttrName === 'maxlength') {
				attrName = 'maxLength';
			} else if (lowerCaseAttrName === 'readonly') {
				attrName = 'readOnly';
			}

			let attrValue = result[3].trim();

			const quoteChars = [`"`, `'`];
			const attrIsQuoted = quoteChars.includes(attrValue.charAt(0)) && quoteChars.includes(attrValue.charAt(attrValue.length - 1));
			if (attrIsQuoted) {
				attrValue = attrValue.substring(1, attrValue.length - 1);
			}

			if (!res.attrs) {
				res.attrs = {};
			}
			res.attrs[attrName] = lowerCaseAttrName === 'style' ? parseStyles(attrValue) : attrValue;
		}
	}

	return res;
}

function parseStyles(inlineCss: string): Record<string, string> {
	const styleObject: Record<string, string> = {};

	const declarations = inlineCss.split(';');

	declarations.forEach(declaration => {
		if (declaration.indexOf(':') === -1) {
			return;
		}

		const [property, value] = declaration.split(':');

		const trimmedProperty = property.trim();
		const trimmedValue = value.trim();
		if (trimmedProperty && trimmedValue) {
			const camelCaseProperty = trimmedProperty.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

			styleObject[camelCaseProperty] = trimmedValue;
		}
	});

	return styleObject;
}

const tagRE = /<[a-zA-Z0-9\-\!\/](?:"[^"]*"|'[^']*'|[^'">])*>/g;
const whitespaceRE = /^\s*$/;

export function parseHtml(html: string): Array<HtmlNode> {
	const result: Array<HtmlNode> = [];
	const arr: Array<HtmlNode> = [];
	let current: HtmlNode | undefined;
	let level = -1;

	if (html.indexOf('<') !== 0) {
		const end = html.indexOf('<');
		result.push({
			type: 'text',
			content: end === -1 ? decode(html) : decode(html.substring(0, end)),
		});
	}

	html.replace(tagRE, (tag: string, index: number): string => {
		const isOpen = tag.charAt(1) !== '/';
		const isComment = tag.startsWith('<!--');
		const start = index + tag.length;
		const nextChar = html.charAt(start);

		if (isComment) {
			const comment = parseTag(tag, current);

			if (level < 0) {
				result.push(comment);
				return '';
			}
			const parent = arr[level];
			if (parent.children === undefined) {
				parent.children = [];
			}
			parent.children.push(comment);
			return '';
		}

		if (isOpen) {
			level++;

			current = parseTag(tag, current);
			if (!current.voidElement &&
				nextChar &&
				nextChar !== '<'
			) {
				if (current.children === undefined) {
					current.children = [];
				}
				current.children.push({
					type: 'text',
					content: decode(html.slice(start, html.indexOf('<', start))),
				});
			}

			if (level === 0) {
				result.push(current);
			}

			const parent = arr[level - 1];

			if (parent) {
				if (parent.children === undefined) {
					parent.children = [];
				}
				parent.children.push(current);
			}

			arr[level] = current;
		}

		if (current && (!isOpen || current.voidElement)) {
			if (level > -1 &&
				(current.voidElement || current.name === tag.slice(2, -1))
			) {
				level--;
				if (current.parent) {
					current = current.parent;
				}
			}
			if (nextChar !== '<' && nextChar) {

				if (level !== -1) {
					if (arr[level].children === undefined) {
						arr[level].children = [];
					}
				}
				const parent = level === -1 ? result : arr[level].children!;

				const end = html.indexOf('<', start);
				let content = html.slice(start, end === -1 ? undefined : end);

				if (whitespaceRE.test(content)) {
					content = ' ';
				}

				if ((end > -1 && level + parent.length >= 0) || content !== ' ') {
					parent.push({
						type: 'text',
						parent: current,
						content: decode(content),
					});
				}
			}
		}

		return '';
	});

	return result;
}
