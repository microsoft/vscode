/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AGENT_SESSION_CLEANUP_SETTINGS_TAG, ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';

export const AUTO_MARK_AS_DONE_MERGED_SESSIONS_AFTER_DAYS_SETTING = ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays;
export const AUTO_DELETE_ARCHIVED_MERGED_SESSIONS_AFTER_DAYS_SETTING = ChatConfiguration.AutoDeleteArchivedMergedSessionsAfterDays;
export const AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_TAG = AGENT_SESSION_CLEANUP_SETTINGS_TAG;
export const AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_QUERY = `@tag:${AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_TAG}`;
