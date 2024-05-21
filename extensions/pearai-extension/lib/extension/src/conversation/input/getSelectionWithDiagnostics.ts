import * as vscode from "vscode";
import { getActiveEditor } from "../../vscode/getActiveEditor";

export const getSelectedTextWithDiagnostics = async ({
	diagnosticSeverities,
}: {
	diagnosticSeverities: Array<"error" | "warning" | "information" | "hint">;
}): Promise<string | undefined> => {
	const activeEditor = getActiveEditor();

	if (activeEditor == undefined) {
		return undefined;
	}

	const { document, selection } = activeEditor;

	// expand range to beginning and end of line, because ranges tend to be inaccurate:
	const range = new vscode.Range(
		new vscode.Position(selection.start.line, 0),
		new vscode.Position(selection.end.line + 1, 0)
	);

	const includedDiagnosticSeverities = diagnosticSeverities.map(
		(diagnostic) => {
			switch (diagnostic) {
				case "error":
					return vscode.DiagnosticSeverity.Error;
				case "warning":
					return vscode.DiagnosticSeverity.Warning;
				case "information":
					return vscode.DiagnosticSeverity.Information;
				case "hint":
					return vscode.DiagnosticSeverity.Hint;
			}
		}
	);

	const diagnostics = vscode.languages
		.getDiagnostics(document.uri)
		.filter(
			(diagnostic) =>
				includedDiagnosticSeverities.includes(diagnostic.severity) &&
				// line based filtering, because the ranges tend to be to inaccurate:
				diagnostic.range.start.line >= range.start.line &&
				diagnostic.range.end.line <= range.end.line
		)
		.map((diagnostic) => ({
			line: diagnostic.range.start.line,
			message: diagnostic.message,
			source: diagnostic.source,
			code:
				typeof diagnostic.code === "object"
					? diagnostic.code.value
					: diagnostic.code,
			severity: diagnostic.severity,
		}));

	if (diagnostics.length === 0) {
		return undefined;
	}

	return annotateSelectionWithDiagnostics({
		selectionText: document.getText(selection),
		selectionStartLine: range.start.line,
		diagnostics,
	});
};

export type DiagnosticInRange = {
	code?: string | number | undefined;
	source?: string | undefined;
	message: string;
	line: number;
	severity: vscode.DiagnosticSeverity;
};

function annotateSelectionWithDiagnostics({
	selectionText,
	selectionStartLine,
	diagnostics,
}: {
	selectionText: string;
	selectionStartLine: number;
	diagnostics: Array<DiagnosticInRange>;
}) {
	return selectionText
		.split(/[\r\n]+/)
		.map((line, index) => {
			const actualLineNumber = selectionStartLine + index;
			const lineDiagnostics = diagnostics.filter(
				(diagnostic) => diagnostic.line === actualLineNumber
			);

			return lineDiagnostics.length === 0
				? line
				: `${line}\n${lineDiagnostics
						.map(
							(diagnostic) =>
								`${getLabel(diagnostic.severity)} ${diagnostic.source}${
									diagnostic.code
								}: ${diagnostic.message}`
						)
						.join("\n")}`;
		})
		.join("\n");
}

function getLabel(severity: vscode.DiagnosticSeverity) {
	switch (severity) {
		case vscode.DiagnosticSeverity.Error:
			return "ERROR";
		case vscode.DiagnosticSeverity.Warning:
			return "WARNING";
		case vscode.DiagnosticSeverity.Information:
			return "INFO";
		case vscode.DiagnosticSeverity.Hint:
			return "HINT";
	}
}
