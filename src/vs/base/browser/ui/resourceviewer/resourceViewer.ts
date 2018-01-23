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
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import DOM = require('vs/base/browser/dom');
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { LRUCache } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { clamp } from 'vs/base/common/numbers';

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
	'.webp': 'image/webp',
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
	mime: string;
}

enum ScaleDirection {
	IN, OUT,
}

// Chrome is caching images very aggressively and so we use the ETag information to find out if
// we need to bypass the cache or not. We could always bypass the cache everytime we show the image
// however that has very bad impact on memory consumption because each time the image gets shown,
// memory grows (see also https://github.com/electron/electron/issues/6275)
const IMAGE_RESOURCE_ETAG_CACHE = new LRUCache<string, { etag: string, src: string }>(100);
function imageSrc(descriptor: IResourceDescriptor): string {
	if (descriptor.resource.scheme === Schemas.data) {
		return descriptor.resource.toString(true /* skip encoding */);
	}

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

// store the scale of an image so it can be restored when changing editor tabs
const IMAGE_SCALE_CACHE = new LRUCache<string, number>(100);

export interface ResourceViewerContext {
	layout(dimension: Dimension);
}

/**
 * Helper to actually render the given resource into the provided container. Will adjust scrollbar (if provided) automatically based on loading
 * progress of the binary resource.
 */
export class ResourceViewer {

	private static readonly KB = 1024;
	private static readonly MB = ResourceViewer.KB * ResourceViewer.KB;
	private static readonly GB = ResourceViewer.MB * ResourceViewer.KB;
	private static readonly TB = ResourceViewer.GB * ResourceViewer.KB;

	private static readonly MAX_IMAGE_SIZE = ResourceViewer.MB; // showing images inline is memory intense, so we have a limit

	private static readonly SCALE_PINCH_FACTOR = 0.1;
	private static readonly SCALE_FACTOR = 1.5;
	private static readonly MAX_SCALE = 20;
	private static readonly MIN_SCALE = 0.1;
	private static readonly PIXELATION_THRESHOLD = 64; // enable image-rendering: pixelated for images less than this

	public static show(
		descriptor: IResourceDescriptor,
		container: Builder,
		scrollbar: DomScrollableElement,
		openExternal: (uri: URI) => void,
		metadataClb?: (meta: string) => void
	): ResourceViewerContext {

		// Ensure CSS class
		$(container).setClass('monaco-resource-viewer');

		// Lookup media mime if any
		let mime = descriptor.mime;
		if (!mime && descriptor.resource.scheme === Schemas.file) {
			const ext = paths.extname(descriptor.resource.toString());
			if (ext) {
				mime = mapExtToMediaMimes[ext.toLowerCase()];
			}
		}

		if (!mime) {
			mime = mimes.MIME_BINARY;
		}

		// Show Image inline unless they are large
		if (mime.indexOf('image/') >= 0) {
			if (ResourceViewer.inlineImage(descriptor)) {
				const context = {
					layout(dimension: Dimension) { }
				};
				$(container)
					.empty()
					.addClass('image', 'zoom-in')
					.img({ src: imageSrc(descriptor) })
					.addClass('untouched')
					.on(DOM.EventType.LOAD, (e, img) => {
						const imgElement = <HTMLImageElement>img.getHTMLElement();
						const cacheKey = descriptor.resource.toString();
						let scaleDirection = ScaleDirection.IN;
						let scale = IMAGE_SCALE_CACHE.get(cacheKey) || null;
						if (scale) {
							img.removeClass('untouched');
							updateScale(scale);
						}

						function setImageWidth(width) {
							img.style('width', `${width}px`);
							img.style('height', 'auto');
						}

						function updateScale(newScale) {
							scale = clamp(newScale, ResourceViewer.MIN_SCALE, ResourceViewer.MAX_SCALE);
							setImageWidth(Math.floor(imgElement.naturalWidth * scale));
							IMAGE_SCALE_CACHE.set(cacheKey, scale);

							scrollbar.scanDomNode();

							updateMetadata();
						}

						function updateMetadata() {
							if (metadataClb) {
								const scale = Math.round((imgElement.width / imgElement.naturalWidth) * 10000) / 100;
								metadataClb(nls.localize('imgMeta', '{0}% {1}x{2} {3}',
									scale,
									imgElement.naturalWidth,
									imgElement.naturalHeight,
									ResourceViewer.formatSize(descriptor.size)));
							}
						}

						context.layout = updateMetadata;

						function firstZoom() {
							const { clientWidth, naturalWidth } = imgElement;
							setImageWidth(clientWidth);
							img.removeClass('untouched');
							if (imgElement.naturalWidth < ResourceViewer.PIXELATION_THRESHOLD
								|| imgElement.naturalHeight < ResourceViewer.PIXELATION_THRESHOLD) {
								img.addClass('pixelated');
							}
							scale = clientWidth / naturalWidth;
						}

						$(container)
							.on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent, c) => {
								if (e.altKey) {
									scaleDirection = ScaleDirection.OUT;
									c.removeClass('zoom-in').addClass('zoom-out');
								}
							})
							.on(DOM.EventType.KEY_UP, (e: KeyboardEvent, c) => {
								if (!e.altKey) {
									scaleDirection = ScaleDirection.IN;
									c.removeClass('zoom-out').addClass('zoom-in');
								}
							});

						$(container).on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
							if (scale === null) {
								firstZoom();
							}

							// right click
							if (e.button === 2) {
								updateScale(1);
							} else {
								const scaleFactor = scaleDirection === ScaleDirection.IN
									? ResourceViewer.SCALE_FACTOR
									: 1 / ResourceViewer.SCALE_FACTOR;

								updateScale(scale * scaleFactor);
							}
						});

						$(container).on(DOM.EventType.WHEEL, (e: WheelEvent) => {
							// pinching is reported as scroll wheel + ctrl
							if (!e.ctrlKey) {
								return;
							}

							if (scale === null) {
								firstZoom();
							}

							// scrolling up, pinching out should increase the scale
							const delta = -e.deltaY;
							updateScale(scale + delta * ResourceViewer.SCALE_PINCH_FACTOR);
						});

						updateMetadata();

						scrollbar.scanDomNode();
					});

				return context;
			} else {
				const imageContainer = $(container)
					.empty()
					.p({
						text: nls.localize('largeImageError', "The image is too large to display in the editor. ")
					});

				if (descriptor.resource.scheme !== Schemas.data) {
					imageContainer.append($('a', {
						role: 'button',
						class: 'open-external',
						text: nls.localize('resourceOpenExternalButton', "Open image using external program?")
					}).on(DOM.EventType.CLICK, (e) => {
						openExternal(descriptor.resource);
					}));
				}
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

		return null;
	}

	private static inlineImage(descriptor: IResourceDescriptor): boolean {
		let skipInlineImage: boolean;

		// Data URI
		if (descriptor.resource.scheme === Schemas.data) {
			const BASE64_MARKER = 'base64,';
			const base64MarkerIndex = descriptor.resource.path.indexOf(BASE64_MARKER);
			const hasData = base64MarkerIndex >= 0 && descriptor.resource.path.substring(base64MarkerIndex + BASE64_MARKER.length).length > 0;

			skipInlineImage = !hasData || descriptor.size > ResourceViewer.MAX_IMAGE_SIZE || descriptor.resource.path.length > ResourceViewer.MAX_IMAGE_SIZE;
		}

		// File URI
		else {
			skipInlineImage = typeof descriptor.size !== 'number' || descriptor.size > ResourceViewer.MAX_IMAGE_SIZE;
		}

		return !skipInlineImage;
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
