/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type WebviewInboundMessage =
	| { type: 'sendMessage'; message: string; model?: string }
	| { type: 'checkBackend' }
	| { type: 'generateCode'; prompt: string; connector: string }
	| { type: 'connectGitHub' }
	| { type: 'connectVercel' }
	| { type: 'deployProject'; prompt: string; repoName: string; projectName: string }
	| { type: 'checkAuthStatus' }
	| { type: 'generatePlan'; request: string; model?: string }
	| { type: 'approvePlan'; planId: string }
	| { type: 'cancelPlan'; planId: string }
	| { type: 'modifyPlan'; planId: string; modification: any }
	| { type: 'getHistory' }
	| { type: 'getRollbackable' }
	| { type: 'rollback'; historyId: number }
	| { type: 'browsePlatforms' }
	| { type: 'indexWorkspace' }
	| { type: 'executeRequest'; request: string; model?: string }
	| { type: 'runAgent'; request: string; model?: string };

export type WebviewOutboundMessage =
	| { type: 'addMessage'; role: 'user' | 'assistant'; content: string; isLoading: boolean }
	| { type: 'backendStatus'; connected: boolean }
	| { type: 'authStatus'; github: boolean; vercel: boolean }
	| { type: 'showPlanApproval'; plan: any }
	| { type: 'taskUpdate'; planId: string; taskId: string; taskName?: string; status: string; result?: any; error?: string; cost?: number }
	| { type: 'taskRetry'; planId: string; taskId: string; taskName?: string; attempt: number; maxAttempts: number; platform: string }
	| { type: 'planCompleted'; planId: string; status: string; actualCost: number }
	| { type: 'planExecutionStarted'; planId: string }
	| { type: 'planExecutionComplete'; planId: string; status: string; tasks: any[]; actualCost: number };

export type ChatInitialState = {
	connected: boolean;
	auth: {
		github: boolean;
		vercel: boolean;
	};
};

