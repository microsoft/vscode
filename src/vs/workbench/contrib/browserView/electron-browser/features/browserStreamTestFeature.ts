/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	BrowserWidgetLocation,
	IBrowserEditorWidget,
} from '../browserEditor.js';

/** Dimensions (CSS px) of the live preview video shown in the hover. */
const STREAM_WIDTH = 480;
const STREAM_HEIGHT = 300;

/**
 * Test feature that adds a small camera icon to the URL bar. Hovering the icon
 * opens a hover containing a `<video>` element that plays a live stream of the
 * browser view's contents, captured via {@link BrowserEditorInput.getStream}.
 */
export class BrowserStreamTestFeature extends BrowserEditorContribution {

	private readonly _container: HTMLElement;
	private readonly _hoverContent: HTMLElement;
	private readonly _video: HTMLVideoElement;

	/** Holds the active capture stream; disposing stops its tracks. */
	private readonly _stream = this._register(new MutableDisposable());

	constructor(
		editor: BrowserEditor,
		@IHoverService hoverService: IHoverService,
	) {
		super(editor);

		// URL bar icon (hidden until a page is loaded).
		this._container = $('.browser-stream-test-indicator-container');
		this._container.style.display = 'none';
		const icon = $('.browser-stream-test-indicator');
		icon.tabIndex = 0;
		icon.setAttribute('role', 'button');
		icon.setAttribute('aria-label', localize('browser.streamPreview', "Preview Live Stream"));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.deviceCameraVideo));
		this._container.appendChild(icon);

		// Hover content: a video element that plays the captured stream.
		this._hoverContent = $('.browser-stream-test-hover');
		this._video = $<HTMLVideoElement>('video.browser-stream-test-video');
		this._video.autoplay = true;
		this._video.muted = true;
		this._video.playsInline = true;
		this._video.width = STREAM_WIDTH;
		this._video.height = STREAM_HEIGHT;
		this._hoverContent.appendChild(this._video);

		this._register(hoverService.setupDelayedHover(icon, () => {
			void this._startStream();
			return {
				content: this._hoverContent,
				position: { hoverPosition: HoverPosition.BELOW },
				appearance: { showPointer: true },
			};
		}));
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.PostUrl, element: this._container, order: 70 }];
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		store.add(model.onDidNavigate(() => this._refresh()));
		this._refresh();
	}

	override onModelDetached(): void {
		this._stopStream();
		this._container.style.display = 'none';
	}

	private _refresh(): void {
		this._stopStream();
		const hasUrl = !!this.editor.model?.url;
		this._container.style.display = hasUrl ? '' : 'none';
		if (hasUrl) {
			void this._startStream();
		}
	}

	private async _startStream(): Promise<void> {
		if (this._stream.value) {
			return; // already capturing
		}

		const input = this.editor.input;
		if (!(input instanceof BrowserEditorInput)) {
			return;
		}

		const stream = await input.getStream(STREAM_WIDTH, STREAM_HEIGHT);
		if (!stream) {
			return;
		}

		// The model may have been detached while awaiting the stream.
		if (!this.editor.model) {
			stream.getTracks().forEach(track => track.stop());
			return;
		}

		this._stream.value = toDisposable(() => {
			stream.getTracks().forEach(track => track.stop());
			this._video.srcObject = null;
		});
		this._video.srcObject = stream;
		this._video.play();
	}

	private _stopStream(): void {
		this._stream.clear();
	}
}

BrowserEditor.registerContribution(BrowserStreamTestFeature);
