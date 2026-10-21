/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { _util } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService, NoOpNotification } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IssueReporterEditorInput } from '../../browser/issueReporterEditorInput.js';
import { getIssueReporterMediaFormat, IIssueReporterVideoMetadata, MAX_ISSUE_IMAGE_BYTES, MAX_ISSUE_VIDEO_BYTES, readIssueReporterVideo } from '../../browser/issueReporterMedia.js';
import { IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { IRecordingData, IRecordingService, RecordingState, ScreenCapturePermissionStatus } from '../../browser/recordingService.js';
import { IScreenshotService } from '../../browser/screenshotService.js';
import { IIssueFormService, IssueReporterData, IssueSource, IssueType } from '../../common/issue.js';
import { IssueReporterEditorPane } from '../../electron-browser/issueReporterEditorPane.js';
import { issueReporterImageFixture, issueReporterVideoFixtures } from '../common/issueReporterMediaFixtures.js';

interface INativeResourceAccess {
	status: number;
	path: string | undefined;
	errors: string[];
}

class MediaFileService extends mock<IFileService>() {
	readonly files = new ResourceMap<VSBuffer>();
	readonly writes: URI[] = [];
	readonly deletions: URI[] = [];
	readonly reads: URI[] = [];
	readonly writeStarted = new DeferredPromise<void>();
	writeGate: DeferredPromise<void> | undefined;
	writeError: Error | undefined;

	override async createFolder(resource: URI): Promise<IFileStatWithMetadata> {
		return new class extends mock<IFileStatWithMetadata>() { override readonly resource = resource; }();
	}

	override async writeFile(resource: URI, contents: Parameters<IFileService['writeFile']>[1]): Promise<IFileStatWithMetadata> {
		assert.ok(contents instanceof VSBuffer);
		this.writes.push(resource);
		void this.writeStarted.complete();
		await this.writeGate?.p;
		this.files.set(resource, contents);
		if (this.writeError) {
			throw this.writeError;
		}
		return new class extends mock<IFileStatWithMetadata>() { override readonly resource = resource; }();
	}

	override async del(resource: URI): Promise<void> {
		this.deletions.push(resource);
		this.files.delete(resource);
	}

	override async readFile(resource: URI): Promise<IFileContent> {
		this.reads.push(resource);
		const value = this.files.get(resource)!;
		return new class extends mock<IFileContent>() { override readonly value = value; override readonly resource = resource; }();
	}
}

class MediaTestPane extends IssueReporterEditorPane {
	readonly imports: Promise<void>[] = [];
	readonly decoding = new DeferredPromise<void>();
	videoDecoder: (resource: URI, token: CancellationToken) => Promise<IIssueReporterVideoMetadata> = async () => ({ width: 48, height: 32, durationMs: 500, thumbnailDataUrl: issueReporterImageFixture });
	imageDecoder: ((dataUrl: string, token: CancellationToken) => Promise<{ width: number; height: number }>) | undefined;
	thumbnailDecoder: ((resource: URI) => Promise<string | undefined>) | undefined;

	mount(parent: HTMLElement): void {
		this.createEditor(parent);
	}

	protected override readAttachmentVideo(resource: URI, token: CancellationToken): Promise<IIssueReporterVideoMetadata> {
		void this.decoding.complete();
		return this.videoDecoder(resource, token);
	}

	protected override readAttachmentImage(dataUrl: string, token: CancellationToken): Promise<{ width: number; height: number }> {
		void this.decoding.complete();
		return this.imageDecoder ? this.imageDecoder(dataUrl, token) : super.readAttachmentImage(dataUrl, token);
	}

	protected override async generateVideoThumbnail(resource: URI): Promise<string | undefined> {
		return this.thumbnailDecoder ? this.thumbnailDecoder(resource) : issueReporterImageFixture;
	}

	protected override importAttachments(files: readonly File[], wizard: IssueReporterOverlay, input: IssueReporterEditorInput, token: CancellationToken): Promise<void> {
		const operation = super.importAttachments(files, wizard, input, token);
		this.imports.push(operation);
		return operation;
	}

	async waitForImports(): Promise<void> {
		await Promise.all(this.imports);
	}
}

class InstrumentedMediaFile extends File {
	reads = 0;
	readonly reading = new DeferredPromise<void>();
	readGate: DeferredPromise<void> | undefined;
	reportedSize: number | undefined;

	override get size(): number {
		return this.reportedSize ?? super.size;
	}

	override async arrayBuffer(): Promise<ArrayBuffer> {
		this.reads++;
		void this.reading.complete();
		await this.readGate?.p;
		return super.arrayBuffer();
	}
}

class MediaRecordingService extends mock<IRecordingService>() {
	override readonly isSupported = true;
	override readonly onDidChangeState = Event.None;
	override readonly onDidFailRecording = Event.None;
	override state = RecordingState.Idle;
	readonly permissionRequested = new DeferredPromise<void>();
	readonly startRequested = new DeferredPromise<void>();
	permissionGate: DeferredPromise<void> | undefined;
	startGate: DeferredPromise<void> | undefined;
	permission: ScreenCapturePermissionStatus = 'granted';
	startError: Error | undefined;
	stateAfterStart = RecordingState.Recording;
	starts = 0;
	discards = 0;
	result: IRecordingData | undefined;

	override async getScreenCapturePermissionStatus(): Promise<ScreenCapturePermissionStatus> {
		void this.permissionRequested.complete();
		await this.permissionGate?.p;
		return this.permission;
	}

	override async requestScreenCapturePermission(): Promise<boolean> {
		return this.permission === 'granted';
	}

	override async startRecording(): Promise<void> {
		this.starts++;
		const discards = this.discards;
		void this.startRequested.complete();
		await this.startGate?.p;
		if (this.discards !== discards) {
			throw new CancellationError();
		}
		if (this.startError) {
			throw this.startError;
		}
		this.state = this.stateAfterStart;
	}

	override async stopRecording(): Promise<IRecordingData | undefined> {
		this.state = RecordingState.Idle;
		return this.result;
	}

	override discardRecording(): void {
		this.discards++;
		this.state = RecordingState.Idle;
	}
}

suite('Issue reporter media import lifecycle', () => {
	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Pass typed File fakes through the same reservation seam as paste/drop. */
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const data: IssueReporterData = {
		styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
		isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
		issueSource: IssueSource.VSCode, issueType: IssueType.Bug, issueTitle: 'Media import', issueBody: 'Description',
	};
	const globalStorageHome = URI.file('/native-media-test/profile/User/globalStorage');
	const tmpDir = URI.file('/native-media-test/os-temp');
	const protocolRoots = {
		appRoot: URI.file('/native-media-test/app').fsPath,
		extensionsPath: URI.file('/native-media-test/extensions').fsPath,
		globalStorageHome: globalStorageHome.fsPath,
		workspaceStorageHome: URI.file('/native-media-test/profile/User/workspaceStorage').fsPath,
	};

	function checkNativeResourceAccess(resource: URI): Promise<INativeResourceAccess> {
		return ipcRenderer.invoke('vscode:test-file-resource', FileAccess.uriToBrowserUri(resource).toString(true), protocolRoots) as Promise<INativeResourceAccess>;
	}

	function createInput(): IssueReporterEditorInput {
		return store.add(new IssueReporterEditorInput({ ...data }, new class extends mock<IDialogService>() { }()));
	}

	async function createPane(input = createInput(), files = new MediaFileService(), recording?: IRecordingService) {
		const instantiation = store.add(new TestInstantiationService());
		for (const dependency of _util.getServiceDependencies(IssueReporterEditorPane as typeof IssueReporterEditorPane & _util.DI_TARGET_OBJ)) {
			instantiation.stub(dependency.id, {});
		}
		const submit = spy(async () => false);
		const openEditor = spy(async (_input: EditorInput | IUntypedEditorInput) => undefined);
		const errors: string[] = [];
		const warnings: string[] = [];
		const group = new class extends mock<IEditorGroup>() { }();
		instantiation.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiation.stub(IThemeService, new TestThemeService());
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IRecordingService, recording ?? { isSupported: false, onDidChangeState: Event.None, onDidFailRecording: Event.None });
		instantiation.stub(INotificationService, {
			error: message => { errors.push(String(message)); },
			warn: message => { warnings.push(String(message)); },
			prompt: () => new NoOpNotification(),
		});
		instantiation.stub(IScreenshotService, { captureScreenshot: async () => issueReporterImageFixture });
		instantiation.stub(IFileService, files);
		instantiation.stub(INativeWorkbenchEnvironmentService, { tmpDir });
		instantiation.stub(IUserDataProfilesService, {
			defaultProfile: new class extends mock<IUserDataProfile>() {
				override readonly globalStorageHome = globalStorageHome.with({ scheme: Schemas.vscodeUserData });
			}(),
		});
		instantiation.stub(IContextViewService, { getContextViewElement: () => mainWindow.document.createElement('div') });
		instantiation.stub(IMarkdownRendererService, { render: () => ({ element: mainWindow.document.createElement('div'), dispose: () => { } }) });
		instantiation.stub(IIssueFormService, { searchGitHubIssues: async () => [], submitIssue: submit });
		instantiation.stub(IKeybindingService, { lookupKeybinding: () => undefined });
		instantiation.stub(IUpdateService, { state: { type: StateType.Uninitialized }, onStateChange: Event.None });
		instantiation.stub(IEditorService, { openEditor });
		instantiation.stub(IEditorGroupsService, { activateGroup: () => group });
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const pane = store.add(instantiation.createInstance(MediaTestPane, group));
		pane.mount(container);
		await pane.setInput(input, undefined, {}, CancellationToken.None);
		return { pane, input, files, container, submit, openEditor, errors, warnings };
	}

	function image(): InstrumentedMediaFile {
		return new InstrumentedMediaFile([new Uint8Array(decodeBase64(issueReporterImageFixture.split(',')[1]).buffer)], 'image.png', { type: 'image/png' });
	}

	function video(name = 'clip.mp4', type = 'video/mp4'): InstrumentedMediaFile {
		const extension = getIssueReporterMediaFormat(name, type)?.extension;
		const bytes = decodeBase64(extension === 'webm' ? issueReporterVideoFixtures.webm : extension === 'mov' ? issueReporterVideoFixtures.mov : issueReporterVideoFixtures.mp4);
		return new InstrumentedMediaFile([new Uint8Array(bytes.buffer)], name, { type });
	}

	function recordingData(extension: 'mp4' | 'webm' = 'mp4'): IRecordingData {
		const blob = new Blob([new Uint8Array(decodeBase64(issueReporterVideoFixtures[extension]).buffer)], { type: `video/${extension}` });
		return { blob, mimeType: blob.type, durationMs: 500, sizeBytes: blob.size };
	}

	test('stores imported videos inside the native protocol global storage root and deletes only owned copies', async () => {
		const { pane, input, files } = await createPane();
		const originals = ['mp4', 'webm', 'mov'].map(extension => URI.file(`/user-videos/original.${extension}`));
		const otherReporterFile = URI.joinPath(globalStorageHome, 'issue-attachments', 'other-reporter.webm');
		for (const original of [...originals, otherReporterFile]) {
			files.files.set(original, VSBuffer.fromString('untouched'));
		}
		const accesses: { status: number; pathMatches: boolean }[] = [];
		const decode = pane.videoDecoder;
		pane.videoDecoder = async (resource, token) => {
			const access = await checkNativeResourceAccess(resource);
			accesses.push({ status: access.status, pathMatches: access.path === resource.fsPath });
			assert.strictEqual(access.status, 200, access.errors.join('\n'));
			return decode(resource, token);
		};
		pane.getWizard()!['requestAddAttachments']([
			video(originals[0].fsPath),
			video(originals[1].fsPath, 'video/webm'),
			video(originals[2].fsPath, 'video/quicktime'),
		]);
		await pane.waitForImports();
		const attached = input.savedRecordings?.length;
		input.dispose();
		assert.deepStrictEqual({
			accesses,
			attached,
			inGlobalStorage: files.writes.every(resource => isEqual(URI.joinPath(resource, '..'), URI.joinPath(globalStorageHome, 'issue-attachments'))),
			fileSchemes: files.writes.map(resource => resource.scheme),
			uniqueFiles: new Set(files.writes.map(resource => resource.path)).size,
			deletions: files.deletions,
			preserved: [...originals, otherReporterFile].map(resource => files.files.get(resource)?.toString()),
			reads: files.reads,
		}, {
			accesses: Array.from({ length: 3 }, () => ({ status: 200, pathMatches: true })),
			attached: 3,
			inGlobalStorage: true,
			fileSchemes: [Schemas.file, Schemas.file, Schemas.file],
			uniqueFiles: 3,
			deletions: files.writes,
			preserved: ['untouched', 'untouched', 'untouched', 'untouched'],
			reads: [],
		});
	});

	test('keeps unowned WebM and MOV outside approved native resource roots blocked', async () => {
		const resources = [
			URI.joinPath(tmpDir, 'unowned.mp4'),
			URI.joinPath(tmpDir, 'unowned.webm'),
			URI.joinPath(tmpDir, 'unowned.mov'),
			URI.file(`${globalStorageHome.fsPath}-unowned/clip.webm`),
			globalStorageHome.with({ path: `${globalStorageHome.path}/../unowned.mov` }),
		];
		const accesses = await Promise.all(resources.map(resource => checkNativeResourceAccess(resource)));
		assert.deepStrictEqual(accesses.map(access => ({ status: access.status, refused: access.errors.some(error => error.includes('Refused to load resource')) })), [
			{ status: 200, refused: false },
			{ status: 0, refused: true },
			{ status: 0, refused: true },
			{ status: 0, refused: true },
			{ status: 0, refused: true },
		]);
	});

	for (const extension of ['mp4', 'webm'] as const) {
		test(`keeps captured ${extension} in native protocol global storage across pane moves until input disposal`, async () => {
			const recording = new MediaRecordingService();
			recording.result = recordingData(extension);
			const { pane, input, files, errors } = await createPane(createInput(), new MediaFileService(), recording);
			const otherReporterFile = URI.joinPath(globalStorageHome, 'issue-recordings', 'other-reporter.webm');
			files.files.set(otherReporterFile, VSBuffer.fromString('untouched'));
			const accesses: number[] = [];
			pane.thumbnailDecoder = async resource => {
				const access = await checkNativeResourceAccess(resource);
				accesses.push(access.status);
				assert.strictEqual(access.status, 200, access.errors.join('\n'));
				return issueReporterImageFixture;
			};
			const wizard = pane.getWizard()!;
			wizard.triggerToggleRecording();
			await pane['pendingRecordingStart'];
			wizard.triggerToggleRecording();
			await pane['pendingRecordingStop'];
			const owned = files.writes[0];
			pane.dispose();
			const survivedPane = files.files.has(owned);
			const second = await createPane(input, files);
			const restored = second.pane.getWizard()!.getRecordings().map(recording => recording.filePath);
			input.dispose();
			assert.deepStrictEqual({
				accesses,
				inGlobalStorage: isEqual(URI.joinPath(owned, '..'), URI.joinPath(globalStorageHome, 'issue-recordings')),
				survivedPane,
				restored,
				deletions: files.deletions,
				preserved: files.files.get(otherReporterFile)?.toString(),
				errors,
			}, {
				accesses: [200],
				inGlobalStorage: true,
				survivedPane: true,
				restored: [owned.fsPath],
				deletions: [owned],
				preserved: 'untouched',
				errors: [],
			});
		});
	}

	for (const phase of ['permission', 'start'] as const) {
		test(`MR-3 reserves the last recording slot while ${phase} is pending`, async () => {
			const recording = new MediaRecordingService();
			const gate = new DeferredPromise<void>();
			if (phase === 'permission') {
				recording.permissionGate = gate;
			} else {
				recording.startGate = gate;
			}
			recording.result = recordingData();
			const { pane, files, errors, warnings } = await createPane(createInput(), new MediaFileService(), recording);
			const wizard = pane.getWizard()!;
			wizard.restoreAttachments(Array.from({ length: 4 }, () => ({ dataUrl: issueReporterImageFixture, width: 48, height: 32 })), []);
			if (phase === 'permission') {
				wizard['captureStripRecordBtn']!.element.click();
			} else {
				wizard.triggerToggleRecording();
			}
			const starting = pane['pendingRecordingStart']!;
			await (phase === 'permission' ? recording.permissionRequested.p : recording.startRequested.p);
			assert.deepStrictEqual({
				captureEnabled: wizard['captureStripCaptureBtn']!.enabled,
				recordEnabled: wizard['captureStripRecordBtn']!.enabled,
			}, { captureEnabled: false, recordEnabled: false });
			wizard['requestAddAttachments']([image()]);
			await pane.waitForImports();
			await gate.complete();
			await starting;
			assert.deepStrictEqual({
				screenshots: wizard.getScreenshots().length,
				state: wizard.recordingState,
				occupied: wizard['getOccupiedAttachmentSlots'](),
			}, { screenshots: 4, state: RecordingState.Recording, occupied: 5 });
			wizard.triggerToggleRecording();
			await pane['pendingRecordingStop'];
			assert.deepStrictEqual({
				screenshots: wizard.getScreenshots().length, recordings: wizard.getRecordings().length,
				state: wizard.recordingState, occupied: wizard['getOccupiedAttachmentSlots'](),
				starts: recording.starts, writes: files.writes.length, files: files.files.size,
				attachedFile: wizard.getRecordings()[0].filePath, errors, warnings,
			}, { screenshots: 4, recordings: 1, state: RecordingState.Idle, occupied: 5, starts: 1, writes: 1, files: 1, attachedFile: files.writes[0].fsPath, errors: [], warnings: [] });
		});
	}

	for (const outcome of ['denial', 'failure', 'cancellation'] as const) {
		test(`MR-3 releases the recording reservation after ${outcome}`, async () => {
			const recording = new MediaRecordingService();
			const gate = new DeferredPromise<void>();
			if (outcome === 'denial') {
				recording.permission = 'denied';
				recording.permissionGate = gate;
			} else {
				recording.startGate = gate;
				recording.startError = outcome === 'failure' ? new Error('Start failed') : new CancellationError();
			}
			const { pane, files } = await createPane(createInput(), new MediaFileService(), recording);
			const wizard = pane.getWizard()!;
			wizard.restoreAttachments(Array.from({ length: 4 }, () => ({ dataUrl: issueReporterImageFixture, width: 48, height: 32 })), []);
			wizard.triggerToggleRecording();
			const starting = pane['pendingRecordingStart']!;
			await (outcome === 'denial' ? recording.permissionRequested.p : recording.startRequested.p);
			wizard['requestAddAttachments']([image()]);
			await pane.waitForImports();
			await gate.complete();
			await starting;
			assert.deepStrictEqual({
				occupied: wizard['getOccupiedAttachmentSlots'](), state: wizard.recordingState,
				recordEnabled: wizard['captureStripRecordBtn']!.enabled,
			}, { occupied: 4, state: RecordingState.Idle, recordEnabled: true });
			wizard['requestAddAttachments']([image()]);
			await pane.waitForImports();
			assert.deepStrictEqual({ screenshots: wizard.getScreenshots().length, writes: files.writes }, { screenshots: 5, writes: [] });
		});
	}

	for (const phase of ['permission', 'start'] as const) {
		test(`MR-3 disposes the reservation during pending ${phase} without accepting a late recording`, async () => {
			const recording = new MediaRecordingService();
			const gate = new DeferredPromise<void>();
			if (phase === 'permission') {
				recording.permissionGate = gate;
			} else {
				recording.startGate = gate;
			}
			const { pane, files } = await createPane(createInput(), new MediaFileService(), recording);
			const wizard = pane.getWizard()!;
			wizard.triggerToggleRecording();
			const starting = pane['pendingRecordingStart']!;
			await (phase === 'permission' ? recording.permissionRequested.p : recording.startRequested.p);
			pane.dispose();
			await gate.complete();
			await starting;
			assert.deepStrictEqual({
				reserved: wizard['recordingSlotReserved'], state: recording.state,
				recordings: wizard.getRecordings(), writes: files.writes,
				discards: recording.discards,
			}, { reserved: false, state: RecordingState.Idle, recordings: [], writes: [], discards: phase === 'start' ? 1 : 0 });
		});
	}

	test('MR-3 cancels a pending permission request and makes its slot available without a late start', async () => {
		const recording = new MediaRecordingService();
		recording.permissionGate = new DeferredPromise<void>();
		const { pane } = await createPane(createInput(), new MediaFileService(), recording);
		const wizard = pane.getWizard()!;
		wizard.restoreAttachments(Array.from({ length: 4 }, () => ({ dataUrl: issueReporterImageFixture, width: 48, height: 32 })), []);
		wizard.triggerToggleRecording();
		const starting = pane['pendingRecordingStart']!;
		await recording.permissionRequested.p;
		await pane['stopRecording']();
		wizard['requestAddAttachments']([image()]);
		await pane.waitForImports();
		await recording.permissionGate.complete();
		await starting;
		assert.deepStrictEqual({ screenshots: wizard.getScreenshots().length, occupied: wizard['getOccupiedAttachmentSlots'](), starts: recording.starts }, { screenshots: 5, occupied: 5, starts: 0 });
	});

	test('MR-3 retains the reserved slot when the recording stops before startup resolves', async () => {
		const recording = new MediaRecordingService();
		recording.stateAfterStart = RecordingState.Stopped;
		recording.result = recordingData();
		const { pane, files } = await createPane(createInput(), new MediaFileService(), recording);
		const wizard = pane.getWizard()!;
		wizard.restoreAttachments(Array.from({ length: 4 }, () => ({ dataUrl: issueReporterImageFixture, width: 48, height: 32 })), []);
		wizard.triggerToggleRecording();
		await pane['pendingRecordingStart'];
		assert.deepStrictEqual({
			recordings: wizard.getRecordings().length, occupied: wizard['getOccupiedAttachmentSlots'](),
			state: wizard.recordingState, writes: files.writes.length,
		}, { recordings: 1, occupied: 5, state: RecordingState.Idle, writes: 1 });
	});

	test('MR-3 removes and reports a completed recording that unexpectedly cannot be attached', async () => {
		const recording = new MediaRecordingService();
		recording.result = recordingData();
		const { pane, files, warnings } = await createPane(createInput(), new MediaFileService(), recording);
		const wizard = pane.getWizard()!;
		wizard.triggerToggleRecording();
		await pane['pendingRecordingStart'];
		wizard.restoreAttachments(Array.from({ length: 5 }, () => ({ dataUrl: issueReporterImageFixture, width: 48, height: 32 })), []);
		wizard.triggerToggleRecording();
		await pane['pendingRecordingStop'];
		assert.deepStrictEqual({
			recordings: wizard.getRecordings(), files: files.files.size, removed: files.deletions,
			warnings: warnings.length, explained: warnings[0]?.includes('attachment limit'),
		}, { recordings: [], files: 0, removed: files.writes, warnings: 1, explained: true });
	});

	test('MR-3 removes a late recording write after the owning pane is disposed', async () => {
		const recording = new MediaRecordingService();
		recording.result = recordingData();
		const { pane, files } = await createPane(createInput(), new MediaFileService(), recording);
		const wizard = pane.getWizard()!;
		wizard.triggerToggleRecording();
		await pane['pendingRecordingStart'];
		files.writeGate = new DeferredPromise<void>();
		wizard.triggerToggleRecording();
		const stopping = pane['pendingRecordingStop']!;
		await files.writeStarted.p;
		pane.dispose();
		await files.writeGate.complete();
		await stopping;
		assert.deepStrictEqual({ recordings: wizard.getRecordings(), files: files.files.size, removed: files.deletions }, { recordings: [], files: 0, removed: files.writes });
	});

	test('pastes real image media once through the pane without uploading or opening annotation', async () => {
		const { pane, input, files, container, submit } = await createPane();
		container.querySelector<HTMLElement>('.wizard-next')!.click();
		const description = container.querySelector('textarea')!;
		const transfer = new DataTransfer();
		transfer.items.add(image());
		const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
		description.dispatchEvent(event);
		await pane.waitForImports();
		assert.deepStrictEqual({
			imports: pane.imports.length, screenshots: input.savedScreenshots,
			writes: files.writes, submissions: submit.callCount, focus: document.activeElement === description,
			annotation: !!container.querySelector('.issue-reporter-annotation-overlay'),
		}, { imports: 1, screenshots: [{ dataUrl: issueReporterImageFixture, width: 48, height: 32 }], writes: [], submissions: 0, focus: true, annotation: false });
	});

	test('still opens annotation for a captured screenshot and releases the pending capture slot', async () => {
		const { pane, input, container } = await createPane();
		const captured = new DeferredPromise<void>();
		store.add(pane.getWizard()!.onDidChangeAttachments(() => { void captured.complete(); }));
		pane.getWizard()!.triggerCaptureScreenshot();
		await captured.p;
		await timeout(0);
		assert.deepStrictEqual({
			screenshots: input.savedScreenshots?.length,
			annotation: !!container.querySelector('.issue-reporter-annotation-overlay'),
			pending: pane.getWizard()!['screenshotCapturePending'],
		}, { screenshots: 1, annotation: true, pending: false });
	});

	test('drops and decodes an actual MP4 into a playable owned copy, never reading or modifying the original', async () => {
		const { pane, input, files, container, submit, openEditor } = await createPane();
		const original = URI.file('/user-videos/original.mp4');
		const originalBytes = decodeBase64(issueReporterVideoFixtures.mp4);
		files.files.set(original, originalBytes);
		pane.videoDecoder = async (resource, token) => {
			const content = files.files.get(resource)!;
			return readIssueReporterVideo(`data:video/mp4;base64,${encodeBase64(content)}`, token);
		};
		const transfer = new DataTransfer();
		transfer.items.add(video(original.fsPath));
		container.querySelector('.wizard-screenshots')!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
		await pane.waitForImports();
		const recording = input.savedRecordings![0];
		container.querySelector<HTMLElement>('.wizard-recording-card')!.click();
		const owned = URI.file(recording.filePath);
		const editorInput = openEditor.firstCall.args[0];
		assert.deepStrictEqual({
			duration: recording.durationMs, width: recording.width, height: recording.height,
			thumbnail: recording.thumbnailDataUrl?.startsWith('data:image/jpeg'),
			originalUntouched: files.files.get(original) === originalBytes,
			ownedBytes: files.files.get(owned)?.equals(originalBytes),
			differentFile: recording.filePath !== original.fsPath,
			reads: files.reads, submissions: submit.callCount,
			editorResource: hasKey(editorInput, { resource: true }) && isEqual(editorInput.resource, owned),
		}, { duration: 500, width: 48, height: 32, thumbnail: true, originalUntouched: true, ownedBytes: true, differentFile: true, reads: [], submissions: 0, editorResource: true });
		container.querySelector<HTMLElement>('.wizard-recording-card .wizard-screenshot-delete')!.click();
		assert.deepStrictEqual({ recordings: input.savedRecordings, deletions: files.deletions.map(file => file.path), originalUntouched: files.files.get(original) === originalBytes }, { recordings: [], deletions: [owned.path], originalUntouched: true });
	});

	test('uses a generated filename and the video editor for a nameless or path-like MOV import', async () => {
		const { pane, input, files, container, openEditor } = await createPane();
		pane.getWizard()!['requestAddAttachments']([video('../../original.MOV', '')]);
		await pane.waitForImports();
		const path = input.savedRecordings![0].filePath;
		container.querySelector<HTMLElement>('.wizard-recording-card')!.click();
		assert.deepStrictEqual({
			generated: /[/\\]issue-attachments[/\\]import-[a-f\d-]+\.mov$/.test(path),
			originalInName: path.includes('original'),
			writes: files.writes.length,
			editor: openEditor.firstCall.args,
		}, { generated: true, originalInName: false, writes: 1, editor: [{ resource: URI.file(path), options: { override: 'vscode.videoPreview' } }] });
	});

	for (const [kind, maximum] of [['image', MAX_ISSUE_IMAGE_BYTES], ['video', MAX_ISSUE_VIDEO_BYTES]] as const) {
		test(`rejects ${kind} one byte over its limit without reading or decoding it`, async () => {
			const { pane, files, container } = await createPane();
			const file = kind === 'image' ? image() : video();
			file.reportedSize = maximum + 1;
			pane.getWizard()!['requestAddAttachments']([file]);
			await pane.waitForImports();
			assert.deepStrictEqual({
				reads: file.reads, writes: files.writes, decoding: pane.decoding.isSettled,
				limit: container.querySelector('.wizard-attachment-status')?.textContent?.includes(`${maximum / (1024 * 1024)} MB`),
			}, { reads: 0, writes: [], decoding: false, limit: true });
		});

		test(`accepts ${kind} exactly at its byte limit`, async () => {
			const { pane } = await createPane();
			const file = kind === 'image' ? image() : video();
			file.reportedSize = maximum;
			pane.getWizard()!['requestAddAttachments']([file]);
			await pane.waitForImports();
			assert.deepStrictEqual({ reads: file.reads, attachments: pane.getWizard()!.getScreenshots().length + pane.getWizard()!.getRecordings().length }, { reads: 1, attachments: 1 });
		});
	}

	test('never starts a sixth read across concurrent multi-file imports', async () => {
		const { pane } = await createPane();
		const gate = new DeferredPromise<void>();
		const imports = Array.from({ length: 7 }, () => {
			const file = image();
			file.readGate = gate;
			return file;
		});
		pane.getWizard()!['requestAddAttachments'](imports.slice(0, 4));
		pane.getWizard()!['requestAddAttachments'](imports.slice(4));
		await gate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual({ reads: imports.map(file => file.reads), screenshots: pane.getWizard()!.getScreenshots().length }, { reads: [1, 1, 1, 1, 1, 0, 0], screenshots: 5 });
	});

	test('uses detected media types rather than trusting misleading names or MIME types', async () => {
		const { pane, input } = await createPane();
		const misleadingImage = new File([new Uint8Array(decodeBase64(issueReporterImageFixture.split(',')[1]).buffer)], 'picture.jpg', { type: 'image/jpeg' });
		const misleadingVideo = new File([new Uint8Array(decodeBase64(issueReporterVideoFixtures.mp4).buffer)], 'video.webm', { type: 'video/webm' });
		pane.getWizard()!['requestAddAttachments']([misleadingImage, misleadingVideo]);
		await pane.waitForImports();
		assert.deepStrictEqual({
			image: input.savedScreenshots?.[0].dataUrl,
			video: getIssueReporterMediaFormat(input.savedRecordings![0].filePath)?.mimeType,
		}, { image: issueReporterImageFixture, video: 'video/mp4' });
	});

	test('checks the image limit from a bounded header before reading a mislabeled large image', async () => {
		const { pane, files, container } = await createPane();
		const file = new InstrumentedMediaFile([new Uint8Array(decodeBase64(issueReporterImageFixture.split(',')[1]).buffer)], 'fake-video.mp4', { type: 'video/mp4' });
		file.reportedSize = MAX_ISSUE_IMAGE_BYTES + 1;
		pane.getWizard()!['requestAddAttachments']([file]);
		await pane.waitForImports();
		assert.deepStrictEqual({
			reads: file.reads, writes: files.writes, decoding: pane.decoding.isSettled,
			error: container.querySelector('.wizard-attachment-status')?.textContent?.includes('10 MB per image'),
		}, { reads: 0, writes: [], decoding: false, error: true });
	});

	test('rejects damaged headers before reading the full file', async () => {
		const { pane, container } = await createPane();
		const file = new InstrumentedMediaFile(['not an image'], 'picture.png', { type: 'image/png' });
		pane.getWizard()!['requestAddAttachments']([file]);
		await pane.waitForImports();
		assert.deepStrictEqual({
			reads: file.reads, decoding: pane.decoding.isSettled,
			error: container.querySelector('.wizard-attachment-status')?.textContent?.includes('damaged'),
		}, { reads: 0, decoding: false, error: true });
	});

	test('does not present Chromium’s last-frame estimate as the duration of an imported WebM', async () => {
		const { pane, container } = await createPane();
		const bytes = new Uint8Array(decodeBase64(issueReporterVideoFixtures.webm).buffer);
		const durationTag = bytes.findIndex((value, index) => value === 0x44 && bytes[index + 1] === 0x89 && bytes[index + 2] === 0x88);
		bytes[durationTag] = 0xEC;
		pane.videoDecoder = async () => ({ width: 48, height: 32, durationMs: 500, thumbnailDataUrl: issueReporterImageFixture });
		pane.getWizard()!['requestAddAttachments']([new File([bytes], 'recording.webm', { type: 'video/webm' })]);
		await pane.waitForImports();
		const recording = pane.getWizard()!.getRecordings()[0];
		assert.deepStrictEqual({
			duration: recording.durationMs, width: recording.width, height: recording.height,
			label: container.querySelector('.wizard-recording-duration')?.textContent,
		}, { duration: undefined, width: 48, height: 32, label: 'Unknown duration' });
	});

	test('keeps completed imports with their input across pane moves and deletes them only on input disposal', async () => {
		const first = await createPane();
		first.pane.getWizard()!['requestAddAttachments']([video()]);
		await first.pane.waitForImports();
		const owned = first.files.writes[0];
		first.pane.dispose();
		const survivedPane = first.files.files.has(owned);
		const second = await createPane(first.input, first.files);
		const restored = second.pane.getWizard()!.getRecordings().map(recording => recording.filePath);
		first.input.dispose();
		assert.deepStrictEqual({ survivedPane, restored, deletions: first.files.deletions }, { survivedPane: true, restored: [owned.fsPath], deletions: [owned] });
	});

	test('keeps an in-progress import when the same input is hidden and shown again', async () => {
		const { pane, input } = await createPane();
		const wizard = pane.getWizard()!;
		const file = image();
		file.readGate = new DeferredPromise<void>();
		wizard['requestAddAttachments']([file]);
		await file.reading.p;
		pane.clearInput();
		await pane.setInput(input, undefined, {}, CancellationToken.None);
		await file.readGate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual({ sameWizard: pane.getWizard() === wizard, screenshots: input.savedScreenshots?.length }, { sameWizard: true, screenshots: 1 });
	});

	test('restores an explicitly empty attachment list instead of retaining stale cards', async () => {
		const { pane, input, files } = await createPane();
		pane.getWizard()!['requestAddAttachments']([video()]);
		await pane.waitForImports();
		input.savedScreenshots = [];
		input.savedRecordings = [];
		pane.clearInput();
		await pane.setInput(input, undefined, {}, CancellationToken.None);
		assert.deepStrictEqual({ recordings: pane.getWizard()!.getRecordings(), filesLeft: files.files.size }, { recordings: [], filesLeft: 0 });
	});

	test('removing one reporter input never clears another input’s attachments', async () => {
		const files = new MediaFileService();
		const first = await createPane(createInput(), files);
		const second = await createPane(createInput(), files);
		first.pane.getWizard()!['requestAddAttachments']([video()]);
		second.pane.getWizard()!['requestAddAttachments']([video()]);
		await Promise.all([first.pane.waitForImports(), second.pane.waitForImports()]);
		const firstFile = URI.file(first.input.savedRecordings![0].filePath);
		const secondFile = URI.file(second.input.savedRecordings![0].filePath);
		first.input.dispose();
		assert.deepStrictEqual({ deletions: files.deletions.map(file => file.path), secondExists: files.files.has(secondFile), distinct: !isEqual(firstFile, secondFile) }, { deletions: [firstFile.path], secondExists: true, distinct: true });
	});

	test('cancels a late file read after input replacement without attaching to the new reporter', async () => {
		const { pane, input, files } = await createPane();
		const file = image();
		file.readGate = new DeferredPromise<void>();
		pane.getWizard()!['requestAddAttachments']([file]);
		await file.reading.p;
		const replacement = createInput();
		await pane.setInput(replacement, undefined, {}, CancellationToken.None);
		await pane.waitForImports();
		await file.readGate.complete();
		assert.deepStrictEqual({ old: input.savedScreenshots, current: pane.getWizard()!.getScreenshots(), writes: files.writes, decoding: pane.decoding.isSettled }, { old: undefined, current: [], writes: [], decoding: false });
	});

	test('cleans a late owned write after disposal without decoding or retaining the copy', async () => {
		const { pane, input, files } = await createPane();
		files.writeGate = new DeferredPromise<void>();
		pane.getWizard()!['requestAddAttachments']([video()]);
		await files.writeStarted.p;
		pane.dispose();
		await files.writeGate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual({ filesLeft: files.files.size, deletions: files.deletions, recordings: input.savedRecordings, decoding: pane.decoding.isSettled }, { filesLeft: 0, deletions: files.writes, recordings: undefined, decoding: false });
	});

	test('ignores an uncancellable late decoder result after replacement and deletes its owned copy', async () => {
		const { pane, input, files } = await createPane();
		const decoded = new DeferredPromise<IIssueReporterVideoMetadata>();
		pane.videoDecoder = () => decoded.p;
		pane.getWizard()!['requestAddAttachments']([video()]);
		await pane.decoding.p;
		await pane.setInput(createInput(), undefined, {}, CancellationToken.None);
		await decoded.complete({ width: 48, height: 32, durationMs: 500, thumbnailDataUrl: issueReporterImageFixture });
		await pane.waitForImports();
		assert.deepStrictEqual({ old: input.savedRecordings, current: pane.getWizard()!.getRecordings(), filesLeft: files.files.size, deletions: files.deletions }, { old: undefined, current: [], filesLeft: 0, deletions: files.writes });
	});

	for (const failure of ['write', 'decode'] as const) {
		test(`reports ${failure} failure and deletes only its owned partial copy`, async () => {
			const { pane, input, files, container } = await createPane();
			const original = URI.file('/user-videos/original.mp4');
			files.files.set(original, VSBuffer.fromString('original'));
			if (failure === 'write') {
				files.writeError = new Error('Writing failed');
			} else {
				pane.videoDecoder = async () => { throw new Error('Decoding failed'); };
			}
			pane.getWizard()!['requestAddAttachments']([video()]);
			await pane.waitForImports();
			assert.deepStrictEqual({
				recordings: input.savedRecordings, originalExists: files.files.has(original), copies: files.files.size - 1,
				deletions: files.deletions, error: container.querySelector('.wizard-attachment-status')?.textContent?.includes('failed'),
			}, { recordings: undefined, originalExists: true, copies: 0, deletions: files.writes, error: true });
		});
	}

	test('uses filename fallback only for recognized formats, never arbitrary path reads', async () => {
		const { pane, files } = await createPane();
		const file = video('/user-videos/original.webm', 'application/octet-stream');
		pane.getWizard()!['requestAddAttachments']([file]);
		await pane.waitForImports();
		const recording = pane.getWizard()!.getRecordings()[0];
		assert.deepStrictEqual({ reads: files.reads, mime: getIssueReporterMediaFormat(recording.filePath)?.mimeType }, { reads: [], mime: 'video/webm' });
	});
});
