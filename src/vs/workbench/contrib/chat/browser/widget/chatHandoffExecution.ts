/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMode } from '../../common/chatModes.js';
import { IHandOff } from '../../common/promptSyntax/promptFileParser.js';

export type IChatHandoffAgentSwitchResult =
	| { readonly success: true; readonly mode: IChatMode }
	| { readonly success: false; readonly reason: string; readonly mode?: IChatMode };

export type IChatHandoffExecutionResult =
	| { readonly success: true; readonly submitted: boolean; readonly targetModeId?: string }
	| { readonly success: false; readonly error: string; readonly targetModeId?: string };

export interface IChatHandoffExecutionDelegate {
	switchToAgent(agentName: string): Promise<IChatHandoffAgentSwitchResult>;
	switchModelByQualifiedName(qualifiedModelNames: readonly string[]): void;
	setInputValue(value: string): void;
	focusInput(): void;
	acceptInput(handoffTargetModeId: string | undefined): void;
}

export interface IChatHandoffTargetModeDelegate {
	getCurrentModeId(): string;
	setChatMode(modeId: string): void;
	logDebug(message: string): void;
	logWarning(message: string): void;
}

export function ensureChatHandoffTargetMode(handoffTargetModeId: string, phase: string, delegate: IChatHandoffTargetModeDelegate): boolean {
	const currentModeId = delegate.getCurrentModeId();
	if (currentModeId === handoffTargetModeId) {
		return true;
	}

	delegate.logDebug(`[Handoff] Reasserting target mode ${phase}: expected='${handoffTargetModeId}', actual='${currentModeId}'`);
	delegate.setChatMode(handoffTargetModeId);

	const verifiedModeId = delegate.getCurrentModeId();
	if (verifiedModeId !== handoffTargetModeId) {
		delegate.logWarning(`[Handoff] Aborting submit because target mode reassertion failed ${phase}: expected='${handoffTargetModeId}', actual='${verifiedModeId}'`);
		return false;
	}

	return true;
}

export async function executeChatHandoff(handoff: IHandOff, agentId: string | undefined, delegate: IChatHandoffExecutionDelegate): Promise<IChatHandoffExecutionResult> {
	let handoffTargetMode: IChatMode | undefined;

	if (handoff.agent) {
		const switchResult = await delegate.switchToAgent(handoff.agent);
		if (!switchResult.success) {
			return { success: false, error: switchResult.reason, targetModeId: switchResult.mode?.id };
		}
		handoffTargetMode = switchResult.mode;
	} else if (!agentId) {
		return { success: false, error: 'handoff has no target agent or delegated target' };
	}

	if (handoff.model) {
		delegate.switchModelByQualifiedName([handoff.model]);
	}

	delegate.setInputValue(agentId ? `@${agentId} ${handoff.prompt}` : handoff.prompt);
	delegate.focusInput();

	const submitted = Boolean(agentId || handoff.send);
	if (submitted) {
		delegate.acceptInput(handoffTargetMode?.id);
	}

	return { success: true, submitted, targetModeId: handoffTargetMode?.id };
}