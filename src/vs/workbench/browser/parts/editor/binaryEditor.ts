/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ByteSize } from 'vs/platform/files/common/files';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { EditorPlaceholder, IEditorPlaceholderContents } from 'vs/workbench/browser/parts/editor/editorPlaceholder';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

export interface IOpenCallbacks {
	openInternal: (input: EditorInput, options: IEditorOptions | undefined) => Promise<void>;
}

/*
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseBinaryResourceEditor extends EditorPlaceholder {

	private readonly _onDidChangeMetadata = this._register(new Emitter<void>());
	readonly onDidChangeMetadata = this._onDidChangeMetadata.event;

	private readonly _onDidOpenInPlace = this._register(new Emitter<void>());
	readonly onDidOpenInPlace = this._onDidOpenInPlace.event;

	private metadata: string | undefined;

	constructor(
		id: string,
		group: IEditorGroup,
		private readonly callbacks: IOpenCallbacks,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(id, group, telemetryService, themeService, storageService);
	}

	override getTitle(): string {
		return this.input ? this.input.getName() : localize('binaryEditor', "Binary Viewer");
	}

	protected async getContents(input: EditorInput, options: IEditorOptions): Promise<IEditorPlaceholderContents> {
		const model = await input.resolve();

		// Assert Model instance
		if (!(model instanceof BinaryEditorModel)) {
			throw new Error('Unable to open file as binary');
		}

		// Update metadata
		const size = model.getSize();
		this.handleMetadataChanged(typeof size === 'number' ? ByteSize.formatSize(size) : '');

		return {
			icon: '$(warning)',
			label: localize('binaryError', "The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding."),
			actions: [
				{
					label: localize('openAnyway', "Open Anyway"),
					run: async () => {

						// Open in place
						await this.callbacks.openInternal(input, options);

						// Signal to listeners that the binary editor has been opened in-place
						this._onDidOpenInPlace.fire();
					}
				}
			]
		};
	}

	private handleMetadataChanged(meta: string | undefined): void {
		this.metadata = meta;

		this._onDidChangeMetadata.fire();
	}

	getMetadata(): string | undefined {
		return this.metadata;
	}
}
