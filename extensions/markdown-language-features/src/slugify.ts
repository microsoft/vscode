/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Slug {
	public constructor(
		public readonly value: string
	) { }

	public equals(other: Slug): boolean {
		return this.value === other.value;
	}
}

export interface Slugifier {
	fromHeading(heading: string): Slug;
}

export const stripSlugifier: Slugifier = new class implements Slugifier {
	private readonly specialChars: any = { 'à': 'a', 'ä': 'a', 'ã': 'a', 'á': 'a', 'â': 'a', 'æ': 'a', 'å': 'a', 'ë': 'e', 'è': 'e', 'é': 'e', 'ê': 'e', 'î': 'i', 'ï': 'i', 'ì': 'i', 'í': 'i', 'ò': 'o', 'ó': 'o', 'ö': 'o', 'ô': 'o', 'ø': 'o', 'ù': 'o', 'ú': 'u', 'ü': 'u', 'û': 'u', 'ñ': 'n', 'ç': 'c', 'ß': 's', 'ÿ': 'y', 'œ': 'o', 'ŕ': 'r', 'ś': 's', 'ń': 'n', 'ṕ': 'p', 'ẃ': 'w', 'ǵ': 'g', 'ǹ': 'n', 'ḿ': 'm', 'ǘ': 'u', 'ẍ': 'x', 'ź': 'z', 'ḧ': 'h', '·': '-', '/': '-', '_': '-', ',': '-', ':': '-', ';': '-', 'З': '3', 'з': '3' };

	public fromHeading(heading: string): Slug {
		const slugifiedHeading = encodeURI(heading.trim()
			.toLowerCase()
			.replace(/./g, c => this.specialChars[c] || c)
			.replace(/[\]\[\!\'\#\$\%\&\'\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`]/g, '')
			.replace(/\s+/g, '-') // Replace whitespace with -
			.replace(/[^\w\-]+/g, '') // Remove remaining non-word chars
			.replace(/^\-+/, '') // Remove leading -
			.replace(/\-+$/, '') // Remove trailing -
		);
		return new Slug(slugifiedHeading);
	}
};