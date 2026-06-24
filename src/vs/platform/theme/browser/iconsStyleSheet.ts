/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as css from '../../../base/browser/cssValue.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { getIconRegistry, IconContribution, IconFontDefinition } from '../common/iconRegistry.js';
import { IProductIconTheme, IThemeService } from '../common/themeService.js';

export interface IIconsStyleSheet extends IDisposable {
	getCSS(): css.CssFragment;
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
		getCSS(): css.CssFragment {
			const productIconTheme = themeService ? themeService.getProductIconTheme() : new UnthemedProductIconTheme();
			const usedFontIds: { [id: string]: IconFontDefinition } = {};

			const rules = new css.Builder();
			const rootAttribs = new css.Builder();
			for (const contribution of iconRegistry.getIcons()) {
				const definition = productIconTheme.getIcon(contribution);
				if (!definition) {
					continue;
				}

				const fontContribution = definition.font;
				const fontFamilyVar = css.inline`--vscode-icon-${css.className(contribution.id)}-font-family`;
				const contentVar = css.inline`--vscode-icon-${css.className(contribution.id)}-content`;
				if (fontContribution) {
					usedFontIds[fontContribution.id] = fontContribution.definition;
					rootAttribs.push(
						css.inline`${fontFamilyVar}: ${css.stringValue(fontContribution.id)};`,
						css.inline`${contentVar}: ${css.stringValue(definition.fontCharacter)};`,
					);
					rules.push(css.inline`.codicon-${css.className(contribution.id)}:before { content: ${css.stringValue(definition.fontCharacter)}; font-family: ${css.stringValue(fontContribution.id)}; }`);
				} else {
					rootAttribs.push(css.inline`${contentVar}: ${css.stringValue(definition.fontCharacter)}; ${fontFamilyVar}: 'codicon';`);
					rules.push(css.inline`.codicon-${css.className(contribution.id)}:before { content: ${css.stringValue(definition.fontCharacter)}; }`);
				}
			}

			for (const id in usedFontIds) {
				const definition = usedFontIds[id];
				const fontWeight = definition.weight ? css.inline`font-weight: ${css.identValue(definition.weight)};` : css.inline``;
				const fontStyle = definition.style ? css.inline`font-style: ${css.identValue(definition.style)};` : css.inline``;

				const src = new css.Builder();
				for (const l of definition.src) {
					src.push(css.inline`${css.asCSSUrl(l.location)} format(${css.stringValue(l.format)})`);
				}
				rules.push(css.inline`@font-face { src: ${src.join(', ')}; font-family: ${css.stringValue(id)};${fontWeight}${fontStyle} font-display: block; }`);
			}

			rules.push(css.inline`:root { ${rootAttribs.join(' ')} }`);

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
