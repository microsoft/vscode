/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../base/browser/window.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { computeFullwidthLetterSpacing, FontInfo, getFullwidthCharacterWidth } from '../../common/config/fontInfo.js';
import type { IFullwidthLetterSpacingProvider, IFullwidthLetterSpacingRequest } from '../../common/viewLayout/viewLineRenderer.js';
import { applyFontInfo } from './domFontInfo.js';

const maxCachedMeasurements = 4096;

let providers = new WeakMap<Window, Map<string, DomFullwidthLetterSpacingProvider>>();

export function clearFullwidthLetterSpacingProviders(targetWindow?: Window): void {
	if (targetWindow) {
		const windowProviders = providers.get(targetWindow);
		if (windowProviders) {
			for (const provider of windowProviders.values()) {
				provider.clear();
			}
			windowProviders.clear();
		}
		return;
	}
	providers = new WeakMap();
}

export function getFullwidthLetterSpacingProvider(targetWindow: Window, fontInfo: FontInfo, forceFullwidthCharacterWidth: boolean): IFullwidthLetterSpacingProvider | null {
	if (!forceFullwidthCharacterWidth || !fontInfo.isMonospace) {
		return null;
	}

	let windowProviders = providers.get(targetWindow);
	if (!windowProviders) {
		windowProviders = new Map();
		providers.set(targetWindow, windowProviders);
	}

	const targetWidth = getFullwidthCharacterWidth(fontInfo, true);
	const key = `${fontInfo.getId()}\0${targetWidth}`;
	let provider = windowProviders.get(key);
	if (!provider) {
		provider = new DomFullwidthLetterSpacingProvider(targetWindow, fontInfo, targetWidth);
		windowProviders.set(key, provider);
	}
	return provider;
}

class DomFullwidthLetterSpacingProvider implements IFullwidthLetterSpacingProvider {
	private readonly _cache = new Map<string, number>();
	private _generation = 0;

	public get generation(): number {
		return this._generation;
	}

	constructor(
		private readonly _targetWindow: Window,
		private readonly _fontInfo: FontInfo,
		private readonly _targetWidth: number,
	) { }

	public clear(): void {
		this._cache.clear();
		this._generation++;
	}

	public prepare(requests: readonly IFullwidthLetterSpacingRequest[]): void {
		const missingRequests = new Map<string, IFullwidthLetterSpacingRequest>();
		const requestedKeys = new Set<string>();
		for (const request of requests) {
			const key = this._getKey(request);
			requestedKeys.add(key);
			if (!this._cache.has(key)) {
				missingRequests.set(key, request);
			}
		}
		if (missingRequests.size === 0) {
			return;
		}

		const host = mainWindow.document.createElement('div');
		host.className = 'monaco-editor';
		host.setAttribute('aria-hidden', 'true');
		host.style.position = 'absolute';
		host.style.visibility = 'hidden';
		host.style.whiteSpace = 'pre';
		host.style.left = '-100000px';
		host.style.top = '-100000px';
		host.style.setProperty('--editor-font-size', `${this._fontInfo.fontSize}px`);

		const probes: { key: string; span: HTMLSpanElement }[] = [];
		for (const [key, request] of missingRequests) {
			const line = mainWindow.document.createElement('div');
			line.className = 'view-line';
			applyFontInfo(line, this._fontInfo);

			const span = mainWindow.document.createElement('span');
			span.className = request.className;
			span.style.letterSpacing = '0px';
			span.textContent = request.grapheme;
			line.appendChild(span);
			host.appendChild(line);
			probes.push({ key, span });
		}

		this._targetWindow.document.body.appendChild(host);
		try {
			for (const probe of probes) {
				const range = this._targetWindow.document.createRange();
				range.selectNodeContents(probe.span);
				const graphemeWidth = range.getBoundingClientRect().width;
				range.detach();
				if (!Number.isFinite(graphemeWidth) || graphemeWidth < 0) {
					throw new BugIndicatingError(`Invalid full-width grapheme width: ${graphemeWidth}`);
				}
				this._cache.set(probe.key, computeFullwidthLetterSpacing(this._targetWidth, graphemeWidth));
			}
		} finally {
			host.remove();
		}

		for (const key of this._cache.keys()) {
			if (this._cache.size <= maxCachedMeasurements) {
				break;
			}
			if (!requestedKeys.has(key)) {
				this._cache.delete(key);
			}
		}
	}

	public getLetterSpacing(grapheme: string, className: string): number {
		const key = this._getKey({ grapheme, className });
		const result = this._cache.get(key);
		if (result === undefined) {
			throw new BugIndicatingError('Full-width grapheme was not prepared before rendering');
		}
		return result;
	}

	private _getKey(request: IFullwidthLetterSpacingRequest): string {
		return `${request.className}\0${request.grapheme}`;
	}
}
