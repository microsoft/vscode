/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./resourceviewer';
import nls = require('vs/nls');
import mimes = require('vs/base/common/mime');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {Builder, $} from 'vs/base/browser/builder';
import DOM = require('vs/base/browser/dom');
import {DomScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';

// Known media mimes that we can handle
const mapExtToMediaMimes = {
	'.bmp': 'image/bmp',
	'.gif': 'image/gif',
	'.jpg': 'image/jpg',
	'.jpeg': 'image/jpg',
	'.jpe': 'image/jpg',
	'.png': 'image/png',
	'.tiff': 'image/tiff',
	'.tif': 'image/tiff',
	'.ico': 'image/x-icon',
	'.tga': 'image/x-tga',
	'.psd': 'image/vnd.adobe.photoshop',
	'.mid': 'audio/midi',
	'.midi': 'audio/midi',
	'.mp4a': 'audio/mp4',
	'.mpga': 'audio/mpeg',
	'.mp2': 'audio/mpeg',
	'.mp2a': 'audio/mpeg',
	'.mp3': 'audio/mpeg',
	'.m2a': 'audio/mpeg',
	'.m3a': 'audio/mpeg',
	'.oga': 'audio/ogg',
	'.ogg': 'audio/ogg',
	'.spx': 'audio/ogg',
	'.aac': 'audio/x-aac',
	'.wav': 'audio/x-wav',
	'.wma': 'audio/x-ms-wma',
	'.mp4': 'video/mp4',
	'.mp4v': 'video/mp4',
	'.mpg4': 'video/mp4',
	'.mpeg': 'video/mpeg',
	'.mpg': 'video/mpeg',
	'.mpe': 'video/mpeg',
	'.m1v': 'video/mpeg',
	'.m2v': 'video/mpeg',
	'.ogv': 'video/ogg',
	'.qt': 'video/quicktime',
	'.mov': 'video/quicktime',
	'.webm': 'video/webm',
	'.mkv': 'video/x-matroska',
	'.mk3d': 'video/x-matroska',
	'.mks': 'video/x-matroska',
	'.wmv': 'video/x-ms-wmv',
	'.flv': 'video/x-flv',
	'.avi': 'video/x-msvideo',
	'.movie': 'video/x-sgi-movie'
};

/**
 * Helper to actually render the given resource into the provided container. Will adjust scrollbar (if provided) automatically based on loading
 * progress of the binary resource.
 */
export class ResourceViewer {

	public static show(name: string, resource: URI, container: Builder, scrollbar: DomScrollableElement): void {

		// Ensure CSS class
		$(container).setClass('monaco-resource-viewer');

		// Lookup media mime if any
		let mime: string;
		const ext = paths.extname(resource.toString());
		if (ext) {
			mime = mapExtToMediaMimes[ext.toLowerCase()];
		}

		if (!mime) {
			mime = mimes.MIME_BINARY;
		}

		// Show Image inline
		if (mime.indexOf('image/') >= 0) {
			$(container)
				.empty()
				.addClass('image')
				.img({
					src: resource.toString() // disabled due to https://github.com/electron/electron/issues/6275  + '?' + Date.now() // We really want to avoid the browser from caching this resource, so we add a fake query param that is unique
				}).on(DOM.EventType.LOAD, (e, img) => {
					const imgElement = <HTMLImageElement>img.getHTMLElement();
					if (imgElement.naturalWidth > imgElement.width || imgElement.naturalHeight > imgElement.height) {
						$(container).addClass('oversized');

						img.on(DOM.EventType.CLICK, (e, img) => {
							$(container).toggleClass('full-size');

							scrollbar.scanDomNode();
						});
					}

					// Update title when we know the image bounds
					img.title(nls.localize('imgTitle', "{0} ({1}x{2})", paths.basename(resource.fsPath), imgElement.naturalWidth, imgElement.naturalHeight));

					scrollbar.scanDomNode();
				});
		}

		// Embed Object (only PDF for now)
		else if (false /* PDF is currently not supported in Electron it seems */ && mime.indexOf('pdf') >= 0) {
			$(container)
				.empty()
				.element('object')
				.attr({
					data: resource.toString(), // disabled due to https://github.com/electron/electron/issues/6275  + '?' + Date.now(), // We really want to avoid the browser from caching this resource, so we add a fake query param that is unique
					width: '100%',
					height: '100%',
					type: mime
				});
		}

		// Embed Audio (if supported in browser)
		else if (false /* disabled due to unknown impact on memory usage */ && mime.indexOf('audio/') >= 0) {
			$(container)
				.empty()
				.element('audio')
				.attr({
					src: resource.toString(), // disabled due to https://github.com/electron/electron/issues/6275  + '?' + Date.now(), // We really want to avoid the browser from caching this resource, so we add a fake query param that is unique
					text: nls.localize('missingAudioSupport', "Sorry but playback of audio files is not supported."),
					controls: 'controls'
				}).on(DOM.EventType.LOAD, () => {
					scrollbar.scanDomNode();
				});
		}

		// Embed Video (if supported in browser)
		else if (false /* disabled due to unknown impact on memory usage */ && mime.indexOf('video/') >= 0) {
			$(container)
				.empty()
				.element('video')
				.attr({
					src: resource.toString(), // disabled due to https://github.com/electron/electron/issues/6275 + '?' + Date.now(), // We really want to avoid the browser from caching this resource, so we add a fake query param that is unique
					text: nls.localize('missingVideoSupport', "Sorry but playback of video files is not supported."),
					controls: 'controls'
				}).on(DOM.EventType.LOAD, () => {
					scrollbar.scanDomNode();
				});
		}

		// Handle generic Binary Files
		else {
			$(container)
				.empty()
				.span({
					text: nls.localize('nativeBinaryError', "The file cannot be displayed in the editor because it is either binary, very large or uses an unsupported text encoding.")
				});

			scrollbar.scanDomNode();
		}
	}
}