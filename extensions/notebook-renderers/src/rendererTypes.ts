/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputItem, RendererContext } from 'vscode-notebook-renderer';
import { Event } from 'vscode';

export interface IDisposable {
	dispose(): void;
}

export interface HtmlRenderingHook {
	/**
	 * Invoked after the output item has been rendered but before it has been appended to the document.
	 *
	 * @return A new `HTMLElement` or `undefined` to continue using the provided element.
	 */
	postRender(outputItem: OutputItem, element: HTMLElement, signal: AbortSignal): HTMLElement | undefined | Promise<HTMLElement | undefined>;
}

export interface JavaScriptRenderingHook {
	/**
	 * Invoked before the script is evaluated.
	 *
	 * @return A new string of JavaScript or `undefined` to continue using the provided string.
	 */
	preEvaluate(outputItem: OutputItem, element: HTMLElement, script: string, signal: AbortSignal): string | undefined | Promise<string | undefined>;
}

export interface RenderOptions {
	readonly lineLimit: number;
	readonly outputScrolling: boolean;
	readonly outputWordWrap: boolean;
}

export type IRichRenderContext = RendererContext<void> & { readonly settings: RenderOptions; readonly onDidChangeSettings: Event<RenderOptions> };

export type OutputElementOptions = {
	linesLimit: number;
	scrollable?: boolean;
	error?: boolean;
	trustHtml?: boolean;
};

export interface OutputWithAppend extends OutputItem {
	appendedText?(): string | undefined;
}
