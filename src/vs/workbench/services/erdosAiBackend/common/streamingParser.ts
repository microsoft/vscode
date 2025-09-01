/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ParsedEvent, StreamData } from '../browser/streamingParser.js';

export const ISSEParser = createDecorator<ISSEParser>('sseParser');

export interface ISSEParser {
	readonly _serviceBrand: undefined;

	parse(chunk: string): ParsedEvent[];
	parseSSELine(line: string): ParsedEvent | null;
	handleDataLine(data: any): StreamData | null;
	reset(): void;
}
