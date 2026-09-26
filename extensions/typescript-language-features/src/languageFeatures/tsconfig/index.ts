/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import * as vscode from 'vscode';
import { ITypeScriptVersionProvider } from '../../tsServer/versionProvider';
import { tryStat } from '../../utils/fs';
import { TsLibMapReader } from './libMap';
import { collectLinkCandidates, TsConfigLinkKind } from './links';
import { createLinkDescriptors, TsConfigLinkDescriptors, TsConfigMissingTargetPolicy } from './resolvers';

const openTsConfigLinkCommandId = '_typescript.openTsConfigLink';

type OpenTsConfigLinkCommandArgs = {
	readonly resourceUri: vscode.Uri;
	readonly pathValue: string;
	readonly linkKind: TsConfigLinkKind;
};

export class TsconfigLinkProvider implements vscode.DocumentLinkProvider {

	public provideDocumentLinks(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.DocumentLink[] {
		const text = document.getText();
		const root = jsonc.parseTree(text);

		if (!root) {
			return [];
		}

		return collectLinkCandidates(root, text).map(candidate => {
			const args: OpenTsConfigLinkCommandArgs = {
				resourceUri: { ...document.uri.toJSON(), $mid: undefined },
				pathValue: candidate.value,
				linkKind: candidate.kind,
			};

			const range = new vscode.Range(
				document.positionAt(candidate.startOffset),
				document.positionAt(candidate.endOffset));

			// Built rather than parsed: `Uri.parse` percent-decodes the query, and the opener
			// decodes it again, so a value such as `./a%20b.json` would arrive already decoded.
			// `Uri.from` stores the query verbatim, leaving one encode against the opener's one
			// decode. This is how the workbench builds command links, see `createCommandUri`.
			//
			// Known limitation: following the link from its hover rather than from the document
			// hands the opener a string, which it parses, so the query is decoded once more. A
			// value carrying a literal `%` therefore resolves differently between the two
			// gestures. The two paths differ by exactly one decode, which no single encoding of
			// the arguments can satisfy at once.
			const target = vscode.Uri.from({
				scheme: 'command',
				path: openTsConfigLinkCommandId,
				query: encodeURIComponent(JSON.stringify(args)),
			});

			const link = new vscode.DocumentLink(range, target);
			link.tooltip = vscode.l10n.t("Follow link");

			return link;
		});
	}
}

/** Stats a link's target. Injectable so tests can simulate a file, a directory, or nothing at all. */
export type TsConfigLinkStat = (target: vscode.Uri) => Promise<vscode.FileStat | undefined>;

/**
 * What `openTsConfigLink` decided to do once it knew how (or whether) a link resolves.
 * A plain description of the outcome, rather than the VS Code call that carries it out, so tests
 * can assert on what happened without caring how it was presented.
 */
export type TsConfigLinkOutcome =
	| { readonly kind: 'reveal'; readonly target: vscode.Uri }
	| { readonly kind: 'revealOutsideWorkspace'; readonly target: vscode.Uri }
	| { readonly kind: 'open'; readonly target: vscode.Uri }
	| { readonly kind: 'message'; readonly text: string };

/** Carries out an outcome. Injectable so tests can record it instead of touching the real UI. */
export type TsConfigLinkOutcomeHandler = (outcome: TsConfigLinkOutcome) => Promise<void>;

/** Whether the explorer can reveal a target. Injectable so tests need no workspace folder. */
export type TsConfigLinkWorkspaceTest = (target: vscode.Uri) => boolean;

function isInsideWorkspace(target: vscode.Uri): boolean {
	return vscode.workspace.getWorkspaceFolder(target) !== undefined;
}

async function presentTsConfigLinkOutcome(outcome: TsConfigLinkOutcome): Promise<void> {
	switch (outcome.kind) {
		case 'reveal':
			await vscode.commands.executeCommand('revealInExplorer', outcome.target);
			return;
		case 'revealOutsideWorkspace':
			// The explorer can only select what it shows. The OS file manager can show
			// any local folder, but only on desktop and only for local files. A remote
			// window is a desktop window too, and the `file:` paths it shows live on the
			// remote, where the command quietly does nothing.
			if (vscode.env.uiKind === vscode.UIKind.Desktop && vscode.env.remoteName === undefined && outcome.target.scheme === 'file') {
				await vscode.commands.executeCommand('revealFileInOS', outcome.target);
			} else {
				vscode.window.showInformationMessage(vscode.l10n.t("{0} is a folder outside the workspace.", outcome.target.fsPath));
			}
			return;
		case 'open':
			if (outcome.target.scheme === 'http' || outcome.target.scheme === 'https') {
				// `vscode.open` hands http(s) to the browser. The web build's lib files are
				// served that way and readable through the workbench's fetch provider, so they
				// open as text documents instead.
				await vscode.window.showTextDocument(outcome.target);
				return;
			}

			// Will suggest creating the file if it doesn't exist yet (but only for relative paths)
			await vscode.commands.executeCommand('vscode.open', outcome.target);
			return;
		case 'message':
			vscode.window.showErrorMessage(outcome.text);
			return;
	}
}

export async function openTsConfigLink(
	{ resourceUri, pathValue, linkKind }: OpenTsConfigLinkCommandArgs,
	descriptors: TsConfigLinkDescriptors,
	statTarget: TsConfigLinkStat = tryStat,
	presentOutcome: TsConfigLinkOutcomeHandler = presentTsConfigLinkOutcome,
	insideWorkspace: TsConfigLinkWorkspaceTest = isInsideWorkspace,
): Promise<void> {
	const descriptor = descriptors[linkKind];
	const target = await descriptor.resolve(vscode.Uri.from(resourceUri), pathValue);

	if (!target) {
		await presentOutcome({ kind: 'message', text: descriptor.unresolvedMessage(pathValue) });
		return;
	}

	const stat = await statTarget(target);

	if (stat && (stat.type & vscode.FileType.Directory)) {
		await presentOutcome({ kind: insideWorkspace(target) ? 'reveal' : 'revealOutsideWorkspace', target });
		return;
	}

	if (!stat) {
		switch (descriptor.missingTarget) {
			case TsConfigMissingTargetPolicy.OfferToCreate:
				break;
			case TsConfigMissingTargetPolicy.ReportUnbuilt:
				await presentOutcome({ kind: 'message', text: vscode.l10n.t("{0} does not exist yet. Build the project to create it.", pathValue) });
				return;
			case TsConfigMissingTargetPolicy.ReportMissing:
				await presentOutcome({ kind: 'message', text: vscode.l10n.t("{0} does not exist.", pathValue) });
				return;
		}
	}

	await presentOutcome({ kind: 'open', target });
}

function getDocumentSelector(): vscode.DocumentSelector {
	const patterns: vscode.GlobPattern[] = [
		'**/[jt]sconfig.json',
		'**/[jt]sconfig.*.json',
	];

	const languages = ['json', 'jsonc'];

	return languages.map(language => patterns.map((pattern): vscode.DocumentFilter => ({ language, pattern })))
		.flat();
}

export function register(versionProvider: ITypeScriptVersionProvider, workspaceState: vscode.Memento, readLibMap: TsLibMapReader) {
	const descriptors = createLinkDescriptors(versionProvider, workspaceState, readLibMap);

	return vscode.Disposable.from(
		vscode.commands.registerCommand(openTsConfigLinkCommandId, (args: OpenTsConfigLinkCommandArgs) => openTsConfigLink(args, descriptors)),
		vscode.languages.registerDocumentLinkProvider(getDocumentSelector(), new TsconfigLinkProvider()),
	);
}
