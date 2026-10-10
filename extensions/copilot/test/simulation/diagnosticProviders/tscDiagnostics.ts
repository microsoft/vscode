/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type ts from 'typescript/lib/tsserverlibrary';
import { ITestDiagnosticLocation } from './diagnosticsProvider';

export function getDiagnosticMessage(diagnostic: ts.server.protocol.Diagnostic | ts.server.protocol.DiagnosticWithLinePosition): string {
	return isDiagnosticWithLinePosition(diagnostic) ? diagnostic.message.replace(/\r\n?/g, '\n') : diagnostic.text;
}

export function getDiagnosticLocation(diagnostic: ts.server.protocol.Diagnostic | ts.server.protocol.DiagnosticWithLinePosition, fileName: string): ITestDiagnosticLocation {
	if (!isDiagnosticWithLinePosition(diagnostic)) {
		return {
			file: fileName,
			startLine: diagnostic.start.line - 1,
			startCharacter: diagnostic.start.offset - 1,
			endLine: diagnostic.end.line - 1,
			endCharacter: diagnostic.end.offset - 1,
		};
	}

	if (!diagnostic.startLocation || !diagnostic.endLocation) {
		throw new Error(`TS Server diagnostic for ${fileName} is missing line position metadata`);
	}

	return {
		file: fileName,
		startLine: diagnostic.startLocation.line - 1,
		startCharacter: diagnostic.startLocation.offset - 1,
		endLine: diagnostic.endLocation.line - 1,
		endCharacter: diagnostic.endLocation.offset - 1,
	};
}

function isDiagnosticWithLinePosition(diagnostic: ts.server.protocol.Diagnostic | ts.server.protocol.DiagnosticWithLinePosition): diagnostic is ts.server.protocol.DiagnosticWithLinePosition {
	return typeof diagnostic.start === 'number';
}
