/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedHoverContent } from '../../../../../base/browser/ui/hover/hover.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatSpeechToTextService } from './chatSpeechToTextService.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Radius of the progress ring in the 16×16 viewBox used for the toolbar icon. */
const RING_RADIUS = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Circular progress ring rendered over the dictation toolbar icon while the
 * on-device model downloads, so the wait reads as a determinate download.
 */
export class DictationDownloadRing extends Disposable {

	private readonly _ringElement: SVGSVGElement;
	private readonly _progressCircle: SVGCircleElement;

	constructor(
		container: HTMLElement,
		private readonly _speechToTextService: IChatSpeechToTextService,
	) {
		super();

		const ownerDocument = container.ownerDocument;
		const svg = ownerDocument.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
		svg.classList.add('dictation-download-ring');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('aria-hidden', 'true');

		const track = ownerDocument.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
		track.classList.add('dictation-download-ring-track');
		track.setAttribute('cx', '8');
		track.setAttribute('cy', '8');
		track.setAttribute('r', String(RING_RADIUS));

		const progress = ownerDocument.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
		progress.classList.add('dictation-download-ring-progress');
		progress.setAttribute('cx', '8');
		progress.setAttribute('cy', '8');
		progress.setAttribute('r', String(RING_RADIUS));
		progress.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE));

		svg.appendChild(track);
		svg.appendChild(progress);
		container.appendChild(svg);

		this._ringElement = svg;
		this._progressCircle = progress;

		this._register(this._speechToTextService.onDidChangeModelDownloadProgress(() => this.update()));
		this.update();
	}

	update(): void {
		const progress = this._speechToTextService.modelDownloadProgress;
		if (progress === undefined) {
			// Fraction unknown or model loading: spin a fixed arc so the ring
			// still reads as active rather than stuck empty.
			this._ringElement.classList.add('indeterminate');
			this._progressCircle.style.strokeDashoffset = String(RING_CIRCUMFERENCE * 0.75);
		} else {
			this._ringElement.classList.remove('indeterminate');
			this._progressCircle.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
		}
	}
}

/**
 * Static hover explaining what the mic is doing while it prepares. The on-device
 * backend downloads a model; the cloud backend connects. The ring conveys live
 * progress/activity, so the hover stays fixed to avoid churning on every tick.
 */
export function getDictationDownloadHoverContent(service: IChatSpeechToTextService): IManagedHoverContent {
	const markdown = new MarkdownString('', { supportThemeIcons: true });
	if (service.currentBackend === 'mai') {
		markdown.appendMarkdown(localize('chatStt.hover.connectingTitle', "**Connecting to dictation service**"));
		markdown.appendMarkdown('\n\n');
		markdown.appendMarkdown(localize('chatStt.hover.connecting', "Establishing a connection. This happens each time you start cloud dictation."));
		return { markdown, markdownNotSupportedFallback: markdown.value };
	}
	markdown.appendMarkdown(localize('chatStt.hover.title', "**Downloading speech-to-text model**"));
	markdown.appendMarkdown('\n\n');
	markdown.appendMarkdown(localize('chatStt.hover.preparing', "Preparing the on-device model. This happens only the first time you dictate."));
	return { markdown, markdownNotSupportedFallback: markdown.value };
}

/**
 * A short, live label describing the on-device model's preparation state, for
 * surfaces without a progress ring (editor placeholder, terminal decoration).
 * Reads out the download percentage when known, otherwise a generic preparing
 * message (indeterminate download or loading into memory).
 */
export function getDictationPreparingLabel(service: IChatSpeechToTextService): string {
	// The cloud backend connects rather than downloading a model, so describe it
	// as connecting; there is no percentage to report.
	if (service.currentBackend === 'mai') {
		return localize('chatStt.preparing.connecting', "Connecting to dictation service…");
	}
	const progress = service.modelDownloadProgress;
	if (typeof progress === 'number') {
		const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
		return localize('chatStt.preparing.downloading', "Downloading speech-to-text model… {0}%", percent);
	}
	return localize('chatStt.preparing.preparing', "Preparing speech-to-text model…");
}
