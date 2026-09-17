/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { isObject } from '../../../base/common/types.js';
import { WorkflowObject } from './workflow.js';

const instructionsHeader = '[Checkpoint instructions]\n\n';
const inputsHeader = '\n\n[Inputs]\n\n';
const feedbackHeader = '\n\n[Checkpoint feedback]\n\n';
const proofHeader = '\n\n[Proof schema]\n\n';
const protocolHeader = '\n\n[Fixed workflow protocol]\n\n';

export function buildWorkflowPrompt(instructions: string, proofSchema: IJSONSchema, inputs: WorkflowObject = {}, feedback?: string): string {
	return instructionsHeader + instructions
		+ proofHeader + JSON.stringify(proofSchema)
		+ (Object.keys(inputs).length ? inputsHeader + JSON.stringify(inputs) : '')
		+ (feedback ? feedbackHeader + JSON.stringify(feedback) : '')
		+ protocolHeader + [
			'Work on this assignment only, within existing tool permissions and runtime policy. Finish delegated work before proof.',
			'Call get_checkpoint if you need the original request or bound assignment context.',
			'Call prove_checkpoint with proof matching the schema above. An ended turn is not proof. Schema-valid reported proof is not independently fact-checked.',
			'After accepted or waiting, give a brief status and end this turn. Do not start the next checkpoint or poll a saved wait.',
			'After rejected, repair the reported problem and resubmit if possible. After blocked or stale_assignment, end the turn.',
			'If unable to proceed, call report_checkpoint_blocked with a reason.',
		].join('\n\n');
}

/** Extracts display-only details from a marked workflow request, including older saved prompts. */
export function parseWorkflowPrompt(message: string): { readonly instructions: string; readonly proofSchema: string } | undefined {
	const legacy = message.startsWith('[Current task]\n\n');
	if (!legacy && !message.startsWith(instructionsHeader)) {
		return undefined;
	}
	const protocol = message.lastIndexOf(protocolHeader);
	const proof = message.lastIndexOf(proofHeader, protocol);
	if (protocol < 0 || proof < 0) {
		return undefined;
	}
	const schemaSection = message.slice(proof + proofHeader.length, protocol);
	const nextSection = schemaSection.search(/\n\n\[(?:Inputs|Checkpoint feedback)\]\n\n/);
	const schema = readJson(nextSection < 0 ? schemaSection : schemaSection.slice(0, nextSection));
	if (!isObject(schema)) {
		return undefined;
	}
	const start = message.indexOf(instructionsHeader);
	if (start < 0 || start >= proof) {
		return undefined;
	}
	let instructions = message.slice(start + instructionsHeader.length, proof);
	if (legacy) {
		const inputs = instructions.lastIndexOf(inputsHeader);
		if (inputs >= 0) {
			instructions = instructions.slice(0, inputs);
		}
	}
	return { instructions, proofSchema: JSON.stringify(schema, null, 2) };
}

function readJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return undefined;
	}
}
