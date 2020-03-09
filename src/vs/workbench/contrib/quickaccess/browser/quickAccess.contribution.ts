/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { HelpQuickAccessProvider } from 'vs/platform/quickinput/browser/helpQuickAccess';
import { ViewQuickAccessProvider, VIEW_QUICK_ACCESS_PREFIX } from 'vs/workbench/contrib/quickaccess/browser/viewQuickAccess';

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: HelpQuickAccessProvider,
	prefix: '?',
	helpEntries: [{ description: localize('helpQuickAccess', "Show all Quick Access Providers"), needsEditor: false }]
});

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: ViewQuickAccessProvider,
	prefix: VIEW_QUICK_ACCESS_PREFIX,
	helpEntries: [{ description: localize('viewQuickAccess', "Open View"), needsEditor: false }]
});
