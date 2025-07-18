/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { HasSpeechProvider } from '../../../speech/common/speechService.js';
import { registerActiveInstanceAction, sharedWhenClause } from '../../../terminal/browser/terminalActions.js';
import { TerminalCommandId } from '../../../terminal/common/terminal.js';
import { TerminalVoiceSession } from './terminalVoice.js';

export function registerTerminalVoiceActions() {
	registerActiveInstanceAction({
		id: TerminalCommandId.StartVoice,
		title: localize2('workbench.action.terminal.startDictation', "Start Dictation in Terminal"),
		precondition: ContextKeyExpr.and(HasSpeechProvider, sharedWhenClause.terminalAvailable),
		f1: true,
		run: (activeInstance, c, accessor) => {
			const instantiationService = accessor.get(IInstantiationService);
			TerminalVoiceSession.getInstance(instantiationService).start();
		}
	});

	registerActiveInstanceAction({
		id: TerminalCommandId.StopVoice,
		title: localize2('workbench.action.terminal.stopDictation', "Stop Dictation in Terminal"),
		precondition: ContextKeyExpr.and(HasSpeechProvider, sharedWhenClause.terminalAvailable),
		f1: true,
		run: (activeInstance, c, accessor) => {
			const instantiationService = accessor.get(IInstantiationService);
			TerminalVoiceSession.getInstance(instantiationService).stop(true);
		}
	});
}
