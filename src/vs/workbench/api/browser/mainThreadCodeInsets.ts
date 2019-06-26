/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents, URI } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { MainContext, MainThreadEditorInsetsShape, IExtHostContext, ExtHostEditorInsetsShape, ExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from '../common/extHostCustomers';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IWebviewService, Webview } from 'vs/workbench/contrib/webview/common/webview';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

// todo@joh move these things back into something like contrib/insets
class EditorWebviewZone implements IViewZone {

	readonly domNode: HTMLElement;
	readonly afterLineNumber: number;
	readonly afterColumn: number;
	readonly heightInLines: number;

	private _id: number;
	// suppressMouseDown?: boolean | undefined;
	// heightInPx?: number | undefined;
	// minWidthInPx?: number | undefined;
	// marginDomNode?: HTMLElement | null | undefined;
	// onDomNodeTop?: ((top: number) => void) | undefined;
	// onComputedHeight?: ((height: number) => void) | undefined;

	constructor(
		readonly editor: IActiveCodeEditor,
		readonly line: number,
		readonly height: number,
		readonly webview: Webview,
	) {
		this.domNode = document.createElement('div');
		this.domNode.style.zIndex = '10'; // without this, the webview is not interactive
		this.afterLineNumber = line;
		this.afterColumn = 1;
		this.heightInLines = height;

		editor.changeViewZones(accessor => this._id = accessor.addZone(this));
		webview.mountTo(this.domNode);
	}

	dispose(): void {
		this.editor.changeViewZones(accessor => accessor.removeZone(this._id));
	}
}

class EditorLightweightZone implements IViewZone {

	readonly afterLineNumber: number;
	readonly afterColumn: number;
	readonly heightInLines: number;

	private _id: number;

	constructor(
		readonly domNode: HTMLElement,
		readonly editor: IActiveCodeEditor,
		readonly line: number,
		readonly height: number
	) {
		this.domNode.style.zIndex = '10'; // without this, the webview is not interactive
		this.afterLineNumber = line;
		this.afterColumn = 1;
		this.heightInLines = height;

		editor.changeViewZones(accessor => this._id = accessor.addZone(this));
	}

	dispose(): void {
		this.editor.changeViewZones(accessor => accessor.removeZone(this._id));
	}
}

type InsetViewZone = EditorWebviewZone | EditorLightweightZone;

@extHostNamedCustomer(MainContext.MainThreadEditorInsets)
export class MainThreadEditorInsets implements MainThreadEditorInsetsShape {

	private readonly _proxy: ExtHostEditorInsetsShape;
	private readonly _disposables = new DisposableStore();
	private readonly _insets = new Map<number, InsetViewZone>();
	private makeWebviewZone: () => EditorWebviewZone;
	private makeLightweightZone: (element: HTMLElement) => EditorLightweightZone;

	constructor(
		context: IExtHostContext,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostEditorInsets);
	}

	dispose(): void {
		this._disposables.dispose();
	}

	async $createEditorInset(handle: number, id: string, uri: UriComponents, line: number, height: number, options: modes.IWebviewOptions, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): Promise<void> {

		let editor: IActiveCodeEditor | undefined;
		id = id.substr(0, id.indexOf(',')); //todo@joh HACK

		for (const candidate of this._editorService.listCodeEditors()) {
			if (candidate.getId() === id && candidate.hasModel() && candidate.getModel()!.uri.toString() === URI.revive(uri).toString()) {
				editor = candidate;
				break;
			}
		}

		if (!editor) {
			setTimeout(() => this._proxy.$onDidDispose(handle));
			return;
		}

		this.makeWebviewZone = () => {
			const webview = this._webviewService.createWebview({
				enableFindWidget: false,
				allowSvgs: false,
				extension: { id: extensionId, location: URI.revive(extensionLocation) }
			}, {
					allowScripts: options.enableScripts,
					localResourceRoots: options.localResourceRoots ? options.localResourceRoots.map(uri => URI.revive(uri)) : undefined
				});

			const webviewZone = new EditorWebviewZone(editor!, line, height, webview);
			this._insets.set(handle, webviewZone);

			this._disposables.add(webviewZone);
			this._disposables.add(webview);
			this._disposables.add(webview.onMessage(msg => this._proxy.$onDidReceiveMessage(handle, msg)));
			return webviewZone;
		};

		this.makeLightweightZone = (element: HTMLElement) => {
			const zone = new EditorLightweightZone(element, editor!, line, height);
			this._insets.set(handle, zone);
			this._disposables.add(zone);
			return zone;
		};

		const remove = () => {
			this._disposables.dispose();
			this._proxy.$onDidDispose(handle);
			this._insets.delete(handle);
		};

		this._disposables.add(editor.onDidChangeModel(remove));
		this._disposables.add(editor.onDidDispose(remove));
	}

	$disposeEditorInset(handle: number): void {
		const inset = this._insets.get(handle);
		if (inset) {
			this._insets.delete(handle);
			inset.dispose();
		}
	}

	$setHtml(handle: number, html: string): boolean {
		const inset = this._insets.get(handle);
		// We assume that setting the HTML typically happens once,
		// so let's not bother to try to reuse any previous inset.
		if (inset) { inset.dispose(); }

		const safeElement = checkWhitelistedHtml(html);
		if (safeElement) {
			this.makeLightweightZone(safeElement);
			return true;
		} else {
			const webviewZone = this.makeWebviewZone();
			webviewZone.webview.html = html;
			return false;
		}
	}

	$setOptions(handle: number, options: modes.IWebviewOptions): void {
		const inset = this._insets.get(handle);
		if (inset && inset instanceof EditorWebviewZone) {
			inset.webview.options = options;
		}
	}

	$postMessage(handle: number, value: any): Promise<boolean> {
		const inset = this._insets.get(handle);
		if (inset && inset instanceof EditorWebviewZone) {
			inset.webview.sendMessage(value);
			return Promise.resolve(true);
		}
		return Promise.resolve(false);
	}

	async $getResourceRoot(_handle: number): Promise<string> {
		return this._environmentService.webviewResourceRoot;
	}
}

// Intentionally missing:
// a - because of javascript links
// canvas - because js required to draw on them
// forms items, e.g. button, input
const elementWhitelist = new Set<string>([
	'abbr', 'address', 'animate', 'animatemotion', 'animatetransform', 'article', 'aside',
	'b', 'bdo', 'blockquote', 'body', 'br',
	'caption', 'center', 'circle', 'cite', 'clippath', 'code', 'col', 'colgroup', 'color-prorfile',
	'dd', 'defs', 'desc', 'discard', 'div', 'dl', 'dt',
	'ellipse', 'em',
	'font',
	'g',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'html',
	'i', 'img',
	'li', 'line', 'lineargradiant',
	'main', 'mark', 'marker', 'mask', 'mpath',
	'ol',
	'p', 'path', 'polygon', 'polyline', 'pre',
	'q',
	'radialgradient', 'rect',
	'samp', 'small', 'span', 'stop', 'strike', 'strong', 'style', 'sub', 'sup', 'svg',
	'table', 'tbody', 'td', 'text', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'tt',
	'u', 'ul', 'use',
	'var',
	'xmp'
]);

// Intentionally missing:
// all the "on" event handlers (e.g. onClick), which allow js code
const attributeWhitelist = new Set<string>([
	'align', 'alt',
	'bgcolor', 'border', 'bordercolor',
	'cellspacing', 'class', 'clip-path', 'cols', 'colspan', 'cx', 'cy',
	'd', 'datetime', 'dir',
	'fill', 'fx', 'fy',
	'headers', 'height',
	'id',
	'lang',
	'nowrap',
	'r', 'rx', 'ry', 'rows', 'rowspan',
	'scope', 'scoped', 'span', 'spellcheck', 'src', 'start', 'style', 'stroke', 'stroke-width', 'style',
	'title', 'transform', 'translate',
	'valign', 'version', 'viewbox',
	'width',
	'x', 'x1', 'x2', 'xmlns', 'xmlns:xlink', 'xlink:href',
	'y', 'y1', 'y2'
]);

const styleWhitelist = new Set<string>([
	'alignment-baseline', 'align-content', 'align-items', 'align-self',
	'background', 'background-color', 'baseline-shift', 'border',
	'color',
	'dominanat-baseline',
	'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap',
	'float', 'font', 'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight', 'fill', 'fill-opacity', 'fill-rule',
	'glyph-orientation-horizontal', 'glyph-orientation-vertical',
	'justify-content',
	'kerning',
	'line-height', 'list-style', 'list-style-position', 'list-style-type',
	'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height', 'min-width',
	'marker', 'marker-start', 'marker-mid', 'marker-end',
	'overflow', 'overflow-wrap', 'overflow-x', 'overflow-y',
	'padding', 'padding-button', 'padding-left', 'padding-right', 'padding-top',
	'quotes',
	'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-miterlimit',
	'stroke-opacity', 'stroke-linejoin', 'stroke-width',
	'tab-size', 'table-layout', 'text-align', 'text-align-last', 'text-decoration', 'text-decoration-color', 'text-decoration-line',
	'text-decoration-style', 'text-indent', 'text-justify', 'text-orientation', 'text-overflow', 'text-rendering', 'text-shadow', 'text-transform',
	'vertical-align',
	'word-break', 'word-spacing', 'word-wrap', 'writing-mode'
]);

const parser = new DOMParser(); // create a parser just once

// This function approves HTML for direct inclusion in a viewzone,
// skipping the sandboxing of a webview. It should allow basic static
// content, but forbid any form of scripting.
function checkWhitelistedHtml(html: string): HTMLElement | undefined {
	try {
		const doc = parser.parseFromString(html, 'text/html');
		const nodes = doc.body.querySelectorAll('*');
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			const tag = node.tagName.toLowerCase();
			// If the element tag is not whitelisted, reject.
			if (!elementWhitelist.has(tag)) {
				return undefined;
			}
			if (tag === 'style') {
				const style = node as HTMLStyleElement;
				if (style && !styleElementOkay(style)) {
					return undefined;
				}
			}
			// If the element has an attribute that is not whitelisted, reject.
			if (node.getAttributeNames().some(attr => !attributeWhitelist.has(attr.toLowerCase()))) {
				return undefined;
			}
			const style = node.getAttribute('style');
			if (style && !styleAttributeOkay(style)) {
				return undefined;
			}
		}
		return doc.body;
	} catch (e) {
		return undefined;
	}
}

function styleElementOkay(style: HTMLStyleElement): boolean {
	if (!style.sheet) { return false; }
	const rules = (<CSSStyleSheet>style.sheet).rules;
	for (let r = 0; r < rules.length; r++) {
		const rule = rules[r] as CSSStyleRule;
		for (let i = 0; i < rule.style.length; i++) {
			const prop = rule.style[i].toLowerCase();
			if (!styleWhitelist.has(prop)) {
				return false;
			}
			const value = rule.style[prop];
			if (typeof value === 'string' && value.indexOf('javascript:') >= 0) {
				return false;
			}
		}
	}
	return true;
}

function styleAttributeOkay(style: string): boolean {
	// Split the style attribute's value into rules.
	const rules = style.split(';')
		.filter(rule => !/^\s*$/.exec(rule)) // eliminate empty rules
		.map(rule => {
			const match = /\s*([a-zA-Z-]+)\s*:\s*(.*)\s*/.exec(rule);
			return match && match.length === 3 ? { prop: match[1].toLowerCase(), value: match[2] } : undefined;
		});
	// If a rule's property is not whitelisted or uses js (or it wasn't parsed correctly), reject.
	return rules.every(rule => rule &&
		styleWhitelist.has(rule.prop) &&
		rule.value.indexOf('javascript:') < 0);
}
