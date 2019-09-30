/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/resourceviewer';
import * as nls from 'vs/nls';
import { ICssStyleCollector, ITheme, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IMAGE_PREVIEW_BORDER } from 'vs/workbench/common/theme';

export interface IResourceDescriptor {
	readonly resource: URI;
	readonly name: string;
	readonly size: number;
	readonly etag?: string;
	readonly mime: string;
}

class BinarySize {
	static readonly KB = 1024;
	static readonly MB = BinarySize.KB * BinarySize.KB;
	static readonly GB = BinarySize.MB * BinarySize.KB;
	static readonly TB = BinarySize.GB * BinarySize.KB;

	static formatSize(size: number): string {
		if (size < BinarySize.KB) {
			return nls.localize('sizeB', "{0}B", size);
		}

		if (size < BinarySize.MB) {
			return nls.localize('sizeKB', "{0}KB", (size / BinarySize.KB).toFixed(2));
		}

		if (size < BinarySize.GB) {
			return nls.localize('sizeMB', "{0}MB", (size / BinarySize.MB).toFixed(2));
		}

		if (size < BinarySize.TB) {
			return nls.localize('sizeGB', "{0}GB", (size / BinarySize.GB).toFixed(2));
		}

		return nls.localize('sizeTB', "{0}TB", (size / BinarySize.TB).toFixed(2));
	}
}

export interface ResourceViewerContext extends IDisposable {
	layout?(dimension: DOM.Dimension): void;
}

interface ResourceViewerDelegate {
	openInternalClb(uri: URI): void;
	openExternalClb?(uri: URI): void;
	metadataClb(meta: string): void;
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const borderColor = theme.getColor(IMAGE_PREVIEW_BORDER);
	collector.addRule(`.monaco-resource-viewer.image img { border : 1px solid ${borderColor ? borderColor.toString() : ''}; }`);
});

/**
 * Helper to actually render the given resource into the provided container. Will adjust scrollbar (if provided) automatically based on loading
 * progress of the binary resource.
 */
export class ResourceViewer {

	private static readonly MAX_OPEN_INTERNAL_SIZE = BinarySize.MB * 200; // max size until we offer an action to open internally

	static show(
		descriptor: IResourceDescriptor,
		container: HTMLElement,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate,
	): ResourceViewerContext {

		// Ensure CSS class
		container.className = 'monaco-resource-viewer';

		// Large Files
		if (descriptor.size > ResourceViewer.MAX_OPEN_INTERNAL_SIZE) {
			return FileTooLargeFileView.create(container, descriptor, scrollbar, delegate);
		}

		// Seemingly Binary Files
		else {
			return FileSeemsBinaryFileView.create(container, descriptor, scrollbar, delegate);
		}
	}
}

class FileTooLargeFileView {
	static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate
	) {
		const size = BinarySize.formatSize(descriptor.size);
		delegate.metadataClb(size);

		DOM.clearNode(container);

		const label = document.createElement('span');
		label.textContent = nls.localize('nativeFileTooLargeError', "The file is not displayed in the editor because it is too large ({0}).", size);
		container.appendChild(label);

		scrollbar.scanDomNode();

		return Disposable.None;
	}
}

class FileSeemsBinaryFileView {
	static create(
		container: HTMLElement,
		descriptor: IResourceDescriptor,
		scrollbar: DomScrollableElement,
		delegate: ResourceViewerDelegate
	) {
		delegate.metadataClb(typeof descriptor.size === 'number' ? BinarySize.formatSize(descriptor.size) : '');

		DOM.clearNode(container);

		const disposables = new DisposableStore();

		const label = document.createElement('p');
		label.textContent = nls.localize('nativeBinaryError', "The file is not displayed in the editor because it is either binary or uses an unsupported text encoding.");
		container.appendChild(label);

		if (descriptor.resource.scheme !== Schemas.data) {
			const link = DOM.append(label, DOM.$('a.embedded-link'));
			link.setAttribute('role', 'button');
			link.textContent = nls.localize('openAsText', "Do you want to open it anyway?");

			disposables.add(DOM.addDisposableListener(link, DOM.EventType.CLICK, () => delegate.openInternalClb(descriptor.resource)));
		}

		scrollbar.scanDomNode();

		return disposables;
	}
}
