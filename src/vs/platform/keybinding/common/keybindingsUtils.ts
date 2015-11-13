/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Platform = require('vs/base/common/platform');

import {IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export class KeybindingsUtils {
	/**
	 * Take current platform into account and reduce to primary & secondary.
	 */
	public static bindToCurrentPlatform(kb:IKeybindings): { primary?: number; secondary?: number[]; } {
		if (Platform.isWindows) {
			if (kb && kb.win) {
				return kb.win;
			}
		} else if (Platform.isMacintosh) {
			if (kb && kb.mac) {
				return kb.mac;
			}
		} else {
			if (kb && kb.linux) {
				return kb.linux;
			}
		}

		return kb;
	}
}
