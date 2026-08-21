/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsLogTargetService, Logger } from '../logger';
import { postInsertionTasks, postRejectionTasks } from '../postInsertion';
import { countLines, SuggestionStatus } from '../suggestions/partialSuggestions';
import { TelemetryWithExp } from '../telemetry';
import { IPosition, TextDocumentContents, TextDocumentIdentifier } from '../textDocument';
import { CopilotCompletion } from './copilotCompletion';
import { ResultType } from './resultType';
import { GHOST_TEXT_CATEGORY, telemetryShown } from './telemetry';

const ghostTextLogger = new Logger('ghostText');

export const ICompletionsLastGhostText = createServiceIdentifier<ICompletionsLastGhostText>('ICompletionsLastGhostText');
export interface ICompletionsLastGhostText {
	readonly _serviceBrand: undefined;

	position: IPosition | undefined;
	uri: string | undefined;
	shownCompletions: CopilotCompletion[];
	index: number | undefined;
	totalLength: number | undefined;
	partiallyAcceptedLength: number | undefined;
	linesLeft: number | undefined;
	linesAccepted: number;
	lastLineAcceptedLength: number | undefined;

	resetState(): void;
	setState(document: TextDocumentIdentifier, position: IPosition): void;
	resetPartialAcceptanceState(): void;
}

export class LastGhostText implements ICompletionsLastGhostText {
	declare _serviceBrand: undefined;

	#position: IPosition | undefined;
	#uri: string | undefined;
	#shownCompletions: CopilotCompletion[] = [];
	index: number | undefined;
	totalLength: number | undefined;
	partiallyAcceptedLength: number | undefined;
	linesLeft: number | undefined; // Lines left to accept in the current completion, used for partial acceptance
	linesAccepted: number = 0; // Number of lines accepted in the current completion, used for partial acceptance
	lastLineAcceptedLength: number | undefined; // Length of the last accepted line, used for partial acceptance

	get position() {
		return this.#position;
	}

	get shownCompletions() {
		return this.#shownCompletions || [];
	}

	get uri() {
		return this.#uri;
	}

	resetState() {
		this.#uri = undefined;
		this.#position = undefined;
		this.#shownCompletions = [];
		this.resetPartialAcceptanceState();
	}

	setState({ uri }: TextDocumentIdentifier, position: IPosition) {
		this.#uri = uri;
		this.#position = position;
		this.#shownCompletions = [];
	}

	resetPartialAcceptanceState() {
		this.partiallyAcceptedLength = 0;
		this.totalLength = undefined;
		this.linesLeft = undefined;
		this.linesAccepted = 0;
	}
}

function computeRejectedCompletions<
	T extends { completionText: string; completionTelemetryData: TelemetryWithExp; offset: number },
>(last: ICompletionsLastGhostText): T[] {
	const rejectedCompletions: T[] = [];
	last.shownCompletions.forEach(c => {
		if (c.displayText && c.telemetry) {
			let completionText;
			let completionTelemetryData;

			if (last.partiallyAcceptedLength) {
				// suggestion got partially accepted already but rejecting the remainder
				completionText = c.displayText.substring(last.partiallyAcceptedLength - 1);
				completionTelemetryData = c.telemetry.extendedBy(
					{
						compType: 'partial',
					},
					{
						compCharLen: completionText.length,
					}
				);
			} else {
				completionText = c.displayText;
				completionTelemetryData = c.telemetry;
			}
			const rejection = { completionText, completionTelemetryData, offset: c.offset };
			rejectedCompletions.push(rejection as T);
		}
	});
	return rejectedCompletions;
}

export function rejectLastShown(accessor: ServicesAccessor, offset?: number) {
	const last = accessor.get(ICompletionsLastGhostText);
	if (!last.position || !last.uri) { return; }
	//The position has changed and we're not in typing-as-suggested flow
	// so previously shown completions can be reported as rejected
	const rejectedCompletions = computeRejectedCompletions(last);
	if (rejectedCompletions.length > 0) {
		postRejectionTasks(accessor, 'ghostText', offset ?? rejectedCompletions[0].offset, last.uri, rejectedCompletions);
	}
	last.resetState();
	last.resetPartialAcceptanceState();
}

export function setLastShown(
	accessor: ServicesAccessor,
	document: TextDocumentContents,
	position: IPosition,
	resultType: ResultType
) {
	const last = accessor.get(ICompletionsLastGhostText);
	if (
		last.position &&
		last.uri &&
		!(
			last.position.line === position.line &&
			last.position.character === position.character &&
			last.uri.toString() === document.uri.toString()
		) &&
		resultType !== ResultType.TypingAsSuggested // results for partial acceptance count as TypingAsSuggested
	) {
		rejectLastShown(accessor, document.offsetAt(last.position));
	}
	last.setState(document, position);
	return last.index;
}

export function handleGhostTextShown(accessor: ServicesAccessor, cmp: CopilotCompletion) {
	const logTarget = accessor.get(ICompletionsLogTargetService);
	const last = accessor.get(ICompletionsLastGhostText);
	last.index = cmp.index;
	if (!last.shownCompletions.find(c => c.index === cmp.index)) {
		// Only update if .position is still at the position of the completion
		if (
			cmp.uri === last.uri &&
			last.position?.line === cmp.position.line &&
			last.position?.character === cmp.position.character
		) {
			last.shownCompletions.push(cmp);
		}
		// Show telemetry only if it was not shown before (i.e. don't sent repeated telemetry in cycling case when user cycled through every suggestions or goes back and forth)
		if (cmp.displayText) {
			const fromCache = !(cmp.resultType === ResultType.Network);
			ghostTextLogger.debug(
				logTarget,
				`[${cmp.telemetry.properties.headerRequestId}] shown choiceIndex: ${cmp.telemetry.properties.choiceIndex}, fromCache ${fromCache}`
			);
			cmp.telemetry.measurements.compCharLen = cmp.displayText.length;
			telemetryShown(accessor, cmp);
		}
	}
}

/**
 * Handles partial acceptance for VS Code clients using line-based strategy.
 * VS Code tracks acceptance by lines and resets the accepted length per line.
 */
function handleLineAcceptance(accessor: ServicesAccessor, cmp: CopilotCompletion, acceptedLength: number) {
	const last = accessor.get(ICompletionsLastGhostText);

	// If this is the first acceptance, we need to initialize the linesLeft
	if (last.linesLeft === undefined) {
		last.linesAccepted = countLines(cmp.insertText.substring(0, acceptedLength));
		last.linesLeft = countLines(cmp.displayText);
	}

	const linesLeft = countLines(cmp.displayText);

	if (last.linesLeft > linesLeft) {
		// If the number of lines left has decreased, we need to update the accepted lines count
		// and reset the last line accepted length
		last.linesAccepted += last.linesLeft - linesLeft;
		last.lastLineAcceptedLength = last.partiallyAcceptedLength;
		last.linesLeft = linesLeft;
	}

	last.partiallyAcceptedLength = (last.lastLineAcceptedLength || 0) + acceptedLength;
}

/**
 * Handles full acceptance of ghost text completions.
 * This method is primarily used by VS Code for explicit full acceptances.
 */
export function handleGhostTextPostInsert(
	accessor: ServicesAccessor,
	cmp: CopilotCompletion,
) {
	const last = accessor.get(ICompletionsLastGhostText);

	let suggestionStatus: SuggestionStatus;

	if (last.partiallyAcceptedLength) {
		suggestionStatus = {
			compType: 'full',
			acceptedLength: (last.partiallyAcceptedLength || 0) + cmp.displayText.length,
			acceptedLines: last.linesAccepted + (last.linesLeft ?? 0),
		};
	} else {
		suggestionStatus = {
			compType: 'full',
			acceptedLength: cmp.displayText.length,
			acceptedLines: countLines(cmp.displayText),
		};
	}

	//If any completion was accepted, clear the list of shown completions
	//that would be passed to rejected telemetry
	last.resetState();

	return postInsertionTasks(
		accessor,
		GHOST_TEXT_CATEGORY,
		cmp.displayText,
		cmp.offset,
		cmp.uri,
		cmp.telemetry,
		suggestionStatus,
		cmp.copilotAnnotations
	);
}

export function handlePartialGhostTextPostInsert(
	accessor: ServicesAccessor,
	cmp: CopilotCompletion,
	acceptedLength: number,
) {
	const last = accessor.get(ICompletionsLastGhostText);

	handleLineAcceptance(accessor, cmp, acceptedLength);

	const suggestionStatus: SuggestionStatus = {
		compType: 'partial',
		acceptedLength: last.partiallyAcceptedLength || 0,
		acceptedLines: last.linesAccepted,
	};

	return postInsertionTasks(
		accessor,
		GHOST_TEXT_CATEGORY,
		cmp.displayText,
		cmp.offset,
		cmp.uri,
		cmp.telemetry,
		suggestionStatus,
		cmp.copilotAnnotations
	);
}
