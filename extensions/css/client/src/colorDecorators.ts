/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as parse from 'parse-color';
import { workspace, Range, TextDocument, DocumentColorProvider, Color, ColorRange, Event, EventEmitter } from 'vscode';

const CSSColorFormats = {
	Hex: '#{red:X}{green:X}{blue:X}',
	RGB: {
		opaque: 'rgb({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]})',
		transparent: 'rgba({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]}, {alpha})'
	},
	HSL: {
		opaque: 'hsl({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%)',
		transparent: 'hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%, {alpha})'
	}
};

export class ColorProvider implements DocumentColorProvider {
	private onDidChangeColorsEmitter = new EventEmitter<void>();
	private decoratorEnablement = {};

	constructor(private decoratorProvider: (uri: string) => Thenable<Range[]>, private supportedLanguages: { [id: string]: boolean }, isDecoratorEnabled: (languageId: string) => boolean) {
		for (let languageId in supportedLanguages) {
			this.decoratorEnablement[languageId] = isDecoratorEnabled(languageId);
		}

		workspace.onDidChangeConfiguration(_ => {
			let hasChanges = false;
			for (let languageId in supportedLanguages) {
				let prev = this.decoratorEnablement[languageId];
				let curr = isDecoratorEnabled(languageId);
				if (prev !== curr) {
					this.decoratorEnablement[languageId] = curr;
					hasChanges = true;
				}
			}
			if (hasChanges) {
				this.onDidChangeColorsEmitter.fire();
			}
		});
	}

	public get onDidChangeColors(): Event<void> {
		return this.onDidChangeColorsEmitter.event;
	}

	async provideDocumentColors(document: TextDocument): Promise<ColorRange[]> {
		if (!this.supportedLanguages[document.languageId] || !this.decoratorEnablement[document.languageId]) {
			return [];
		}

		const ranges = await this.decoratorProvider(document.uri.toString());
		const result = [];
		for (let range of ranges) {
			let color;
			const value = document.getText(range);
			const parsedColor = parse(value);
			if (parsedColor && parsedColor.rgba) {
				const [red, green, blue, alpha] = parsedColor.rgba;
				color = new Color(red, green, blue, alpha);
			}

			if (color) {
				result.push(new ColorRange(range, color, [CSSColorFormats.Hex, CSSColorFormats.RGB, CSSColorFormats.HSL]));
			}
		}
		return result;
	}
}