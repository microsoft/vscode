/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITagSet, IAttributeSet, HTMLTagSpecification } from 'vscode-html-languageservice';

interface Tag {
	label: string;
	description: string;
	attributes: Attribute[];
}
interface Attribute {
	label: string;
	description: string;
}
interface RawTagSet {
	tags: Tag[];
}
interface RawAttributeSet {
	attributes: Attribute[];
}

export function parseTagSet(source: string): ITagSet {
	const tagSet: ITagSet = {};

	let rawTagSet: RawTagSet;
	try {
		rawTagSet = JSON.parse(source);
	} catch (err) {
		return {};
	}

	rawTagSet.tags.forEach(c => {
		tagSet[c.label] = new HTMLTagSpecification(c.description, c.attributes.map(a => a.label));
	});

	return tagSet;
}

export function parseAttributes(source: string): IAttributeSet {
	const attributeSet: IAttributeSet = {};

	let rawAttributeSet: RawAttributeSet;
	try {
		rawAttributeSet = JSON.parse(source);
	} catch (err) {
		return {};
	}

	rawAttributeSet.attributes.forEach(ag => {
		attributeSet[ag.label] = {
			...ag
		};
	});

	return attributeSet;
}