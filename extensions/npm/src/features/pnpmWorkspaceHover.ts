/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, DocumentSelector, Hover, HoverProvider, languages, Position, Range, TextDocument } from 'vscode';
import { XHRRequest } from 'request-light';
import { NpmPackageInfoProvider } from './packageInfo';
import { getPnpmWorkspacePackageEntry } from './pnpmWorkspace';

const PNPM_WORKSPACE_SELECTOR: DocumentSelector = [{ language: 'yaml', scheme: '*', pattern: '**/pnpm-workspace.yaml' }];

export function addPnpmWorkspaceHoverProvider(xhr: XHRRequest, npmCommandPath: string | undefined): Disposable {
	return languages.registerHoverProvider(PNPM_WORKSPACE_SELECTOR, new PnpmWorkspaceHoverProvider(new NpmPackageInfoProvider(xhr, npmCommandPath)));
}

class PnpmWorkspaceHoverProvider implements HoverProvider {

	public constructor(private readonly packageInfoProvider: NpmPackageInfoProvider) {
	}

	public provideHover(document: TextDocument, position: Position, token: CancellationToken): Thenable<Hover | null> | null {
		if (token.isCancellationRequested) {
			return null;
		}

		if (!this.packageInfoProvider.isEnabled()) {
			return null;
		}

		const packageEntry = getPnpmWorkspacePackageEntry(document, position);
		if (!packageEntry) {
			return null;
		}

		if (token.isCancellationRequested) {
			return null;
		}

		return this.packageInfoProvider.fetchPackageInfo(packageEntry.packageName, document.uri).then(info => {
			if (token.isCancellationRequested) {
				return null;
			}

			if (!info) {
				return null;
			}

			return new Hover(
				this.packageInfoProvider.getDocumentation(info.description, info.version, info.time, info.homepage),
				new Range(packageEntry.range.line, packageEntry.range.startCharacter, packageEntry.range.line, packageEntry.range.endCharacter)
			);
		});
	}
}
