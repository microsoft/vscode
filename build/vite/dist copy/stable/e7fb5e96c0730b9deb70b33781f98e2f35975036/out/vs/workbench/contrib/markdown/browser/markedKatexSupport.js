/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAMDNodeModule, resolveAmdNodeModulePath } from '../../../../amdX.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { katexContainerLatexAttributeName, MarkedKatexExtension } from '../common/markedKatexExtension.js';
export class MarkedKatexSupport {
    static getSanitizerOptions(baseConfig) {
        return {
            allowedTags: {
                override: [
                    ...baseConfig.allowedTags,
                    ...trustedMathMlTags,
                ]
            },
            allowedAttributes: {
                override: [
                    ...baseConfig.allowedAttributes,
                    // Math
                    'stretchy',
                    'encoding',
                    'accent',
                    katexContainerLatexAttributeName,
                    // SVG
                    'd',
                    'viewBox',
                    'preserveAspectRatio',
                    // Allow all classes since we don't have a list of allowed katex classes
                    'class',
                    // Sanitize allowed styles for katex
                    {
                        attributeName: 'style',
                        shouldKeep: (_el, data) => this.sanitizeKatexStyles(data.attrValue),
                    },
                ]
            },
        };
    }
    static { this.tempSanitizerRule = new Lazy(() => {
        // Create a CSSStyleDeclaration object via a style sheet rule
        const styleSheet = new CSSStyleSheet();
        styleSheet.insertRule(`.temp{}`);
        const rule = styleSheet.cssRules[0];
        if (!(rule instanceof CSSStyleRule)) {
            throw new Error('Invalid CSS rule');
        }
        return rule.style;
    }); }
    static sanitizeStyles(styleString, allowedProperties) {
        const style = this.tempSanitizerRule.value;
        style.cssText = styleString;
        const sanitizedProps = [];
        for (let i = 0; i < style.length; i++) {
            const prop = style[i];
            if (allowedProperties.includes(prop)) {
                const value = style.getPropertyValue(prop);
                // Allow through lists of numbers with units or bare words like 'block'
                // Main goal is to block things like 'url()'.
                if (/^(([\d\.\-]+\w*\s?)+|\w+)$/.test(value)) {
                    sanitizedProps.push(`${prop}: ${value}`);
                }
            }
        }
        return sanitizedProps.join('; ');
    }
    static sanitizeKatexStyles(styleString) {
        const allowedProperties = [
            'display',
            'position',
            'font-family',
            'font-style',
            'font-weight',
            'font-size',
            'height',
            'min-height',
            'max-height',
            'width',
            'min-width',
            'max-width',
            'margin',
            'margin-top',
            'margin-right',
            'margin-bottom',
            'margin-left',
            'padding',
            'padding-top',
            'padding-right',
            'padding-bottom',
            'padding-left',
            'top',
            'left',
            'right',
            'bottom',
            'vertical-align',
            'transform',
            'border',
            'border-top-width',
            'border-right-width',
            'border-bottom-width',
            'border-left-width',
            'color',
            'white-space',
            'text-align',
            'line-height',
            'float',
            'clear',
        ];
        return this.sanitizeStyles(styleString, allowedProperties);
    }
    static { this._katexPromise = new Lazy(async () => {
        this._katex = await importAMDNodeModule('katex', 'dist/katex.min.js');
        return this._katex;
    }); }
    static getExtension(window, options = {}) {
        if (!this._katex) {
            return undefined;
        }
        this.ensureKatexStyles(window);
        return MarkedKatexExtension.extension(this._katex, options);
    }
    static async loadExtension(window, options = {}) {
        const katex = await this._katexPromise.value;
        this.ensureKatexStyles(window);
        return MarkedKatexExtension.extension(katex, options);
    }
    static ensureKatexStyles(window) {
        const doc = window.document;
        // eslint-disable-next-line no-restricted-syntax
        if (!doc.querySelector('link.katex')) {
            const katexStyle = document.createElement('link');
            katexStyle.classList.add('katex');
            katexStyle.rel = 'stylesheet';
            katexStyle.href = resolveAmdNodeModulePath('katex', 'dist/katex.min.css');
            doc.head.appendChild(katexStyle);
        }
    }
}
const trustedMathMlTags = Object.freeze([
    'semantics',
    'annotation',
    'math',
    'menclose',
    'merror',
    'mfenced',
    'mfrac',
    'mglyph',
    'mi',
    'mlabeledtr',
    'mmultiscripts',
    'mn',
    'mo',
    'mover',
    'mpadded',
    'mphantom',
    'mroot',
    'mrow',
    'ms',
    'mspace',
    'msqrt',
    'mstyle',
    'msub',
    'msup',
    'msubsup',
    'mtable',
    'mtd',
    'mtext',
    'mtr',
    'munder',
    'munderover',
    'mprescripts',
    // svg tags
    'svg',
    'altglyph',
    'altglyphdef',
    'altglyphitem',
    'circle',
    'clippath',
    'defs',
    'desc',
    'ellipse',
    'filter',
    'font',
    'g',
    'glyph',
    'glyphref',
    'hkern',
    'line',
    'lineargradient',
    'marker',
    'mask',
    'metadata',
    'mpath',
    'path',
    'pattern',
    'polygon',
    'polyline',
    'radialgradient',
    'rect',
    'stop',
    'style',
    'switch',
    'symbol',
    'text',
    'textpath',
    'title',
    'tref',
    'tspan',
    'view',
    'vkern',
]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2VkS2F0ZXhTdXBwb3J0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWFya2Rvd24vYnJvd3Nlci9tYXJrZWRLYXRleFN1cHBvcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHdCQUF3QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFJcEYsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTNHLE1BQU0sT0FBTyxrQkFBa0I7SUFFdkIsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFVBR2pDO1FBQ0EsT0FBTztZQUNOLFdBQVcsRUFBRTtnQkFDWixRQUFRLEVBQUU7b0JBQ1QsR0FBRyxVQUFVLENBQUMsV0FBVztvQkFDekIsR0FBRyxpQkFBaUI7aUJBQ3BCO2FBQ0Q7WUFDRCxpQkFBaUIsRUFBRTtnQkFDbEIsUUFBUSxFQUFFO29CQUNULEdBQUcsVUFBVSxDQUFDLGlCQUFpQjtvQkFFL0IsT0FBTztvQkFDUCxVQUFVO29CQUNWLFVBQVU7b0JBQ1YsUUFBUTtvQkFDUixnQ0FBZ0M7b0JBRWhDLE1BQU07b0JBQ04sR0FBRztvQkFDSCxTQUFTO29CQUNULHFCQUFxQjtvQkFFckIsd0VBQXdFO29CQUN4RSxPQUFPO29CQUVQLG9DQUFvQztvQkFDcEM7d0JBQ0MsYUFBYSxFQUFFLE9BQU87d0JBQ3RCLFVBQVUsRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO3FCQUNuRTtpQkFDRDthQUNEO1NBQ0QsQ0FBQztJQUNILENBQUM7YUFFYyxzQkFBaUIs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