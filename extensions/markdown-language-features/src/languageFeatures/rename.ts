/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Slugifier } from '../slugify';
import { Disposable } from '../util/dispose';
import { SkinnyTextDocument } from '../workspaceContents';
import { MdHeaderReference, MdReference, MdReferencesProvider } from './references';

const localize = nls.loadMessageBundle();


export class MdRenameProvider extends Disposable implements vscode.RenameProvider {

	private cachedRefs?: {
		readonly resource: vscode.Uri;
		readonly version: number;
		readonly position: vscode.Position;
		readonly triggerRef: MdReference;
		readonly references: MdReference[];
	} | undefined;

	public constructor(
		private readonly referencesProvider: MdReferencesProvider,
		private readonly slugifier: Slugifier,
	) {
		super();
	}

	public async prepareRename(document: SkinnyTextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<undefined | { readonly range: vscode.Range; readonly placeholder: string }> {
		const allRefsInfo = await this.getAllReferences(document, position, token);
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (!allRefsInfo || !allRefsInfo.references.length) {
			throw new Error(localize('invalidRenameLocation', "Rename not supported at location"));
		}

		const triggerRef = allRefsInfo.triggerRef;
		switch (triggerRef.kind) {
			case 'header': {
				return { range: triggerRef.headerTextLocation.range, placeholder: triggerRef.headerText };
			}
			case 'link': {
				if (triggerRef.link.kind === 'definition') {
					// We may have been triggered on the ref or the definition itself
					if (triggerRef.link.ref.range.contains(position)) {
						return { range: triggerRef.link.ref.range, placeholder: triggerRef.link.ref.text };
					}
				}

				if (triggerRef.link.href.kind === 'external') {
					return { range: triggerRef.link.source.hrefRange, placeholder: document.getText(triggerRef.link.source.hrefRange) };
				}

				const { fragmentRange } = triggerRef.link.source;
				if (fragmentRange) {
					const declaration = this.findHeaderDeclaration(allRefsInfo.references);
					if (declaration) {
						return { range: fragmentRange, placeholder: declaration.headerText };
					}
					return { range: fragmentRange, placeholder: document.getText(fragmentRange) };
				}

				throw new Error(localize('renameNoFiles', "Renaming files is currently not supported"));
			}
		}
	}

	private findHeaderDeclaration(references: readonly MdReference[]): MdHeaderReference | undefined {
		return references.find(ref => ref.isDefinition && ref.kind === 'header') as MdHeaderReference | undefined;
	}

	public async provideRenameEdits(document: SkinnyTextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit | undefined> {
		const allRefsInfo = await this.getAllReferences(document, position, token);
		if (token.isCancellationRequested || !allRefsInfo || !allRefsInfo.references.length) {
			return undefined;
		}

		const triggerRef = allRefsInfo.triggerRef;

		const isRefRename = triggerRef.kind === 'link' && (
			(triggerRef.link.kind === 'definition' && triggerRef.link.ref.range.contains(position)) || triggerRef.link.href.kind === 'reference'
		);
		const slug = this.slugifier.fromHeading(newName).value;

		const edit = new vscode.WorkspaceEdit();
		for (const ref of allRefsInfo.references) {
			switch (ref.kind) {
				case 'header':
					edit.replace(ref.location.uri, ref.headerTextLocation.range, newName);
					break;

				case 'link':
					if (ref.link.kind === 'definition') {
						// We may be renaming either the reference or the definition itself
						if (isRefRename) {
							edit.replace(ref.link.source.resource, ref.link.ref.range, newName);
							continue;
						}
					}
					edit.replace(ref.link.source.resource, ref.link.source.fragmentRange ?? ref.location.range, isRefRename && !ref.link.source.fragmentRange || ref.link.href.kind === 'external' ? newName : slug);
					break;
			}
		}

		return edit;
	}

	private async getAllReferences(document: SkinnyTextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<{ references: MdReference[]; triggerRef: MdReference } | undefined> {
		const version = document.version;

		if (this.cachedRefs
			&& this.cachedRefs.resource.fsPath === document.uri.fsPath
			&& this.cachedRefs.version === document.version
			&& this.cachedRefs.position.isEqual(position)
		) {
			return this.cachedRefs;
		}

		const references = await this.referencesProvider.getAllReferencesAtPosition(document, position, token);
		const triggerRef = references.find(ref => ref.isTriggerLocation);
		if (!triggerRef) {
			return undefined;
		}

		this.cachedRefs = {
			resource: document.uri,
			version,
			position,
			references,
			triggerRef
		};
		return this.cachedRefs;
	}
}
