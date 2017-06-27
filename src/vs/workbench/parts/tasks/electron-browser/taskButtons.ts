/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

export function domElement() {
	return `
<button class="taskButton", tabindex="0">${escape(localize('RunTaskAction.label', "Run task"))}</button>
<button class="taskButton", tabindex="1">${escape(localize('BuildAction.label', "Run build task"))}</button>
<button class="taskButton", tabindex="2">${escape(localize('TestAction.label', "Run test task"))}</button>
<button class="taskButton", tabindex="3">${escape(localize('TerminateAction.label', "Terminate running task"))}</button>
<button class="taskButton", tabindex="4">${escape(localize('RestartTaskAction.label', "Restart task"))}</button>
`;
};