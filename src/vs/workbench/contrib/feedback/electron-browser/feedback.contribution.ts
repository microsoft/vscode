/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IStatusbarRegistry, Extensions, StatusbarItemDescriptor } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { FeedbackStatusbarItem } from 'vs/workbench/contrib/feedback/electron-browser/feedbackStatusbarItem';
import { localize } from 'vs/nls';

// Register Statusbar item
Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(new StatusbarItemDescriptor(
	FeedbackStatusbarItem,
	'status.feedback',
	localize('status.feedback', "Tweet Feedback"),
	StatusbarAlignment.RIGHT,
	-100 /* towards the end of the right hand side */
));
