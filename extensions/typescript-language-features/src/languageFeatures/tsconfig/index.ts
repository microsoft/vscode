/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import * as vscode from 'vscode';
import { ITypeScriptVersionProvider } from '../../tsServer/versionProvider';
import { Lazy } from '../../utils/lazy';
import { collectLinkCandidates, TsConfigLinkKind } from './links';
import { createResolvers, TsConfigLinkResolvers } from './resolvers';

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
		const root = jsonc.parseTree(document.getText());

		if (!root) {
			return [];
		}

		return collectLinkCandidates(root).map(candidate => {
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

/**
 * Only the kinds that go through module resolution or a TypeScript install can
 * fail to produce a target at all; the remaining kinds always yield a URI,
 * whether or not anything lives there.
 *
 * The switch is deliberately exhaustive: a new kind stops compiling here until
 * it states its own wording, rather than inheriting the module phrasing.
 */
function getResolveErrorMessage(linkKind: TsConfigLinkKind, pathValue: string): string {
	switch (linkKind) {
		case TsConfigLinkKind.Extends:
		case TsConfigLinkKind.Reference:
			return vscode.l10n.t("Failed to resolve {0} as module", pathValue);
		case TsConfigLinkKind.Lib:
			return vscode.l10n.t("Failed to resolve TypeScript lib {0}", pathValue);
		case TsConfigLinkKind.TypePackage:
			return vscode.l10n.t("Failed to resolve types package {0}", pathValue);
		case TsConfigLinkKind.ProjectFile:
		case TsConfigLinkKind.Path:
		case TsConfigLinkKind.BuildOutput:
			return vscode.l10n.t("Failed to resolve {0}", pathValue);
	}
}

/** Stats a link's target. Injectable so tests can simulate a file, a directory, or nothing at all. */
export type TsConfigLinkStat = (target: vscode.Uri) => Promise<vscode.FileStat | undefined>;

async function statTsConfigLinkTarget(target: vscode.Uri): Promise<vscode.FileStat | undefined> {
	try {
		return await vscode.workspace.fs.stat(target);
	} catch {
		return undefined;
	}
}

/**
 * What `openTsConfigLink` decided to do once it knew how (or whether) a link resolves.
 * A plain description of the outcome, rather than the VS Code call that carries it out, so tests
 * can assert on what happened without caring how it was presented.
 */
export type TsConfigLinkOutcome =
	| { readonly kind: 'reveal'; readonly target: vscode.Uri }
	| { readonly kind: 'open'; readonly target: vscode.Uri }
	| { readonly kind: 'message'; readonly text: string };

/** Carries out an outcome. Injectable so tests can record it instead of touching the real UI. */
export type TsConfigLinkOutcomeHandler = (outcome: TsConfigLinkOutcome) => Promise<void>;

async function presentTsConfigLinkOutcome(outcome: TsConfigLinkOutcome): Promise<void> {
	switch (outcome.kind) {
		case 'reveal':
			await vscode.commands.executeCommand('revealInExplorer', outcome.target);
			return;
		case 'open':
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
	resolvers: TsConfigLinkResolvers,
	statTarget: TsConfigLinkStat = statTsConfigLinkTarget,
	presentOutcome: TsConfigLinkOutcomeHandler = presentTsConfigLinkOutcome,
): Promise<void> {
	const target = await resolvers[linkKind](vscode.Uri.from(resourceUri), pathValue);

	if (!target) {
		await presentOutcome({ kind: 'message', text: getResolveErrorMessage(linkKind, pathValue) });
		return;
	}

	const stat = await statTarget(target);

	if (stat && (stat.type & vscode.FileType.Directory)) {
		await presentOutcome({ kind: 'reveal', target });
		return;
	}

	if (!stat) {
		// Opening a missing file is how VS Code offers to create it, which is the right
		// affordance for the kinds that name a file and wrong for the kinds that name a
		// directory: a missing `"rootDir": "./src"` should not offer to create a file named `src`.
		switch (linkKind) {
			case TsConfigLinkKind.Extends:
			case TsConfigLinkKind.Reference:
			case TsConfigLinkKind.ProjectFile:
				break;
			case TsConfigLinkKind.BuildOutput:
				await presentOutcome({ kind: 'message', text: vscode.l10n.t("{0} does not exist yet. Build the project to create it.", pathValue) });
				return;
			default:
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

/**
 * @param versionProvider Resolved the first time a `lib` link is followed, so that whatever
 * configuring it costs is never paid during activation, nor at all by a user who never follows one.
 */
export function register(versionProvider: Lazy<ITypeScriptVersionProvider>, workspaceState: vscode.Memento) {
	const resolvers = createResolvers(versionProvider, workspaceState);

	return vscode.Disposable.from(
		vscode.commands.registerCommand(openTsConfigLinkCommandId, (args: OpenTsConfigLinkCommandArgs) => openTsConfigLink(args, resolvers)),
		vscode.languages.registerDocumentLinkProvider(getDocumentSelector(), new TsconfigLinkProvider()),
	);
}
