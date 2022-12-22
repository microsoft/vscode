/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, FullDocumentDiagnosticReport, TextDocuments, UnchangedDocumentDiagnosticReport } from 'vscode-languageserver';
import * as md from 'vscode-markdown-languageservice';
import { Disposable } from 'vscode-notebook-renderer/events';
import { URI } from 'vscode-uri';
import { ConfigurationManager, ValidateEnabled } from '../configuration';
import { disposeAll } from '../util/dispose';

const defaultDiagnosticOptions: md.DiagnosticOptions = {
	validateFileLinks: md.DiagnosticLevel.ignore,
	validateReferences: md.DiagnosticLevel.ignore,
	validateFragmentLinks: md.DiagnosticLevel.ignore,
	validateMarkdownFileLinkFragments: md.DiagnosticLevel.ignore,
	validateUnusedLinkDefinitions: md.DiagnosticLevel.ignore,
	validateDuplicateLinkDefinitions: md.DiagnosticLevel.ignore,
	ignoreLinks: [],
};

function convertDiagnosticLevel(enabled: ValidateEnabled): md.DiagnosticLevel | undefined {
	switch (enabled) {
		case 'error': return md.DiagnosticLevel.error;
		case 'warning': return md.DiagnosticLevel.warning;
		case 'ignore': return md.DiagnosticLevel.ignore;
		case 'hint': return md.DiagnosticLevel.hint;
		default: return md.DiagnosticLevel.ignore;
	}
}

function getDiagnosticsOptions(config: ConfigurationManager): md.DiagnosticOptions {
	const settings = config.getSettings();
	if (!settings) {
		return defaultDiagnosticOptions;
	}

	const validateFragmentLinks = convertDiagnosticLevel(settings.markdown.validate.fragmentLinks.enabled);
	return {
		validateFileLinks: convertDiagnosticLevel(settings.markdown.validate.fileLinks.enabled),
		validateReferences: convertDiagnosticLevel(settings.markdown.validate.referenceLinks.enabled),
		validateFragmentLinks: convertDiagnosticLevel(settings.markdown.validate.fragmentLinks.enabled),
		validateMarkdownFileLinkFragments: settings.markdown.validate.fileLinks.markdownFragmentLinks === 'inherit' ? validateFragmentLinks : convertDiagnosticLevel(settings.markdown.validate.fileLinks.markdownFragmentLinks),
		validateUnusedLinkDefinitions: convertDiagnosticLevel(settings.markdown.validate.unusedLinkDefinitions.enabled),
		validateDuplicateLinkDefinitions: convertDiagnosticLevel(settings.markdown.validate.duplicateLinkDefinitions.enabled),
		ignoreLinks: settings.markdown.validate.ignoredLinks,
	};
}

export function registerValidateSupport(
	connection: Connection,
	workspace: md.IWorkspace,
	documents: TextDocuments<md.ITextDocument>,
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

		if (!config.getSettings()?.markdown.validate.enabled) {
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

	subs.push(documents.onDidClose(e => {
		manager.disposeDocumentResources(URI.parse(e.document.uri));
	}));

	return {
		dispose: () => {
			disposeAll(subs);
		}
	};
}
