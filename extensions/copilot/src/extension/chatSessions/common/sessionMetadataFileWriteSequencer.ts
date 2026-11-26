/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../util/vs/base/common/async';

/**
 * Serializes, by session id, every write to a session's `vscode.metadata.json` in
 * this extension host. Shared by the session metadata store and the one-time
 * legacy metadata backfill so neither writes over the other mid-write: an
 * exclusive create only protects opening the file, not writing its contents.
 */
export const sessionMetadataFileWriteSequencer = new SequencerByKey<string>();
