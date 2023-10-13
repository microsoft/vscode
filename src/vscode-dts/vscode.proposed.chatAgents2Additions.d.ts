/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export type ChatAgentUserActionEvent = InteractiveSessionUserActionEvent & {
		result: ChatAgentResult2;
	};

	export interface ChatAgent2 {

		// TODO@API We need this- can't handle telemetry on the vscode side yet
		onDidPerformAction: Event<ChatAgentUserActionEvent>;
	}
}
