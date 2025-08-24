/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

import { HtmlNode, parseHtml } from '../../common/htmlParser.js';

interface HTMLRendererOptions {
	componentOverrides?: Record<string, (props: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>) => React.ReactElement>;
}

export const renderHtml = (html: string, opts: HTMLRendererOptions = {}): React.ReactElement => {

	let parsedContent = [];
	try {
		parsedContent = parseHtml(html);
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : e.toString();
		return <div className='error'>{errorMessage}</div>;
	}

	function createElement(name: string, attrs: React.DOMAttributes<HTMLElement>, children?: (React.ReactNode | string)[] | React.ReactNode | string) {
		if (name && name[0] === '!') {
			return undefined;
		}
		const Component = opts.componentOverrides?.[name] || name;
		return React.createElement(Component, attrs, children);
	}

	const renderNode = (node: HtmlNode): React.ReactElement | undefined => {

		const nodeAttrs: React.DOMAttributes<HTMLElement> = node.attrs || {};

		if (node.type === 'text') {
			if (node.content && node.content.trim().length > 0) {
				return React.createElement('span', {}, node.content);
			}
			return undefined;
		} else if (node.type === 'tag' && node.children) {
			if (node.children.length === 1 && node.children[0].type === 'text') {
				return createElement(node.name!, nodeAttrs, node.children[0].content);
			} else {
				if (node.children.length === 0) {
					return createElement(node.name!, nodeAttrs);
				} else {
					const children = node.children.map(renderNode);
					return createElement(node.name!, nodeAttrs, children);
				}
			}
		} else if (node.type === 'tag') {
			return createElement(node.name!, node.attrs!);
		} else {
			return undefined;
		}
	};

	let renderedNodes = [];
	try {
		renderedNodes = parsedContent.map(renderNode);
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : e.toString();
		return <div className='error'>{errorMessage}</div>;
	}

	return <div>{renderedNodes}</div>;
};
