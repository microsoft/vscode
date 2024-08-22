/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from '../../../../platform/quickinput/common/quickAccess';
import { QuickHelpNLS } from '../../../common/standaloneStrings';
import { HelpQuickAccessProvider } from '../../../../platform/quickinput/browser/helpQuickAccess';

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: HelpQuickAccessProvider,
	prefix: '',
	helpEntries: [{ description: QuickHelpNLS.helpQuickAccessActionLabel }]
});
