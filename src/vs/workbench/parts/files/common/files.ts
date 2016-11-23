/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IEditorOptions } from 'vs/editor/common/editorCommon';
import { EncodingMode, EditorInput, IFileEditorInput, IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { FileStat } from 'vs/workbench/parts/files/common/explorerViewModel';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetry';

/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';

export const ExplorerViewletVisible = new RawContextKey<boolean>('explorerViewletVisible', true);

/**
 * File editor input id.
 */
export const FILE_EDITOR_INPUT_ID = 'workbench.editors.files.fileEditorInput';

/**
 * Text file editor id.
 */
export const TEXT_FILE_EDITOR_ID = 'workbench.editors.files.textFileEditor';

/**
 * Binary file editor id.
 */
export const BINARY_FILE_EDITOR_ID = 'workbench.editors.files.binaryFileEditor';

/**
 * API class to denote file editor inputs. Internal implementation is provided.
 *
 * Note: This class is not intended to be instantiated.
 */
export abstract class FileEditorInput extends EditorInput implements IFileEditorInput {

	public abstract setResource(resource: URI): void;

	public abstract getResource(): URI;

	public abstract setPreferredEncoding(encoding: string): void;

	public abstract setEncoding(encoding: string, mode: EncodingMode): void;

	public abstract getEncoding(): string;

	public getTelemetryDescriptor(): { [key: string]: any; } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.getResource());
		return descriptor;
	}
}

export interface IFilesConfiguration extends IFilesConfiguration, IWorkbenchEditorConfiguration {
	explorer: {
		openEditors: {
			visible: number;
			dynamicHeight: boolean;
		};
		autoReveal: boolean;
		enableDragAndDrop: boolean;
	};
	editor: IEditorOptions;
}

export interface IFileResource {
	resource: URI;
	isDirectory: boolean;
}

/**
 * Helper to get a file resource from an object.
 */
export function asFileResource(obj: any): IFileResource {
	if (obj instanceof FileStat) {
		const stat = <FileStat>obj;

		return {
			resource: stat.resource,
			isDirectory: stat.isDirectory
		};
	}

	return null;
}