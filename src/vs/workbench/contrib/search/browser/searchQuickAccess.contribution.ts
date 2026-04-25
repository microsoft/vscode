/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { AbstractGotoLineQuickAccessProvider } from '../../../../editor/contrib/quickAccess/browser/gotoLineQuickAccess.js';
import { Extensions as QuickAccessExtensions, IQuickAccessRegistry } from '../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { defaultQuickAccessContextKeyValue } from '../../../browser/quickaccess.js';
import { GotoSymbolQuickAccessProvider } from '../../codeEditor/browser/quickaccess/gotoSymbolQuickAccess.js';
import { AnythingQuickAccessProvider } from './anythingQuickAccess.js';
import { SymbolsQuickAccessProvider } from './symbolsQuickAccess.js';
import './searchActionsSymbol.js';

const quickAccessRegistry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess);

quickAccessRegistry.registerQuickAccessProvider({
	ctor: AnythingQuickAccessProvider,
	prefix: AnythingQuickAccessProvider.PREFIX,
	placeholder: nls.localize('anythingQuickAccessPlaceholder', "Search files by name (append {0} to go to line or {1} to go to symbol)", AbstractGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX, GotoSymbolQuickAccessProvider.PREFIX),
	contextKey: defaultQuickAccessContextKeyValue,
	helpEntries: [{
		description: nls.localize('anythingQuickAccess', "Go to File"),
		commandId: 'workbench.action.quickOpen',
		commandCenterOrder: 10
	}]
});

quickAccessRegistry.registerQuickAccessProvider({
	ctor: SymbolsQuickAccessProvider,
	prefix: SymbolsQuickAccessProvider.PREFIX,
	placeholder: nls.localize('symbolsQuickAccessPlaceholder', "Type the name of a symbol to open."),
	contextKey: 'inWorkspaceSymbolsPicker',
	helpEntries: [{ description: nls.localize('symbolsQuickAccess', "Go to Symbol in Workspace"), commandId: 'workbench.action.showAllSymbols' }]
});
