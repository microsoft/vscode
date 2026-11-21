/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DecorationInput, DecorationKindInput, DecorationStrokeStyle } from './editorViewTypes.js';
import { Color } from '../../../../base/common/color.js';
import type { ViewModelDecoration } from '../../../common/viewModel/viewModelDecoration.js';
import { mainWindow } from '../../../../base/browser/window.js';

interface IResolvedDecorationPaint {
	readonly styleId: number;
	readonly kinds: readonly DecorationKindInput[];
}

interface IBorderSide {
	readonly color: Color;
	readonly width: number;
	readonly style: Exclude<DecorationStrokeStyle, 'wavy'>;
}

/**
 * Text paint an inline decoration (`inlineClassName`) applies to the characters
 * it covers, as far as the GPU renderer can draw it without changing layout.
 * Absent fields leave the token's own value.
 */
export interface IInlineTextStyle {
	/** Distinct per resolved class combination; stable until {@link EditorViewDecorationResolver.clear}. */
	readonly id: number;
	/** Packed `0xRRGGBBAA`. */
	readonly foreground?: number;
	/** Multiplies the foreground alpha (`opacity`, `visibility: hidden`). */
	readonly opacity?: number;
	readonly bold?: true;
	readonly italic?: true;
}

/** Sentinel parent color: a decoration that sets `color` computes to something else. */
const INLINE_SENTINEL_COLOR = 'rgb(1, 2, 3)';

/**
 * Resolves the browser's final CSS cascade for content decorations into the
 * narrow typed paint vocabulary supported by `@vscode/editor-view`.
 */
export class EditorViewDecorationResolver {

	private readonly _cache = new Map<string, IResolvedDecorationPaint | null>();
	private readonly _container: HTMLElement;
	private readonly _baseline: HTMLElement;
	private readonly _probe: HTMLElement;
	private _nextStyleId = 1;

	private readonly _inlineCache = new Map<string, IInlineTextStyle | null>();
	private readonly _inlineContainer: HTMLElement;
	private readonly _inlineBaseline: HTMLElement;
	private readonly _inlineProbe: HTMLElement;
	private readonly _inlineTokenProbe: HTMLElement;
	private _nextInlineStyleId = 1;

	constructor(private readonly _editorRoot: HTMLElement) {
		// Auxiliary documents disallow element creation to preserve the main DOM realm.
		const document = mainWindow.document;
		this._container = document.createElement('div');
		this._container.className = 'view-overlays';
		this._container.style.position = 'absolute';
		this._container.style.visibility = 'hidden';
		this._container.style.pointerEvents = 'none';
		this._container.style.width = '100px';
		this._container.style.height = '20px';

		const line = document.createElement('div');
		line.style.width = '100px';
		line.style.height = '20px';
		this._baseline = document.createElement('div');
		this._baseline.className = 'cdr';
		this._probe = document.createElement('div');
		line.append(this._baseline, this._probe);
		this._container.append(line);

		// Mirrors a rendered token span, `.view-lines > .view-line > span > span.mtkN`,
		// so view-line-scoped decoration selectors match. Hidden with opacity, not
		// visibility, because probes read their own `visibility`.
		this._inlineContainer = document.createElement('div');
		this._inlineContainer.className = 'view-lines';
		this._inlineContainer.style.position = 'absolute';
		this._inlineContainer.style.opacity = '0';
		this._inlineContainer.style.pointerEvents = 'none';
		const inlineLine = document.createElement('div');
		inlineLine.className = 'view-line';
		const inlineParent = document.createElement('span');
		inlineParent.style.color = INLINE_SENTINEL_COLOR;
		this._inlineBaseline = document.createElement('span');
		this._inlineProbe = document.createElement('span');
		this._inlineTokenProbe = document.createElement('span');
		inlineParent.append(this._inlineBaseline, this._inlineProbe, this._inlineTokenProbe);
		inlineLine.append(inlineParent);
		this._inlineContainer.append(inlineLine);
	}

	public clear(): void {
		this._cache.clear();
		this._nextStyleId = 1;
		this._inlineCache.clear();
		this._nextInlineStyleId = 1;
	}

	/**
	 * Resolve the text paint of a span carrying `className` (one or more inline
	 * decoration classes) on top of its token classes. Returns `undefined` when
	 * the classes paint something the renderer can't draw in place yet (boxes,
	 * text decorations, pseudo-element content) or change the text's width.
	 */
	public resolveInlineStyle(className: string): IInlineTextStyle | undefined {
		const cached = this._inlineCache.get(className);
		if (cached !== undefined) {
			return cached ?? undefined;
		}
		const resolved = this._readInlineStyle(className);
		this._inlineCache.set(className, resolved ?? null);
		return resolved;
	}

	private _readInlineStyle(className: string): IInlineTextStyle | undefined {
		const window = this._editorRoot.ownerDocument.defaultView;
		if (!window) {
			return undefined;
		}
		this._inlineBaseline.className = 'mtk1';
		this._inlineProbe.className = className;
		this._inlineTokenProbe.className = `mtk1 ${className}`;
		this._editorRoot.append(this._inlineContainer);
		try {
			const baseline = window.getComputedStyle(this._inlineBaseline);
			const style = window.getComputedStyle(this._inlineProbe);
			const tokenStyle = window.getComputedStyle(this._inlineTokenProbe);
			if (this._hasUnsupportedInlinePaint(style, baseline)
				|| this._pseudoElementPaints(window.getComputedStyle(this._inlineProbe, '::before'))
				|| this._pseudoElementPaints(window.getComputedStyle(this._inlineProbe, '::after'))) {
				return undefined;
			}

			let foreground: number | undefined;
			const sentinel = Color.Format.CSS.parse(INLINE_SENTINEL_COLOR);
			const color = Color.Format.CSS.parse(style.color);
			// The decoration sets `color`, and its rule wins over token colors
			// (the DOM span carries both, e.g. `mtk1 bracket-highlighting-0`).
			if (color && sentinel && !color.equals(sentinel) && style.color === tokenStyle.color) {
				foreground = this._packColor(color);
			}
			let opacity = Number.parseFloat(style.opacity);
			if (style.visibility !== 'visible') {
				opacity = 0;
			}
			const italic = style.fontStyle !== 'normal' && baseline.fontStyle === 'normal';
			const bold = Number.parseInt(style.fontWeight, 10) >= 600 && Number.parseInt(baseline.fontWeight, 10) < 600;
			if (foreground === undefined && !(opacity < 1) && !italic && !bold) {
				return undefined;
			}
			return {
				id: this._nextInlineStyleId++,
				...(foreground !== undefined ? { foreground } : {}),
				...(opacity < 1 ? { opacity: Math.max(0, opacity) } : {}),
				...(bold ? { bold: true } : {}),
				...(italic ? { italic: true } : {}),
			};
		} finally {
			this._inlineContainer.remove();
		}
	}

	/** Paint or geometry the renderer cannot draw in place of DOM text yet. */
	private _hasUnsupportedInlinePaint(style: CSSStyleDeclaration, baseline: CSSStyleDeclaration): boolean {
		if (this._visibleColor(style.backgroundColor)
			|| style.backgroundImage !== 'none'
			|| this._hasVisibleBorder(style)
			|| this._hasVisibleOutline(style)) {
			return true;
		}
		const fontWeight = Number.parseInt(style.fontWeight, 10);
		if (fontWeight !== 400 && fontWeight !== 700) {
			return true;
		}
		const sides = ['top', 'right', 'bottom', 'left'];
		return [
			'display',
			'font-size',
			'font-family',
			'font-variant',
			'font-stretch',
			'letter-spacing',
			'word-spacing',
			'text-transform',
			'text-decoration-line',
			'text-shadow',
			'box-shadow',
			'filter',
			'mix-blend-mode',
			'vertical-align',
			'transform',
			...sides.map(side => `padding-${side}`),
			...sides.map(side => `margin-${side}`),
		].some(property => style.getPropertyValue(property) !== baseline.getPropertyValue(property));
	}

	public ownsContentDecoration(decoration: ViewModelDecoration): boolean {
		return this.resolve(decoration, 0) !== undefined;
	}

	public resolve(decoration: ViewModelDecoration, firstId: number): readonly DecorationInput[] | undefined {
		const className = decoration.options.className?.trim();
		if (!className) {
			return undefined;
		}

		const paint = this._resolvePaint(className);
		if (!paint) {
			return undefined;
		}

		const range = {
			styleId: paint.styleId,
			zIndex: decoration.options.zIndex,
			startLine: decoration.range.startLineNumber - 1,
			startColumn: decoration.range.startColumn - 1,
			endLine: decoration.range.endLineNumber - 1,
			endColumn: decoration.range.endColumn - 1,
			wholeLine: decoration.options.isWholeLine,
			fillLineBreak: decoration.options.shouldFillLineOnLineBreak ?? false,
			// This is the classic DOM renderer's existing geometry exception:
			// `linesVisibleRangesForRange(range, className === 'findMatch')`.
			includeNewLines: className === 'findMatch',
			showIfCollapsed: decoration.options.showIfCollapsed,
		};
		return paint.kinds.map((kind, index) => ({
			id: firstId + index,
			...range,
			kind,
		}));
	}

	private _resolvePaint(className: string): IResolvedDecorationPaint | undefined {
		const cached = this._cache.get(className);
		if (cached !== undefined) {
			return cached ?? undefined;
		}

		const kinds = this._readComputedPaint(className);
		const resolved = kinds ? { styleId: this._nextStyleId++, kinds } : undefined;
		this._cache.set(className, resolved ?? null);
		return resolved;
	}

	private _readComputedPaint(className: string): readonly DecorationKindInput[] | undefined {
		const window = this._editorRoot.ownerDocument.defaultView;
		if (!window) {
			return undefined;
		}

		this._probe.className = `cdr ${className}`;
		this._editorRoot.append(this._container);
		try {
			const baseline = window.getComputedStyle(this._baseline);
			const style = window.getComputedStyle(this._probe);
			const before = window.getComputedStyle(this._probe, '::before');
			const after = window.getComputedStyle(this._probe, '::after');

			if (this._hasUnsupportedPaint(style, baseline)
				|| this._pseudoElementPaints(before)
				|| this._pseudoElementPaints(after)) {
				return undefined;
			}

			const kinds: DecorationKindInput[] = [];
			const background = this._visibleColor(style.backgroundColor);
			const hasImage = style.backgroundImage !== 'none';
			if (background && hasImage) {
				return undefined;
			}
			if (background) {
				kinds.push({ kind: 'background', color: this._packColor(background) });
			}
			if (hasImage) {
				const waveColor = this._readWaveColor(style);
				if (!waveColor) {
					return undefined;
				}
				kinds.push({
					kind: 'underline',
					color: this._packColor(waveColor),
					style: 'wavy',
					width: 3,
					inside: true,
				});
			}
			const stroke = this._readBorderPaint(style);
			if (stroke === null) {
				return undefined;
			}
			if (stroke) {
				kinds.push(stroke);
			}
			return kinds.length > 0 ? kinds : undefined;
		} finally {
			this._container.remove();
			this._probe.className = '';
		}
	}

	private _hasUnsupportedPaint(style: CSSStyleDeclaration, baseline: CSSStyleDeclaration): boolean {
		if (this._hasVisibleOutline(style)) {
			return true;
		}

		const properties = [
			'opacity',
			'box-shadow',
			'text-shadow',
			'filter',
			'backdrop-filter',
			'transform',
			'mix-blend-mode',
			'clip-path',
			'mask-image',
			'border-radius',
			'text-decoration-line',
		];
		if (properties.some(property =>
			style.getPropertyValue(property) !== baseline.getPropertyValue(property)
		)) {
			return true;
		}
		const paddingChanged = ['top', 'right', 'bottom', 'left'].some(side =>
			style.getPropertyValue(`padding-${side}`) !== baseline.getPropertyValue(`padding-${side}`)
		);
		return paddingChanged && style.boxSizing !== 'border-box';
	}

	private _pseudoElementPaints(style: CSSStyleDeclaration): boolean {
		const content = style.content;
		const hasText = content !== 'none' && content !== 'normal' && content !== '""' && content !== '\'\'';
		return hasText
			|| this._visibleColor(style.backgroundColor) !== undefined
			|| style.backgroundImage !== 'none'
			|| style.boxShadow !== 'none'
			|| this._hasVisibleBorder(style)
			|| this._hasVisibleOutline(style);
	}

	private _hasVisibleBorder(style: CSSStyleDeclaration): boolean {
		return ['top', 'right', 'bottom', 'left'].some(side => {
			const borderStyle = style.getPropertyValue(`border-${side}-style`);
			const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
			const color = this._visibleColor(style.getPropertyValue(`border-${side}-color`));
			return borderStyle !== 'none' && borderStyle !== 'hidden' && width > 0 && color !== undefined;
		});
	}

	private _readBorderPaint(style: CSSStyleDeclaration): DecorationKindInput | undefined | null {
		const hasVisibleBorder = this._hasVisibleBorder(style);
		const sides = ['top', 'right', 'bottom', 'left'].map(side => this._readBorderSide(style, side));
		const visibleCount = sides.filter(side => side !== undefined).length;
		if (visibleCount === 0) {
			return hasVisibleBorder ? null : undefined;
		}

		const bottom = sides[2];
		if (visibleCount === 1 && bottom) {
			return {
				kind: 'underline',
				color: this._packColor(bottom.color),
				style: bottom.style,
				width: bottom.width,
				inside: style.boxSizing === 'border-box',
			};
		}

		const first = sides[0];
		if (visibleCount !== 4 || !first || style.boxSizing !== 'border-box' || first.style === 'dashed'
			|| sides.some(side => !side
				|| side.width !== first.width
				|| side.style !== first.style
				|| !side.color.equals(first.color))) {
			return null;
		}
		return {
			kind: 'border',
			color: this._packColor(first.color),
			style: first.style,
			width: first.width,
		};
	}

	private _readBorderSide(style: CSSStyleDeclaration, side: string): IBorderSide | undefined {
		const borderStyle = style.getPropertyValue(`border-${side}-style`);
		if (borderStyle !== 'solid' && borderStyle !== 'dotted' && borderStyle !== 'dashed') {
			return undefined;
		}
		const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
		const color = this._visibleColor(style.getPropertyValue(`border-${side}-color`));
		return Number.isFinite(width) && width > 0 && color
			? { color, width, style: borderStyle }
			: undefined;
	}

	private _hasVisibleOutline(style: CSSStyleDeclaration): boolean {
		const width = Number.parseFloat(style.outlineWidth);
		return style.outlineStyle !== 'none'
			&& width > 0
			&& this._visibleColor(style.outlineColor) !== undefined;
	}

	private _readWaveColor(style: CSSStyleDeclaration): Color | undefined {
		if (style.backgroundRepeat !== 'repeat-x'
			|| style.backgroundPositionX !== '0%'
			|| style.backgroundPositionY !== '100%'
			|| style.backgroundSize !== 'auto') {
			return undefined;
		}

		const image = style.backgroundImage;
		const prefix = 'data:image/svg+xml,';
		const prefixIndex = image.indexOf(prefix);
		if (!image.startsWith('url(') || prefixIndex === -1) {
			return undefined;
		}

		let payload = image.slice(prefixIndex + prefix.length);
		payload = payload.replace(/["']?\)$/, '');
		let svgText: string;
		try {
			svgText = decodeURIComponent(payload);
		} catch {
			return undefined;
		}

		const svgTag = svgText.match(/<svg\b(?<attributes>[^>]*)>/)?.groups?.attributes;
		const groupTag = svgText.match(/<g\b(?<attributes>[^>]*)>/)?.groups?.attributes;
		if (!svgTag
			|| this._readAttribute(svgTag, 'viewBox') !== '0 0 6 3'
			|| this._readAttribute(svgTag, 'width') !== '6'
			|| this._readAttribute(svgTag, 'height') !== '3') {
			return undefined;
		}

		const points = Array.from(svgText.matchAll(/<polygon\b[^>]*\bpoints=(?<quote>["'])(?<points>.*?)\k<quote>[^>]*\/?>/g))
			.map(match => match.groups?.points)
			.sort();
		const expected = [
			'0,2 1,3 2.4,3 0,0.6',
			'4,0 6,2 6,0.6 5.4,0',
			'5.5,0 2.5,3 1.1,3 4.1,0',
		].sort();
		if (points.length !== expected.length || points.some((point, index) => point !== expected[index])) {
			return undefined;
		}

		const fill = groupTag ? this._readAttribute(groupTag, 'fill') : undefined;
		return fill ? this._visibleColor(fill) : undefined;
	}

	private _readAttribute(attributes: string, name: string): string | undefined {
		const expression = new RegExp(`\\b${name}=(?<quote>[\"'])(?<value>.*?)\\k<quote>`);
		return attributes.match(expression)?.groups?.value;
	}

	private _visibleColor(value: string): Color | undefined {
		const color = Color.Format.CSS.parse(value);
		return color && !color.isTransparent() ? color : undefined;
	}

	private _packColor(color: Color): number {
		const { r, g, b, a } = color.rgba;
		return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (Math.round(a * 255) & 0xff)) >>> 0;
	}
}
