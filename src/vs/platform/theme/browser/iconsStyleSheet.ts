/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asCSSPropertyValue, asCSSUrl } from '../../../base/browser/dom.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { getIconRegistry, IconContribution, IconFontDefinition } from '../common/iconRegistry.js';
import { IProductIconTheme, IThemeService } from '../common/themeService.js';

export interface IIconsStyleSheet extends IDisposable {
	getCSS(): string;
	readonly onDidChange: Event<void>;
}

export function getIconsStyleSheet(themeService: IThemeService | undefined): IIconsStyleSheet {
	const disposable = new DisposableStore();

	const onDidChangeEmmiter = disposable.add(new Emitter<void>());
	const iconRegistry = getIconRegistry();
	disposable.add(iconRegistry.onDidChange(() => onDidChangeEmmiter.fire()));
	if (themeService) {
		disposable.add(themeService.onDidProductIconThemeChange(() => onDidChangeEmmiter.fire()));
	}

	return {
		dispose: () => disposable.dispose(),
		onDidChange: onDidChangeEmmiter.event,
		getCSS() {
			const productIconTheme = themeService ? themeService.getProductIconTheme() : new UnthemedProductIconTheme();
			const usedFontIds: { [id: string]: IconFontDefinition } = {};

			const rules: string[] = [];
			const rootAttribs: string[] = [];
			for (const contribution of iconRegistry.getIcons()) {
				const definition = productIconTheme.getIcon(contribution);
				if (!definition) {
					continue;
				}

				const fontContribution = definition.font;
				const fontFamilyVar = `--vscode-icon-${contribution.id}-font-family`;
				const contentVar = `--vscode-icon-${contribution.id}-content`;
				if (fontContribution) {
					usedFontIds[fontContribution.id] = fontContribution.definition;
					rootAttribs.push(
						`${fontFamilyVar}: ${asCSSPropertyValue(fontContribution.id)};`,
						`${contentVar}: '${definition.fontCharacter}';`,
					);
					rules.push(`.codicon-${contribution.id}:before { content: '${definition.fontCharacter}'; font-family: ${asCSSPropertyValue(fontContribution.id)}; }`);
				} else {
					rootAttribs.push(`${contentVar}: '${definition.fontCharacter}'; ${fontFamilyVar}: 'codicon';`);
					rules.push(`.codicon-${contribution.id}:before { content: '${definition.fontCharacter}'; }`);
				}
			}

			for (const id in usedFontIds) {
				const definition = usedFontIds[id];
				const fontWeight = definition.weight ? `font-weight: ${definition.weight};` : '';
				const fontStyle = definition.style ? `font-style: ${definition.style};` : '';
				const src = definition.src.map(l => `${asCSSUrl(l.location)} format('${l.format}')`).join(', ');
				rules.push(`@font-face { src: ${src}; font-family: ${asCSSPropertyValue(id)};${fontWeight}${fontStyle} font-display: block; }`);
			}

			rules.push(`:root { ${rootAttribs.join(' ')} }`);

			return rules.join('\n');
		}
	};
}

export class UnthemedProductIconTheme implements IProductIconTheme {
	getIcon(contribution: IconContribution) {
		const iconRegistry = getIconRegistry();
		let definition = contribution.defaults;
		while (ThemeIcon.isThemeIcon(definition)) {
			const c = iconRegistry.getIcon(definition.id);
			if (!c) {
				return undefined;
			}
			definition = c.defaults;
		}
		return definition;
	}
}
