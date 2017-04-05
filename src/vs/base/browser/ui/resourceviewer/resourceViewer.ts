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
import { Builder, $ } from 'vs/base/browser/builder';
import DOM = require('vs/base/browser/dom');
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { BoundedLinkedMap } from 'vs/base/common/map';


interface MapExtToMediaMimes {
	[index: string]: string;
}

// Known media mimes that we can handle
const mapExtToMediaMimes: MapExtToMediaMimes = {
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

export interface IResourceDescriptor {
	resource: URI;
	name: string;
	size: number;
	etag: string;
}

// Chrome is caching images very aggressively and so we use the ETag information to find out if
// we need to bypass the cache or not. We could always bypass the cache everytime we show the image
// however that has very bad impact on memory consumption because each time the image gets shown,
// memory grows (see also https://github.com/electron/electron/issues/6275)
const IMAGE_RESOURCE_ETAG_CACHE = new BoundedLinkedMap<{ etag: string, src: string }>(100);
function imageSrc(descriptor: IResourceDescriptor): string {
	const src = descriptor.resource.toString();

	let cached = IMAGE_RESOURCE_ETAG_CACHE.get(src);
	if (!cached) {
		cached = { etag: descriptor.etag, src };
		IMAGE_RESOURCE_ETAG_CACHE.set(src, cached);
	}

	if (cached.etag !== descriptor.etag) {
		cached.etag = descriptor.etag;
		cached.src = `${src}?${Date.now()}`; // bypass cache with this trick
	}

	return cached.src;
}

/**
 * Helper to actually render the given resource into the provided container. Will adjust scrollbar (if provided) automatically based on loading
 * progress of the binary resource.
 */
export class ResourceViewer {

	private static KB = 1024;
	private static MB = ResourceViewer.KB * ResourceViewer.KB;
	private static GB = ResourceViewer.MB * ResourceViewer.KB;
	private static TB = ResourceViewer.GB * ResourceViewer.KB;

	private static MAX_IMAGE_SIZE = ResourceViewer.MB; // showing images inline is memory intense, so we have a limit

	public static show(
		descriptor: IResourceDescriptor,
		container: Builder,
		scrollbar: DomScrollableElement,
		openExternal: (URI) => void,
		metadataClb?: (meta: string) => void
	): void {
		// Ensure CSS class
		$(container).setClass('monaco-resource-viewer');

		// Lookup media mime if any
		let mime: string;
		const ext = paths.extname(descriptor.resource.toString());
		if (ext) {
			mime = mapExtToMediaMimes[ext.toLowerCase()];
		}

		if (!mime) {
			mime = mimes.MIME_BINARY;
		}

		// Show Image inline
		if (mime.indexOf('image/') >= 0) {
			if (descriptor.size <= ResourceViewer.MAX_IMAGE_SIZE) {
				$(container)
					.empty()
					.addClass('image')
					.img({ src: imageSrc(descriptor) })
					.on(DOM.EventType.LOAD, (e, img) => {
						const imgElement = <HTMLImageElement>img.getHTMLElement();
						if (imgElement.naturalWidth > imgElement.width || imgElement.naturalHeight > imgElement.height) {
							$(container).addClass('oversized');

							img.on(DOM.EventType.CLICK, (e, img) => {
								$(container).toggleClass('full-size');

								scrollbar.scanDomNode();
							});
						}

						if (metadataClb) {
							metadataClb(nls.localize('imgMeta', "{0}x{1} {2}", imgElement.naturalWidth, imgElement.naturalHeight, ResourceViewer.formatSize(descriptor.size)));
						}

						scrollbar.scanDomNode();
					});
			} else {
				$(container)
					.empty()
					.p({
						text: nls.localize('largeImageError', "The image is too large to display in the editor. ")
					})
					.append($('a', {
						role: 'button',
						class: 'open-external',
						text: nls.localize('resourceOpenExternalButton', "Open image")
					}).on(DOM.EventType.CLICK, (e) => {
						openExternal(descriptor.resource);
					}))
					.append($('span', {
						text: nls.localize('resourceOpenExternalText', ' using external program?')
					}));
			}
		}

		// Handle generic Binary Files
		else {
			$(container)
				.empty()
				.span({
					text: nls.localize('nativeBinaryError', "The file will not be displayed in the editor because it is either binary, very large or uses an unsupported text encoding.")
				});

			if (metadataClb) {
				metadataClb(ResourceViewer.formatSize(descriptor.size));
			}

			scrollbar.scanDomNode();
		}
	}

	private static formatSize(size: number): string {
		if (size < ResourceViewer.KB) {
			return nls.localize('sizeB', "{0}B", size);
		}

		if (size < ResourceViewer.MB) {
			return nls.localize('sizeKB', "{0}KB", (size / ResourceViewer.KB).toFixed(2));
		}

		if (size < ResourceViewer.GB) {
			return nls.localize('sizeMB', "{0}MB", (size / ResourceViewer.MB).toFixed(2));
		}

		if (size < ResourceViewer.TB) {
			return nls.localize('sizeGB', "{0}GB", (size / ResourceViewer.GB).toFixed(2));
		}

		return nls.localize('sizeTB', "{0}TB", (size / ResourceViewer.TB).toFixed(2));
	}
}
