/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI as uri } from 'vs/base/common/uri';
import { normalize, isAbsolute } from 'vs/base/common/path';
import * as resources from 'vs/base/common/resources';
import { DEBUG_SCHEME } from 'vs/workbench/contrib/debug/common/debug';
import { IRange } from 'vs/editor/common/core/range';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { Schemas } from 'vs/base/common/network';
import { isUri } from 'vs/workbench/contrib/debug/common/debugUtils';
import { ITextEditor } from 'vs/workbench/common/editor';
import { withUndefinedAsNull } from 'vs/base/common/types';

export const UNKNOWN_SOURCE_LABEL = nls.localize('unknownSource', "Unknown Source");

/**
 * Debug URI format
 *
 * a debug URI represents a Source object and the debug session where the Source comes from.
 *
 *       debug:arbitrary_path?session=123e4567-e89b-12d3-a456-426655440000&ref=1016
 *       \___/ \____________/ \__________________________________________/ \______/
 *         |          |                             |                          |
 *      scheme   source.path                    session id            source.reference
 *
 *
 */

export class Source {

	public readonly uri: uri;
	public available: boolean;
	public raw: DebugProtocol.Source;

	constructor(raw_: DebugProtocol.Source | undefined, sessionId: string) {
		let path: string;
		if (raw_) {
			this.raw = raw_;
			path = this.raw.path || this.raw.name || '';
			this.available = true;
		} else {
			this.raw = { name: UNKNOWN_SOURCE_LABEL };
			this.available = false;
			path = `${DEBUG_SCHEME}:${UNKNOWN_SOURCE_LABEL}`;
		}

		if (typeof this.raw.sourceReference === 'number' && this.raw.sourceReference > 0) {
			this.uri = uri.from({
				scheme: DEBUG_SCHEME,
				path,
				query: `session=${sessionId}&ref=${this.raw.sourceReference}`
			});
		} else {
			if (isUri(path)) {	// path looks like a uri
				this.uri = uri.parse(path);
			} else {
				// assume a filesystem path
				if (isAbsolute(path)) {
					this.uri = uri.file(path);
				} else {
					// path is relative: since VS Code cannot deal with this by itself
					// create a debug url that will result in a DAP 'source' request when the url is resolved.
					this.uri = uri.from({
						scheme: DEBUG_SCHEME,
						path,
						query: `session=${sessionId}`
					});
				}
			}
		}
	}

	get name() {
		return this.raw.name || resources.basenameOrAuthority(this.uri);
	}

	get origin() {
		return this.raw.origin;
	}

	get presentationHint() {
		return this.raw.presentationHint;
	}

	get reference() {
		return this.raw.sourceReference;
	}

	get inMemory() {
		return this.uri.scheme === DEBUG_SCHEME;
	}

	openInEditor(editorService: IEditorService, selection: IRange, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<ITextEditor | null> {
		return !this.available ? Promise.resolve(null) : editorService.openEditor({
			resource: this.uri,
			description: this.origin,
			options: {
				preserveFocus,
				selection,
				revealIfOpened: true,
				revealInCenterIfOutsideViewport: true,
				pinned: pinned || (!preserveFocus && !this.inMemory)
			}
		}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(withUndefinedAsNull);
	}

	static getEncodedDebugData(modelUri: uri): { name: string, path: string, sessionId?: string, sourceReference?: number } {
		let path: string;
		let sourceReference: number | undefined;
		let sessionId: string | undefined;

		switch (modelUri.scheme) {
			case Schemas.file:
				path = normalize(modelUri.fsPath);
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
									sessionId = pair[1];
									break;
								case 'ref':
									sourceReference = parseInt(pair[1]);
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

		return {
			name: resources.basenameOrAuthority(modelUri),
			path,
			sourceReference,
			sessionId
		};
	}
}
