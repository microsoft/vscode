/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Messages the agents exchange through the Orchestrator. `bugId` ties every message of one
 * detect → investigate → fix → verify cycle together.
 */

export interface TestFailure {
	readonly type: 'test-failure';
	readonly bugId: string;
	readonly testName: string;
	readonly level: 'host' | 'target' | 'hil';
	readonly message: string;
	readonly output?: string;
}

export interface InvestigationRequest {
	readonly type: 'investigation-request';
	readonly bugId: string;
	readonly symptom: string;
	/** What the tester suspects or wants checked, e.g. "is USART2 clocked after init?". */
	readonly hypotheses?: readonly string[];
}

export type EvidenceKind = 'registers' | 'memory' | 'peripheral' | 'backtrace' | 'crash' | 'rtos' | 'expression' | 'note';

export interface Evidence {
	readonly kind: EvidenceKind;
	/** One line, e.g. "RCC.APB1ENR.USART2EN = 0 (expected 1)". */
	readonly summary: string;
	readonly data?: unknown;
}

export interface DebugFindings {
	readonly type: 'debug-findings';
	readonly bugId: string;
	readonly rootCause?: string;
	readonly confidence: 'low' | 'medium' | 'high';
	readonly evidence: readonly Evidence[];
	readonly suggestedFix?: string;
}

export interface ChangeRequest {
	readonly type: 'change-request';
	readonly bugId: string;
	readonly description: string;
	readonly files?: readonly string[];
	readonly findings?: DebugFindings;
}

export interface ChangeApplied {
	readonly type: 'change-applied';
	readonly bugId: string;
	readonly summary: string;
	readonly changedFiles: readonly string[];
	readonly buildSucceeded: boolean;
}

export interface VerificationResult {
	readonly type: 'verification-result';
	readonly bugId: string;
	readonly passed: boolean;
	readonly details: string;
}

export type CollaborationMessage =
	| TestFailure
	| InvestigationRequest
	| DebugFindings
	| ChangeRequest
	| ChangeApplied
	| VerificationResult;
