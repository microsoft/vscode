/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DefaultEndOfLine } from '../../../../../editor/common/model.js';
import { AgentHostFileSystemProvider, agentHostUri, type IRemoteFilesystemConnection } from '../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentHostResourceReadRange } from '../../../../../platform/agentHost/common/meta/agentHostResourceReadRangeMeta.js';
import { ContentEncoding, ResourceType, type InitializeResult, type ResourceListResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestBrowserTextFileServiceWithEncodingOverrides, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TextFileOperationError, TextFileOperationResult, type ITextFileService } from '../../../textfile/common/textfiles.js';
import type { TextFileEditorModelManager } from '../../../textfile/common/textFileEditorModelManager.js';
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../../workingCopy/common/workingCopyFileService.js';
import { WorkingCopyService } from '../../../workingCopy/common/workingCopyService.js';

suite('Agent host files read through the text file service', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const FIRST = AgentHostFileSystemProvider.FIRST_READ_BYTES;

	/**
	 * A host that reads ranges and answers `resourceResolve` (the file service's stat) only after it has answered the
	 * first read, as when the metadata reply arrives last.
	 */
	class LateMetadataConnection implements IRemoteFilesystemConnection {
		readonly reads: (IAgentHostResourceReadRange | 'whole')[] = [];
		readonly initializeResult = constObservable<InitializeResult | undefined>({ protocolVersion: '1.0.0', serverSeq: 0, snapshots: [], _meta: { 'vscode.resourceReadRanges': true } });
		private readonly _firstRead = new DeferredPromise<void>();

		constructor(private readonly _content: VSBuffer) { }

		async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
			await this._firstRead.p;
			await timeout(20);
			return { uri: params.uri, type: ResourceType.File, size: this._content.byteLength };
		}

		async resourceRead(_uri: URI, _encoding?: ContentEncoding, range?: IAgentHostResourceReadRange): Promise<ResourceReadResult> {
			this.reads.push(range ? { ...range } : 'whole');
			const start = Math.min(range?.position ?? 0, this._content.byteLength);
			const end = range?.length === undefined ? this._content.byteLength : Math.min(start + range.length, this._content.byteLength);
			const result = { data: encodeBase64(this._content.slice(start, end)), encoding: ContentEncoding.Base64 };
			if (!this._firstRead.isSettled) {
				this._firstRead.complete();
			}
			return result;
		}

		async resourceList(): Promise<ResourceListResult> { return { entries: [] }; }
		async resourceWrite(): Promise<{}> { return {}; }
		async resourceCopy(): Promise<{}> { return {}; }
		async resourceDelete(): Promise<{}> { return {}; }
		async resourceMove(): Promise<{}> { return {}; }
		async resourceMkdir(): Promise<{}> { return {}; }
	}

	function createTextFileService(connection: IRemoteFilesystemConnection): ITextFileService {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new AgentHostFileSystemProvider());
		disposables.add(provider.registerAuthority('host', connection));
		disposables.add(fileService.registerProvider(AGENT_HOST_SCHEME, provider));

		const collection = new ServiceCollection();
		collection.set(IFileService, fileService);
		collection.set(IWorkingCopyFileService, disposables.add(new WorkingCopyFileService(fileService, disposables.add(new WorkingCopyService()), instantiationService, disposables.add(new UriIdentityService(fileService)))));
		const textFileService = disposables.add(disposables.add(instantiationService.createChild(collection)).createInstance(TestBrowserTextFileServiceWithEncodingOverrides));
		disposables.add(<TextFileEditorModelManager>textFileService.files);
		return textFileService;
	}

	test('a binary file is never read past its first bytes, even when its metadata arrives after them', async () => {
		const connection = new LateMetadataConnection(VSBuffer.alloc(1024 * 1024));
		const textFileService = createTextFileService(connection);

		const result = await textFileService.readStream(agentHostUri('host', '/workspace/firmware.bin'), { acceptTextOnly: true })
			.then(() => 'read as text', (error: TextFileOperationError) => error.textFileOperationResult);
		// A request for the rest of the file would follow the first read within this time.
		await timeout(50);

		assert.deepStrictEqual({ result, reads: connection.reads }, {
			result: TextFileOperationResult.FILE_IS_BINARY,
			reads: [{ position: 0, length: FIRST }],
		});
	});

	test('a text file is read whole, in the first bytes and the rest, when its metadata arrives after the first bytes', async () => {
		const text = 'agent host text\n'.repeat(8 * 1024);
		const connection = new LateMetadataConnection(VSBuffer.fromString(text));
		const textFileService = createTextFileService(connection);

		const content = await textFileService.readStream(agentHostUri('host', '/workspace/big.ts'), { acceptTextOnly: true });
		const { textBuffer, disposable } = content.value.create(DefaultEndOfLine.LF);
		const read = textBuffer.getLinesContent().join('\n');
		disposable.dispose();

		assert.deepStrictEqual({ matches: read === text, reads: connection.reads }, {
			matches: true,
			reads: [{ position: 0, length: FIRST }, { position: FIRST }],
		});
	});
});
