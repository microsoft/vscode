/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, FullDocumentDiagnosticReport, UnchangedDocumentDiagnosticReport } from 'vscode-languageserver';
import * as md from 'vscode-markdown-languageservice';
import { disposeAll } from 'vscode-markdown-languageservice/out/util/dispose';
import { Disposable } from 'vscode-notebook-renderer/events';
import { URI } from 'vscode-uri';
import { ConfigurationManager, ValidateEnabled } from '../configuration';

const defaultDiagnosticOptions: md.DiagnosticOptions = {
	validateFileLinks: md.DiagnosticLevel.ignore,
	validateReferences: md.DiagnosticLevel.ignore,
	validateFragmentLinks: md.DiagnosticLevel.ignore,
	validateMarkdownFileLinkFragments: md.DiagnosticLevel.ignore,
	ignoreLinks: [],
};

function convertDiagnosticLevel(enabled: ValidateEnabled): md.DiagnosticLevel | undefined {
	switch (enabled) {
		case 'error': return md.DiagnosticLevel.error;
		case 'warning': return md.DiagnosticLevel.warning;
		case 'ignore': return md.DiagnosticLevel.ignore;
		default: return md.DiagnosticLevel.ignore;
	}
}

function getDiagnosticsOptions(config: ConfigurationManager): md.DiagnosticOptions {
	const settings = config.getSettings();
	if (!settings) {
		return defaultDiagnosticOptions;
	}

	return {
		validateFileLinks: convertDiagnosticLevel(settings.markdown.experimental.validate.fileLinks.enabled),
		validateReferences: convertDiagnosticLevel(settings.markdown.experimental.validate.referenceLinks.enabled),
		validateFragmentLinks: convertDiagnosticLevel(settings.markdown.experimental.validate.fragmentLinks.enabled),
		validateMarkdownFileLinkFragments: convertDiagnosticLevel(settings.markdown.experimental.validate.fileLinks.markdownFragmentLinks),
		ignoreLinks: settings.markdown.experimental.validate.ignoreLinks,
	};
}

export function registerValidateSupport(
	connection: Connection,
	workspace: md.IWorkspace,
	ls: md.IMdLanguageService,
	config: ConfigurationManager,
	logger: md.ILogger,
): Disposable {
	let diagnosticOptions: md.DiagnosticOptions = defaultDiagnosticOptions;
	function updateDiagnosticsSetting(): void {
		diagnosticOptions = getDiagnosticsOptions(config);
	}

	const subs: Disposable[] = [];
	const manager = ls.createPullDiagnosticsManager();
	subs.push(manager);

	subs.push(manager.onLinkedToFileChanged(() => {
		// TODO: We only need to refresh certain files
		connection.languages.diagnostics.refresh();
	}));

	const emptyDiagnosticsResponse = Object.freeze({ kind: 'full', items: [] });

	connection.languages.diagnostics.on(async (params, token): Promise<FullDocumentDiagnosticReport | UnchangedDocumentDiagnosticReport> => {
		logger.log(md.LogLevel.Trace, 'Server: connection.languages.diagnostics.on', params.textDocument.uri);

		if (!config.getSettings()?.markdown.experimental.validate.enabled) {
			return emptyDiagnosticsResponse;
		}

		const uri = URI.parse(params.textDocument.uri);
		if (!workspace.hasMarkdownDocument(uri)) {
			return emptyDiagnosticsResponse;
		}

		const document = await workspace.openMarkdownDocument(uri);
		if (!document) {
			return emptyDiagnosticsResponse;
		}

		const diagnostics = await manager.computeDiagnostics(document, diagnosticOptions, token);
		return {
			kind: 'full',
			items: diagnostics,
		};
	});

	updateDiagnosticsSetting();
	subs.push(config.onDidChangeConfiguration(() => {
		updateDiagnosticsSetting();
		connection.languages.diagnostics.refresh();
	}));

	return {
		dispose: () => {
			disposeAll(subs);
		}
	};
}
