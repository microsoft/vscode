/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { NotebookDataDto } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { NotebookDto } from 'vs/workbench/api/common/mainThreadNotebookDto';
import { NotebookData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';

interface INotebookDataEditInfo {
	notebookData: NotebookData;
	mTime: number;
}

export class NotebookDataCache {
	private _entries: ResourceMap<INotebookDataEditInfo>;

	constructor(
		private _extHostFileSystem: IExtHostConsumerFileSystem,
	) {
		this._entries = new ResourceMap<INotebookDataEditInfo>();
	}

	async getNotebookData(notebookUri: URI, dataToNotebook: (data: VSBuffer) => Promise<SerializableObjectWithBuffers<NotebookDataDto>>): Promise<NotebookData> {
		const mTime = (await this._extHostFileSystem.value.stat(notebookUri)).mtime;

		const entry = this._entries.get(notebookUri);

		if (entry && entry.mTime === mTime) {
			return entry.notebookData;
		} else {

			let _data: NotebookData = {
				metadata: {},
				cells: []
			};

			const content = await this._extHostFileSystem.value.readFile(notebookUri);
			const bytes: VSBuffer = VSBuffer.fromString(content.toString());
			// const serializer = await this.getSerializer(notebookUri);
			// if (!serializer) {
			// 	//unsupported
			// 	throw new Error(`serializer not initialized`);
			// }
			_data = NotebookDto.fromNotebookDataDto((await dataToNotebook(bytes)).value);
			this._entries.set(notebookUri, { notebookData: _data, mTime });
			return _data;
		}
	}

}
