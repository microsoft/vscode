/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { normalizePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from './agentHostUri.js';
import { isHostSnapshotAttachment } from './meta/agentSnapshotAttachmentMeta.js';
import { MessageAttachmentKind, type MessageAttachment } from './state/protocol/state.js';

/**
 * The Agent Host-local `file` URIs of the files and folders a user message attaches:
 * the exact file, or the folder itself for a directory. Host-created snapshots
 * (already readable from the session data folder), embedded content, and
 * non-`file` resources are ignored. A client-wrapped `vscode-agent-host` URI is
 * unwrapped to the host URI it stands for. `.` and `..` segments are resolved.
 */
export function getAttachedLocalPaths(attachments: readonly MessageAttachment[] | undefined): URI[] {
	const paths: URI[] = [];
	for (const attachment of attachments ?? []) {
		if (attachment.type !== MessageAttachmentKind.Resource || isHostSnapshotAttachment(attachment)) {
			continue;
		}
		let uri: URI;
		try {
			uri = URI.parse(attachment.uri);
		} catch {
			continue;
		}
		if (uri.scheme === AGENT_HOST_SCHEME) {
			uri = fromAgentHostUri(uri);
		}
		if (uri.scheme === Schemas.file && uri.path.length > 1) {
			paths.push(normalizePath(uri));
		}
	}
	return paths;
}
