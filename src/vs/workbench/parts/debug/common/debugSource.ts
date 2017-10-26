/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import { DEBUG_SCHEME } from 'vs/workbench/parts/debug/common/debug';
import { IRange } from 'vs/editor/common/core/range';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

const UNKNOWN_SOURCE_LABEL = nls.localize('unknownSource', "Unknown Source");

export class Source {

	public readonly uri: uri;
	public available: boolean;

	constructor(public readonly raw: DebugProtocol.Source, sessionId: string) {
		if (!raw) {
			this.raw = { name: UNKNOWN_SOURCE_LABEL };
		}
		this.available = this.raw.name !== UNKNOWN_SOURCE_LABEL;
		const path = this.raw.path || this.raw.name;
		if (this.raw.sourceReference > 0) {
			this.uri = uri.parse(`${DEBUG_SCHEME}:${encodeURIComponent(path)}?session=${encodeURIComponent(sessionId)}&ref=${this.raw.sourceReference}`);
		} else {
			if (paths.isAbsolute(path)) {
				this.uri = uri.file(path); // path should better be absolute!
			} else {
				this.uri = uri.parse(path);
			}
		}
	}

	public get name() {
		return this.raw.name;
	}

	public get origin() {
		return this.raw.origin;
	}

	public get presentationHint() {
		return this.raw.presentationHint;
	}

	public get reference() {
		return this.raw.sourceReference;
	}

	public get inMemory() {
		return this.uri.scheme === DEBUG_SCHEME;
	}

	public openInEditor(editorService: IWorkbenchEditorService, selection: IRange, preserveFocus?: boolean, sideBySide?: boolean): TPromise<any> {
		return !this.available ? TPromise.as(null) : editorService.openEditor({
			resource: this.uri,
			description: this.origin,
			options: {
				preserveFocus,
				selection,
				revealIfVisible: true,
				revealInCenterIfOutsideViewport: true,
				pinned: !preserveFocus && !this.inMemory
			}
		}, sideBySide);
	}

	public static createRawSource(modelUri: uri): DebugProtocol.Source {

		let name = resources.basenameOrAuthority(modelUri);
		let path: string;
		let sourceRef: number;

		switch (modelUri.scheme) {
			case 'file':
				path = paths.normalize(modelUri.fsPath, true);
				break;
			case DEBUG_SCHEME:
				path = modelUri.path;
				if (modelUri.query) {
					const keyvalues = modelUri.query.split('&');
					for (let keyvalue of keyvalues) {
						const pair = keyvalue.split('=');
						if (pair.length === 2) {
							switch (pair[0]) {
								case 'session':
									break;
								case 'ref':
									sourceRef = parseInt(pair[1]);
									break;
							}
						}
					}
				}
				break;
			default:
				path = modelUri.toString();
				break;
		}

		const src: DebugProtocol.Source = { name, path };
		if (sourceRef) {
			src.sourceReference = sourceRef;
		}
		return src;
	}
}