/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import { StatusbarAlignment, IStatusbarRegistry, Extensions, StatusbarItemDescriptor } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { FeedbackStatusbarItem } from './feedbackStatusbarItem';

// Register Statusbar item
Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(new StatusbarItemDescriptor(
	FeedbackStatusbarItem,
	StatusbarAlignment.RIGHT,
	-100 /* Low Priority */
));