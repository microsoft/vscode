/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as css from '../../../base/browser/cssValue.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { getIconRegistry } from '../common/iconRegistry.js';
export function getIconsStyleSheet(themeService) {
    const disposable = new DisposableStore();
    const onDidChangeEmmiter = disposable.add(new Emitter());
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
            const usedFontIds = {};
            const rules = new css.Builder();
            const rootAttribs = new css.Builder();
            for (const contribution of iconRegistry.getIcons()) {
                const definition = productIconTheme.getIcon(contribution);
                if (!definition) {
                    continue;
                }
                const fontContribution = definition.font;
                const fontFamilyVar = css.inline `--vscode-icon-${css.className(contribution.id)}-font-family`;
                const contentVar = css.inline `--vscode-icon-${css.className(contribution.id)}-content`;
                if (fontContribution) {
                    usedFontIds[fontContribution.id] = fontContribution.definition;
                    rootAttribs.push(css.inline `${fontFamilyVar}: ${css.stringValue(fontContribution.id)};`, css.inline `${contentVar}: ${css.stringValue(definition.fontCharacter)};`);
                    rules.push(css.inline `.codicon-${css.className(contribution.id)}:before { content: ${css.stringValue(definition.fontCharacter)}; font-family: ${css.stringValue(fontContribution.id)}; }`);
                }
                else {
                    rootAttribs.push(css.inline `${contentVar}: ${css.stringValue(definition.fontCharacter)}; ${fontFamilyVar}: 'codicon';`);
                    rules.push(css.inline `.codicon-${css.className(contribution.id)}:before { content: ${css.stringValue(definition.fontCharacter)}; }`);
                }
            }
            for (const id in usedFontIds) {
                const definition = usedFontIds[id];
                const fontWeight = definition.weight ? css.inline `font-weight: ${css.identValue(definition.weight)};` : css.inline ``;
                const fontStyle = definition.style ? css.inline `font-style: ${css.identValue(definition.style)};` : css.inline ``;
                const src = new css.Builder();
                for (const l of definition.src) {
                    src.push(css.inline `${css.asCSSUrl(l.location)} format(${css.stringValue(l.format)})`);
                }
                rules.push(css.inline `@font-face { src: ${src.join(', ')}; font-family: ${css.stringValue(id)};${fontWeight}${fontStyle} font-display: block; }`);
            }
            rules.push(css.inline `:root { ${rootAttribs.join(' ')} }`);
            return rules.join('\n');
        }
    };
}
export class UnthemedProductIconTheme {
    getIcon(contribution) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWNvbnNTdHlsZVNoZWV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9pY29uc1N0eWxlU2hlZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxtQ0FBbUMsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUF3QyxNQUFNLDJCQUEyQixDQUFDO0FBUWxHLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxZQUF1QztJQUN6RSxNQUFNLFVBQVUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBRXpDLE1BQU0sa0JBQWtCLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7SUFDL0QsTUFBTSxZQUFZLEdBQUcsZUFBZSxFQUFFLENBQUM7SUFDdkMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxRSxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQ2xCLFVBQVUsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMzRixDQUFDO0lBRUQsT0FBTztRQUNOLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFO1FBQ25DLFdBQVcsRUFBRSxrQkFBa0Is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