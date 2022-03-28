/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { language } from 'vs/base/common/platform';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export const LOCAL_HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });

export const LOCAL_HISTORY_MENU_CONTEXT_VALUE = 'localHistory:item';
export const LOCAL_HISTORY_MENU_CONTEXT_KEY = ContextKeyExpr.equals('timelineItem', LOCAL_HISTORY_MENU_CONTEXT_VALUE);

export const LOCAL_HISTORY_ICON_ENTRY = registerIcon('localHistory-icon', Codicon.circleOutline, localize('localHistoryIcon', "Icon for a local history entry in the timeline view."));
export const LOCAL_HISTORY_ICON_RESTORE = registerIcon('localHistory-restore', Codicon.check, localize('localHistoryRestore', "Icon for restoring contents of a local history entry."));
