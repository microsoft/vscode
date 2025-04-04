/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IDraggedResourceEditorInput, MarkerTransferData, DocumentSymbolTransferData } from '../../../../platform/dnd/browser/dnd.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { isUntitledResourceEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { IChatRequestVariableEntry, IDiagnosticVariableEntry, IDiagnosticVariableEntryFilterData, ISymbolVariableEntry } from '../common/chatModel.js';
import { imageToHash } from './chatPasteProviders.js';
import { resizeImage } from './imageUtils.js';

// --- EDITORS ---

export async function resolveEditorAttachContext(editor: EditorInput | IDraggedResourceEditorInput, fileService: IFileService, editorService: IEditorService, textModelService: ITextModelService, extensionService: IExtensionService, dialogService: IDialogService): Promise<IChatRequestVariableEntry | undefined> {
	// untitled editor
	if (isUntitledResourceEditorInput(editor)) {
		return await resolveUntitledEditorAttachContext(editor, editorService, textModelService);
	}

	if (!editor.resource) {
		return undefined;
	}

	let stat;
	try {
		stat = await fileService.stat(editor.resource);
	} catch {
		return undefined;
	}

	if (!stat.isDirectory && !stat.isFile) {
		return undefined;
	}

	const imageContext = await resolveImageEditorAttachContext(editor, fileService, dialogService);
	if (imageContext) {
		return extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData')) ? imageContext : undefined;
	}

	return await resolveResourceAttachContext(editor.resource, stat.isDirectory, textModelService);
}

async function resolveUntitledEditorAttachContext(editor: IDraggedResourceEditorInput, editorService: IEditorService, textModelService: ITextModelService): Promise<IChatRequestVariableEntry | undefined> {
	// If the resource is known, we can use it directly
	if (editor.resource) {
		return await resolveResourceAttachContext(editor.resource, false, textModelService);
	}

	// Otherwise, we need to check if the contents are already open in another editor
	const openUntitledEditors = editorService.editors.filter(editor => editor instanceof UntitledTextEditorInput) as UntitledTextEditorInput[];
	for (const canidate of openUntitledEditors) {
		const model = await canidate.resolve();
		const contents = model.textEditorModel?.getValue();
		if (contents === editor.contents) {
			return await resolveResourceAttachContext(canidate.resource, false, textModelService);
		}
	}

	return undefined;
}

export async function resolveResourceAttachContext(resource: URI, isDirectory: boolean, textModelService: ITextModelService): Promise<IChatRequestVariableEntry | undefined> {
	let isOmitted = false;

	if (!isDirectory) {
		try {
			const createdModel = await textModelService.createModelReference(resource);
			createdModel.dispose();
		} catch {
			isOmitted = true;
		}

		if (/\.(svg)$/i.test(resource.path)) {
			isOmitted = true;
		}
	}

	return {
		value: resource,
		id: resource.toString(),
		name: basename(resource),
		isFile: !isDirectory,
		isDirectory,
		isOmitted
	};
}

// --- IMAGES ---

export type ImageTransferData = {
	data: Uint8Array;
	name: string;
	icon?: ThemeIcon;
	resource?: URI;
	id?: string;
};
const SUPPORTED_IMAGE_EXTENSIONS_REGEX = /\.(png|jpg|jpeg|gif|webp)$/i;

export async function resolveImageEditorAttachContext(editor: EditorInput | IDraggedResourceEditorInput, fileService: IFileService, dialogService: IDialogService): Promise<IChatRequestVariableEntry | undefined> {
	if (!editor.resource) {
		return undefined;
	}

	if (!SUPPORTED_IMAGE_EXTENSIONS_REGEX.test(editor.resource.path)) {
		return undefined;
	}

	const fileName = basename(editor.resource);
	const readFile = await fileService.readFile(editor.resource);
	if (readFile.size > 30 * 1024 * 1024) { // 30 MB
		dialogService.error(localize('imageTooLarge', 'Image is too large'), localize('imageTooLargeMessage', 'The image {0} is too large to be attached.', fileName));
		throw new Error('Image is too large');
	}

	const imageFileContext = await resolveImageAttachContext([{
		id: editor.resource.toString(),
		name: fileName,
		data: readFile.value.buffer,
		icon: Codicon.fileMedia,
		resource: editor.resource,
	}]);

	return imageFileContext[0];
}

export async function resolveImageAttachContext(images: ImageTransferData[]): Promise<IChatRequestVariableEntry[]> {
	return Promise.all(images.map(async image => ({
		id: image.id || await imageToHash(image.data),
		name: image.name,
		fullName: image.resource ? image.resource.path : undefined,
		value: await resizeImage(image.data),
		icon: image.icon,
		isImage: true,
		isFile: false,
		isDirectory: false,
		references: image.resource ? [{ reference: image.resource, kind: 'reference' }] : []
	})));
}

// --- MARKERS ---

export function resolveMarkerAttachContext(markers: MarkerTransferData[]): IDiagnosticVariableEntry[] {
	return markers.map((marker): IDiagnosticVariableEntry => {
		let filter: IDiagnosticVariableEntryFilterData;
		if (!('severity' in marker)) {
			filter = { filterUri: URI.revive(marker.uri), filterSeverity: MarkerSeverity.Warning };
		} else {
			filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
		}

		return IDiagnosticVariableEntryFilterData.toEntry(filter);
	});
}

// --- SYMBOLS ---

export function resolveSymbolsAttachContext(symbols: DocumentSymbolTransferData[]): ISymbolVariableEntry[] {
	return symbols.map(symbol => {
		const resource = URI.file(symbol.fsPath);
		return {
			kind: 'symbol',
			id: symbolId(resource, symbol.range),
			value: { uri: resource, range: symbol.range },
			symbolKind: symbol.kind,
			fullName: `$(${SymbolKinds.toIcon(symbol.kind).id}) ${symbol.name}`,
			name: symbol.name,
		};
	});
}

function symbolId(resource: URI, range?: IRange): string {
	let rangePart = '';
	if (range) {
		rangePart = `:${range.startLineNumber}`;
		if (range.startLineNumber !== range.endLineNumber) {
			rangePart += `-${range.endLineNumber}`;
		}
	}
	return resource.fsPath + rangePart;
}
