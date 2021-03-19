/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls'; import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export const gettingStartedUncheckedCodicon = registerIcon('getting-started-item-unchecked', Codicon.circleLargeOutline, localize('gettingStartedUnchecked', "Used to represent getting started items which have not been completed"));
export const gettingStartedCheckedCodicon = registerIcon('getting-started-item-checked', Codicon.passFilled, localize('gettingStartedChecked', "Used to represent getting started items which have been completed"));
