/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as URI from 'vscode-uri';
import { Slugifier } from '../slugify';
import { Disposable } from '../util/dispose';
import { resolveDocumentLink } from '../util/openDocumentLink';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';
import { InternalHref } from './documentLinks';
import { MdHeaderReference, MdLinkReference, MdReference, MdReferencesProvider, tryResolveLinkPath } from './references';

const localize = nls.loadMessageBundle();


export interface MdReferencesResponse {
	references: MdReference[];
	triggerRef: MdReference;
}

interface MdFileRenameEdit {
	readonly from: vscode.Uri;
	readonly to: vscode.Uri;
}

/**
 * Type with additional metadata about the edits for testing
 *
 * This is needed since `vscode.WorkspaceEdit` does not expose info on file renames.
 */
export interface MdWorkspaceEdit {
	readonly edit: vscode.WorkspaceEdit;

	readonly fileRenames?: ReadonlyArray<MdFileRenameEdit>;
}

function tryDecodeUri(str: string): string {
	try {
		return decodeURI(str);
	} catch {
		return str;
	}
}

export class MdVsCodeRenameProvider extends Disposable implements vscode.RenameProvider {

	private cachedRefs?: {
		readonly resource: vscode.Uri;
		readonly version: number;
		readonly position: vscode.Position;
		readonly triggerRef: MdReference;
		readonly references: MdReference[];
	} | undefined;

	private readonly renameNotSupportedText = localize('invalidRenameLocation', "Rename not supported at location");

	public constructor(
		private readonly workspaceContents: MdWorkspaceContents,
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
			throw new Error(this.renameNotSupportedText);
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

				// See if we are renaming the fragment or the path
				const { fragmentRange } = triggerRef.link.source;
				if (fragmentRange?.contains(position)) {
					const declaration = this.findHeaderDeclaration(allRefsInfo.references);
					if (declaration) {
						return { range: fragmentRange, placeholder: declaration.headerText };
					}
					return { range: fragmentRange, placeholder: document.getText(fragmentRange) };
				}

				const range = this.getFilePathRange(triggerRef);
				if (!range) {
					throw new Error(this.renameNotSupportedText);
				}
				return { range, placeholder: tryDecodeUri(document.getText(range)) };
			}
		}
	}

	private getFilePathRange(ref: MdLinkReference): vscode.Range {
		if (ref.link.source.fragmentRange) {
			return ref.link.source.hrefRange.with(undefined, ref.link.source.fragmentRange.start.translate(0, -1));
		}
		return ref.link.source.hrefRange;
	}

	private findHeaderDeclaration(references: readonly MdReference[]): MdHeaderReference | undefined {
		return references.find(ref => ref.isDefinition && ref.kind === 'header') as MdHeaderReference | undefined;
	}

	public async provideRenameEdits(document: SkinnyTextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit | undefined> {
		return (await this.provideRenameEditsImpl(document, position, newName, token))?.edit;
	}

	public async provideRenameEditsImpl(document: SkinnyTextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Promise<MdWorkspaceEdit | undefined> {
		const allRefsInfo = await this.getAllReferences(document, position, token);
		if (token.isCancellationRequested || !allRefsInfo || !allRefsInfo.references.length) {
			return undefined;
		}

		const triggerRef = allRefsInfo.triggerRef;

		if (triggerRef.kind === 'link' && (
			(triggerRef.link.kind === 'definition' && triggerRef.link.ref.range.contains(position)) || triggerRef.link.href.kind === 'reference'
		)) {
			return this.renameReferenceLinks(allRefsInfo, newName);
		} else if (triggerRef.kind === 'link' && triggerRef.link.href.kind === 'external') {
			return this.renameExternalLink(allRefsInfo, newName);
		} else if (triggerRef.kind === 'header' || (triggerRef.kind === 'link' && triggerRef.link.source.fragmentRange?.contains(position) && (triggerRef.link.kind === 'definition' || triggerRef.link.kind === 'link' && triggerRef.link.href.kind === 'internal'))) {
			return this.renameFragment(allRefsInfo, newName);
		} else if (triggerRef.kind === 'link' && !triggerRef.link.source.fragmentRange?.contains(position) && (triggerRef.link.kind === 'link' || triggerRef.link.kind === 'definition') && triggerRef.link.href.kind === 'internal') {
			return this.renameFilePath(triggerRef.link.source.resource, triggerRef.link.href, allRefsInfo, newName);
		}

		return undefined;
	}

	private async renameFilePath(triggerDocument: vscode.Uri, triggerHref: InternalHref, allRefsInfo: MdReferencesResponse, newName: string): Promise<MdWorkspaceEdit> {
		const edit = new vscode.WorkspaceEdit();
		const fileRenames: MdFileRenameEdit[] = [];

		const targetUri = await tryResolveLinkPath(triggerHref.path, this.workspaceContents) ?? triggerHref.path;

		const rawNewFilePath = resolveDocumentLink(newName, triggerDocument);
		let resolvedNewFilePath = rawNewFilePath;
		if (!URI.Utils.extname(resolvedNewFilePath)) {
			// If the newly entered path doesn't have a file extension but the original file did
			// tack on a .md file extension
			if (URI.Utils.extname(targetUri)) {
				resolvedNewFilePath = resolvedNewFilePath.with({
					path: resolvedNewFilePath.path + '.md'
				});
			}
		}

		// First rename the file
		if (await this.workspaceContents.pathExists(targetUri)) {
			fileRenames.push({ from: targetUri, to: resolvedNewFilePath });
			edit.renameFile(targetUri, resolvedNewFilePath);
		}

		// Then update all refs to it
		for (const ref of allRefsInfo.references) {
			if (ref.kind === 'link') {
				// Try to preserve style of existing links
				let newPath: string;
				if (ref.link.source.text.startsWith('/')) {
					const root = resolveDocumentLink('/', ref.link.source.resource);
					newPath = '/' + path.relative(root.toString(true), rawNewFilePath.toString(true));
				} else {
					const rootDir = URI.Utils.dirname(ref.link.source.resource);
					if (rootDir.scheme === rawNewFilePath.scheme && rootDir.scheme !== 'untitled') {
						newPath = path.relative(rootDir.toString(true), rawNewFilePath.toString(true));
						if (newName.startsWith('./') && !newPath.startsWith('../') || newName.startsWith('.\\') && !newPath.startsWith('..\\')) {
							newPath = './' + newPath;
						}
					} else {
						newPath = newName;
					}
				}
				edit.replace(ref.link.source.resource, this.getFilePathRange(ref), encodeURI(newPath.replace(/\\/g, '/')));
			}
		}

		return { edit, fileRenames };
	}

	private renameFragment(allRefsInfo: MdReferencesResponse, newName: string): MdWorkspaceEdit {
		const slug = this.slugifier.fromHeading(newName).value;

		const edit = new vscode.WorkspaceEdit();
		for (const ref of allRefsInfo.references) {
			switch (ref.kind) {
				case 'header':
					edit.replace(ref.location.uri, ref.headerTextLocation.range, newName);
					break;

				case 'link':
					edit.replace(ref.link.source.resource, ref.link.source.fragmentRange ?? ref.location.range, !ref.link.source.fragmentRange || ref.link.href.kind === 'external' ? newName : slug);
					break;
			}
		}
		return { edit };
	}

	private renameExternalLink(allRefsInfo: MdReferencesResponse, newName: string): MdWorkspaceEdit {
		const edit = new vscode.WorkspaceEdit();
		for (const ref of allRefsInfo.references) {
			if (ref.kind === 'link') {
				edit.replace(ref.link.source.resource, ref.location.range, newName);
			}
		}
		return { edit };
	}

	private renameReferenceLinks(allRefsInfo: MdReferencesResponse, newName: string): MdWorkspaceEdit {
		const edit = new vscode.WorkspaceEdit();
		for (const ref of allRefsInfo.references) {
			if (ref.kind === 'link') {
				if (ref.link.kind === 'definition') {
					edit.replace(ref.link.source.resource, ref.link.ref.range, newName);
				} else {
					edit.replace(ref.link.source.resource, ref.link.source.fragmentRange ?? ref.location.range, newName);
				}
			}
		}
		return { edit };
	}

	private async getAllReferences(document: SkinnyTextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<MdReferencesResponse | undefined> {
		const version = document.version;

		if (this.cachedRefs
			&& this.cachedRefs.resource.fsPath === document.uri.fsPath
			&& this.cachedRefs.version === document.version
			&& this.cachedRefs.position.isEqual(position)
		) {
			return this.cachedRefs;
		}

		const references = await this.referencesProvider.getReferencesAtPosition(document, position, token);
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


export function registerRenameSupport(
	selector: vscode.DocumentSelector,
	workspaceContents: MdWorkspaceContents,
	referencesProvider: MdReferencesProvider,
	slugifier: Slugifier,
): vscode.Disposable {
	return vscode.languages.registerRenameProvider(selector, new MdVsCodeRenameProvider(workspaceContents, referencesProvider, slugifier));
}
