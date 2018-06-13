/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IStatusbarRegistry, StatusbarAlignment, StatusbarItemDescriptor } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { BreadcrumbsStatusbarItem } from 'vs/workbench/parts/breadcrumbs/electron-browser/breadcrumbsStatusbarItem';

Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(
	new StatusbarItemDescriptor(BreadcrumbsStatusbarItem, StatusbarAlignment.LEFT)
);
