/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
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
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, _util } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService, NoOpNotification } from '../../../../../platform/notification/common/notification.js';
import product from '../../../../../platform/product/common/product.js';
import { IUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionServiceImpl.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService } from '../../../../test/common/workbenchTestServices.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IssueReporterEditorInput } from '../../browser/issueReporterEditorInput.js';
import { getIssueReporterMediaFormat, MAX_ISSUE_FILE_BYTES, MAX_ISSUE_IMAGE_BYTES, MAX_ISSUE_VIDEO_BYTES } from '../../browser/issueReporterMedia.js';
import { IIssueReporterAttachmentImport, IScreenshot, IssueReporterOverlay } from '../../browser/issueReporterOverlay.js';
import { IRecordingData, IRecordingService, RecordingState, ScreenCapturePermissionStatus } from '../../browser/recordingService.js';
import { IScreenshotService } from '../../browser/screenshotService.js';
import { IIssueFormService, IssueReporterAttachment, IssueReporterData, IssueSource, IssueType } from '../../common/issue.js';
import { resolveIssueReporterTarget } from '../../common/issueReporterTarget.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IssueReporterController } from '../../electron-browser/issueReporterController.js';
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

class MediaTestController extends IssueReporterController {
	readonly imports: Promise<void>[] = [];
	readonly decoding = new DeferredPromise<void>();
	imageDecoder: ((dataUrl: string, token: CancellationToken) => Promise<{ width: number; height: number }>) | undefined;
	thumbnailDecoder: ((resource: URI) => Promise<string | undefined>) | undefined;
	thumbnailRequests = 0;

	protected override readAttachmentImage(dataUrl: string, token: CancellationToken): Promise<{ width: number; height: number }> {
		void this.decoding.complete();
		return this.imageDecoder ? this.imageDecoder(dataUrl, token) : super.readAttachmentImage(dataUrl, token);
	}

	protected override async generateVideoThumbnail(resource: URI): Promise<string | undefined> {
		this.thumbnailRequests++;
		return this.thumbnailDecoder ? this.thumbnailDecoder(resource) : issueReporterImageFixture;
	}

	protected override importAttachments(files: readonly IIssueReporterAttachmentImport[], wizard: IssueReporterOverlay, input: IssueReporterEditorInput, token: CancellationToken): Promise<void> {
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
	readError: Error | undefined;
	reportedSize: number | undefined;

	override get size(): number {
		return this.reportedSize ?? super.size;
	}

	override async arrayBuffer(): Promise<ArrayBuffer> {
		this.reads++;
		void this.reading.complete();
		await this.readGate?.p;
		if (this.readError) {
			throw this.readError;
		}
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
	function savedFiles(input: IssueReporterEditorInput) {
		return input.savedAttachments?.flatMap(attachment => attachment.kind === 'file' ? [attachment.file] : []);
	}

	function capturedScreenshots(count: number): IssueReporterAttachment<IScreenshot>[] {
		return Array.from({ length: count }, (_, index) => ({ id: `screenshot-${index}`, kind: 'screenshot', screenshot: { dataUrl: issueReporterImageFixture, width: 48, height: 32 } }));
	}
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

	function createInput(overrides: Partial<IssueReporterData> = {}): IssueReporterEditorInput {
		const instantiation = workbenchInstantiationService(undefined, store);
		return store.add(instantiation.createInstance(IssueReporterEditorInput, { ...data, ...overrides }));
	}

	async function createPane(input = createInput(), files = new MediaFileService(), recording?: IRecordingService, filesConfigurationService: IFilesConfigurationService = NullFilesConfigurationService) {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IClipboardService, { writeText: async () => { } });
		instantiation.stub(IConfigurationService, new TestConfigurationService({ 'editor.editContext': false }));
		instantiation.stub(IUserInteractionService, new UserInteractionService());
		for (const dependency of _util.getServiceDependencies(IssueReporterController as typeof IssueReporterController & _util.DI_TARGET_OBJ)) {
			if (dependency.id !== IInstantiationService && dependency.id !== IConfigurationService && dependency.id !== IKeybindingService) {
				instantiation.stub(dependency.id, {});
			}
		}
		const submit = spy(async () => false);
		const openEditor = spy(async (_input: EditorInput | IUntypedEditorInput) => undefined);
		const errors: string[] = [];
		const warnings: string[] = [];
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IRecordingService, recording ?? { isSupported: false, onDidChangeState: Event.None, onDidFailRecording: Event.None });
		instantiation.stub(INotificationService, {
			error: message => { errors.push(String(message)); },
			warn: message => { warnings.push(String(message)); },
			prompt: () => new NoOpNotification(),
		});
		instantiation.stub(IScreenshotService, { captureScreenshot: async () => issueReporterImageFixture });
		instantiation.stub(IFileService, files);
		instantiation.stub(IFilesConfigurationService, filesConfigurationService);
		instantiation.stub(IUserDataProfilesService, {
			defaultProfile: new class extends mock<IUserDataProfile>() {
				override readonly globalStorageHome = globalStorageHome.with({ scheme: Schemas.vscodeUserData });
			}(),
		});
		instantiation.stub(IContextViewService, { getContextViewElement: () => mainWindow.document.createElement('div') });
		instantiation.stub(IMarkdownRendererService, {
			render: markdown => {
				const element = mainWindow.document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose: () => { } };
			},
		});
		instantiation.stub(IIssueFormService, { submitIssue: submit });
		instantiation.stub(IUpdateService, { state: { type: StateType.Uninitialized }, onStateChange: Event.None });
		instantiation.stub(IEditorService, { openEditor });
		const container = mainWindow.document.createElement('div');
		container.style.width = '800px';
		container.style.height = '900px';
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		instantiation.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return container; }
		}());
		const pane = store.add(instantiation.createInstance(MediaTestController, container, {
			reveal: async () => { await openEditor(input); },
			close: () => input.dispose(),
		}));
		pane.setInput(input);
		const editor = input.descriptionInput;
		return { pane, input, files, container, submit, openEditor, errors, warnings, editor };
	}

	function image(name = 'image.png'): InstrumentedMediaFile {
		return new InstrumentedMediaFile([new Uint8Array(decodeBase64(issueReporterImageFixture.split(',')[1]).buffer)], name, { type: 'image/png' });
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

	test('keeps native input ownership without allocating Markdown models', () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		const modelService = instantiation.get(IModelService);
		const before = modelService.getModels().length;
		const candidates = Array.from({ length: 10 }, () => store.add(instantiation.createInstance(IssueReporterEditorInput, { ...data })));
		const unused = modelService.getModels().length - before;
		const editors: IssueReporterEditorInput[] = [];
		for (const candidate of candidates) {
			const selected = editors.find(input => input.matches(candidate)) ?? candidate;
			if (selected === candidate) {
				editors.push(selected);
			}
			assert.strictEqual(selected.descriptionInput.value, data.issueBody);
		}
		const used = modelService.getModels().length - before;
		candidates.forEach(candidate => candidate.dispose());
		assert.deepStrictEqual({ unused, editors: editors.length, used, remaining: modelService.getModels().length - before }, { unused: 0, editors: 1, used: 0, remaining: 0 });
	});

	test('opens generic copies read-only with an explanation and retains that state until input disposal', async () => {
		const services = workbenchInstantiationService({}, store);
		const readonlyService = services.get(IFilesConfigurationService);
		const first = await createPane(createInput(), new MediaFileService(), undefined, readonlyService);
		const file = new File(['original text'], 'notes.txt', { type: 'text/plain' });
		first.pane.getWizard()!['requestAddAttachments']([file]);
		await first.pane.waitForImports();
		const resource = URI.file(savedFiles(first.input)![0].filePath);
		first.container.querySelector<HTMLElement>('.wizard-file-card')!.click();
		await Promise.resolve();
		const state = readonlyService.isReadonly(resource);
		const message = typeof state === 'object' ? state.value : undefined;
		first.pane.dispose();
		const retained = !!readonlyService.isReadonly(resource);
		const second = await createPane(first.input, first.files, undefined, readonlyService);
		const restored = savedFiles(second.input)?.[0].name;
		first.input.dispose();
		assert.deepStrictEqual({
			message, opened: first.openEditor.callCount, retained, restored,
			released: readonlyService.isReadonly(resource), original: readonlyService.isReadonly(URI.file('/user-files/notes.txt')),
		}, { message: 'Issue reporter attachments are read-only. Edit the original file and attach it again.', opened: 1, retained: true, restored: 'notes.txt', released: false, original: false });
	});

	test('persists Marketplace category normalization across pane rebuilds', async () => {
		const first = await createPane();
		first.container.querySelector<HTMLElement>(`[data-type="${IssueType.PerformanceIssue}"]`)!.click();
		first.container.querySelector<HTMLElement>('[data-source="marketplace"]')!.click();
		const persisted = first.input.data?.issueType;
		first.pane.dispose();
		const second = await createPane(first.input, first.files);
		second.container.querySelector<HTMLElement>('.wizard-preview')!.click();
		assert.deepStrictEqual({
			persisted, restored: second.input.data?.issueType,
			selected: second.container.querySelector('.wizard-type-btn.selected[data-type]')?.getAttribute('data-type'),
			performanceHidden: second.container.querySelector(`[data-type="${IssueType.PerformanceIssue}"]`)?.classList.contains('hidden'),
			submitted: second.submit.callCount,
		}, { persisted: IssueType.Bug, restored: IssueType.Bug, selected: String(IssueType.Bug), performanceHidden: true, submitted: 1 });
	});

	test('normalizes unsupported restored categories and restores all options when the source changes', async () => {
		const { input, container } = await createPane(createInput({ issueSource: IssueSource.Marketplace, issueType: IssueType.PerformanceIssue }));
		const restored = input.data?.issueType;
		container.querySelector<HTMLElement>('[data-source="vscode"]')!.click();
		const performance = container.querySelector<HTMLElement>(`[data-type="${IssueType.PerformanceIssue}"]`)!;
		const available = !performance.classList.contains('hidden');
		performance.click();
		assert.deepStrictEqual({ restored, available, selected: input.data?.issueType }, { restored: IssueType.Bug, available: true, selected: IssueType.PerformanceIssue });
	});

	test('stores imported videos inside the native protocol global storage root and deletes only owned copies', async () => {
		const { pane, input, files } = await createPane();
		const originals = ['mp4', 'webm', 'mov'].map(extension => URI.file(`/user-videos/original.${extension}`));
		const otherReporterFile = URI.joinPath(globalStorageHome, 'issue-attachments', 'other-reporter.webm');
		for (const original of [...originals, otherReporterFile]) {
			files.files.set(original, VSBuffer.fromString('untouched'));
		}
		const accesses: { status: number; pathMatches: boolean }[] = [];
		pane.getWizard()!['requestAddAttachments']([
			video(originals[0].fsPath),
			video(originals[1].fsPath, 'video/webm'),
			video(originals[2].fsPath, 'video/quicktime'),
		]);
		await pane.waitForImports();
		for (const resource of files.writes) {
			const access = await checkNativeResourceAccess(resource);
			accesses.push({ status: access.status, pathMatches: access.path === resource.fsPath });
			assert.strictEqual(access.status, 200, access.errors.join('\n'));
		}
		const attached = savedFiles(input)?.length;
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
			const restored = second.pane.getWizard()!.getFileAttachments().map(recording => recording.filePath);
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
			wizard.restoreAttachments(capturedScreenshots(4));
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
				screenshots: wizard.getScreenshots().length, recordings: wizard.getFileAttachments().length,
				state: wizard.recordingState, occupied: wizard['getOccupiedAttachmentSlots'](),
				starts: recording.starts, writes: files.writes.length, files: files.files.size,
				attachedFile: wizard.getFileAttachments()[0].filePath, errors, warnings,
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
			wizard.restoreAttachments(capturedScreenshots(4));
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
			assert.deepStrictEqual({ screenshots: wizard.getScreenshots().length, attachments: wizard.getFileAttachments().length, writes: files.writes.length }, { screenshots: 4, attachments: 1, writes: 1 });
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
				recordings: wizard.getFileAttachments(), writes: files.writes,
				discards: recording.discards,
			}, { reserved: false, state: RecordingState.Idle, recordings: [], writes: [], discards: phase === 'start' ? 1 : 0 });
		});
	}

	test('MR-3 cancels a pending permission request and makes its slot available without a late start', async () => {
		const recording = new MediaRecordingService();
		recording.permissionGate = new DeferredPromise<void>();
		const { pane } = await createPane(createInput(), new MediaFileService(), recording);
		const wizard = pane.getWizard()!;
		wizard.restoreAttachments(capturedScreenshots(4));
		wizard.triggerToggleRecording();
		const starting = pane['pendingRecordingStart']!;
		await recording.permissionRequested.p;
		await pane['stopRecording']();
		wizard['requestAddAttachments']([image()]);
		await pane.waitForImports();
		await recording.permissionGate.complete();
		await starting;
		assert.deepStrictEqual({ screenshots: wizard.getScreenshots().length, attachments: wizard.getFileAttachments().length, occupied: wizard['getOccupiedAttachmentSlots'](), starts: recording.starts }, { screenshots: 4, attachments: 1, occupied: 5, starts: 0 });
	});

	test('MR-3 retains the reserved slot when the recording stops before startup resolves', async () => {
		const recording = new MediaRecordingService();
		recording.stateAfterStart = RecordingState.Stopped;
		recording.result = recordingData();
		const { pane, files } = await createPane(createInput(), new MediaFileService(), recording);
		const wizard = pane.getWizard()!;
		wizard.restoreAttachments(capturedScreenshots(4));
		wizard.triggerToggleRecording();
		await pane['pendingRecordingStart'];
		assert.deepStrictEqual({
			recordings: wizard.getFileAttachments().length, occupied: wizard['getOccupiedAttachmentSlots'](),
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
		wizard.restoreAttachments(capturedScreenshots(5));
		wizard.triggerToggleRecording();
		await pane['pendingRecordingStop'];
		assert.deepStrictEqual({
			recordings: wizard.getFileAttachments(), files: files.files.size, removed: files.deletions,
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
		assert.deepStrictEqual({ recordings: wizard.getFileAttachments(), files: files.files.size, removed: files.deletions }, { recordings: [], files: 0, removed: files.writes });
	});

	test('pastes real image media once through the pane without uploading or opening annotation', async () => {
		const { pane, input, files, container, submit, editor } = await createPane();
		editor.focus();
		const description = container.querySelector<HTMLElement>('.wizard-description-editor')!;
		const transfer = new DataTransfer();
		transfer.items.add(image());
		const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
		description.dispatchEvent(event);
		await pane.waitForImports();
		assert.deepStrictEqual({
			imports: pane.imports.length, attachments: savedFiles(input)?.map(file => ({ name: file.name, mimeType: file.mimeType, thumbnailDataUrl: file.thumbnailDataUrl })),
			writes: files.writes.length, submissions: submit.callCount, focus: mainWindow.document.activeElement === editor,
			annotation: !!container.querySelector('.issue-reporter-annotation-overlay'),
		}, { imports: 1, attachments: [{ name: 'image.png', mimeType: 'image/png', thumbnailDataUrl: issueReporterImageFixture }], writes: 1, submissions: 0, focus: true, annotation: false });
	});

	test('still opens annotation for a captured screenshot and releases the pending capture slot', async () => {
		const { pane, input, container } = await createPane();
		const captured = new DeferredPromise<void>();
		store.add(pane.getWizard()!.onDidChangeAttachments(() => { void captured.complete(); }));
		pane.getWizard()!.triggerCaptureScreenshot();
		await captured.p;
		await timeout(0);
		assert.deepStrictEqual({
			screenshots: input.savedAttachments?.filter(attachment => attachment.kind === 'screenshot').length,
			annotation: !!container.querySelector('.issue-reporter-annotation-overlay'),
			pending: pane.getWizard()!['screenshotCapturePending'],
		}, { screenshots: 1, annotation: true, pending: false });
	});

	test('drops an actual MP4 into an owned copy without decoding or modifying the original', async () => {
		const { pane, input, files, container, submit, openEditor } = await createPane();
		const original = URI.file('/user-videos/original.mp4');
		const originalBytes = decodeBase64(issueReporterVideoFixtures.mp4);
		files.files.set(original, originalBytes);
		const transfer = new DataTransfer();
		transfer.items.add(video(original.fsPath));
		container.querySelector('.wizard-screenshots')!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
		await pane.waitForImports();
		const recording = savedFiles(input)![0];
		container.querySelector<HTMLElement>('.wizard-file-card')!.click();
		await Promise.resolve();
		const owned = URI.file(recording.filePath);
		const editorInput = openEditor.firstCall.args[0];
		assert.deepStrictEqual({
			duration: recording.durationMs, thumbnail: recording.thumbnailDataUrl, name: recording.name, mimeType: recording.mimeType,
			originalUntouched: files.files.get(original) === originalBytes,
			ownedBytes: files.files.get(owned)?.equals(originalBytes),
			differentFile: recording.filePath !== original.fsPath,
			reads: files.reads, submissions: submit.callCount,
			editorResource: hasKey(editorInput, { resource: true }) && isEqual(editorInput.resource, owned),
		}, { duration: undefined, thumbnail: undefined, name: original.fsPath, mimeType: 'video/mp4', originalUntouched: true, ownedBytes: true, differentFile: true, reads: [], submissions: 0, editorResource: true });
		container.querySelector<HTMLElement>('.wizard-file-card .wizard-screenshot-delete')!.click();
		assert.deepStrictEqual({ recordings: savedFiles(input), deletions: files.deletions.map(file => file.path), originalUntouched: files.files.get(original) === originalBytes }, { recordings: [], deletions: [owned.path], originalUntouched: true });
	});

	test('uses a generated filename and the video editor for a nameless or path-like MOV import', async () => {
		const { pane, input, files, container, openEditor } = await createPane();
		pane.getWizard()!['requestAddAttachments']([video('../../original.MOV', '')]);
		await pane.waitForImports();
		const path = savedFiles(input)![0].filePath;
		container.querySelector<HTMLElement>('.wizard-file-card')!.click();
		await Promise.resolve();
		assert.deepStrictEqual({
			generated: /[/\\]issue-attachments[/\\]import-[a-f\d-]+\.mov$/.test(path),
			originalInName: path.includes('original'),
			writes: files.writes.length,
			editor: openEditor.firstCall.args[0],
		}, { generated: true, originalInName: false, writes: 1, editor: { resource: URI.file(path), options: { override: 'vscode.videoPreview' } } });
	});

	for (const [kind, maximum] of [['image', MAX_ISSUE_IMAGE_BYTES], ['video', MAX_ISSUE_VIDEO_BYTES], ['file', MAX_ISSUE_FILE_BYTES]] as const) {
		test(`rejects ${kind} one byte over its limit without reading or decoding it`, async () => {
			const { pane, files, container } = await createPane();
			const file = kind === 'image' ? image() : kind === 'video' ? video() : new InstrumentedMediaFile(['zip'], 'report.zip', { type: 'application/zip' });
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
			const file = kind === 'image' ? image() : kind === 'video' ? video() : new InstrumentedMediaFile(['zip'], 'report.zip', { type: 'application/zip' });
			file.reportedSize = maximum;
			pane.getWizard()!['requestAddAttachments']([file]);
			await pane.waitForImports();
			assert.deepStrictEqual({ reads: file.reads, attachments: pane.getWizard()!.getScreenshots().length + pane.getWizard()!.getFileAttachments().length }, { reads: 1, attachments: 1 });
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
		assert.deepStrictEqual({ reads: imports.map(file => file.reads), attachments: pane.getWizard()!.getFileAttachments().length }, { reads: [1, 1, 1, 1, 1, 0, 0], attachments: 5 });
	});

	test('retains original names and MIME types rather than rewriting them from signatures', async () => {
		const { pane, input } = await createPane();
		const misleadingImage = new File([new Uint8Array(decodeBase64(issueReporterImageFixture.split(',')[1]).buffer)], 'picture.jpg', { type: 'image/jpeg' });
		const misleadingVideo = new File([new Uint8Array(decodeBase64(issueReporterVideoFixtures.mp4).buffer)], 'video.webm', { type: 'video/webm' });
		pane.getWizard()!['requestAddAttachments']([misleadingImage, misleadingVideo]);
		await pane.waitForImports();
		assert.deepStrictEqual(savedFiles(input)?.map(file => ({ name: file.name, mimeType: file.mimeType })), [
			{ name: 'picture.jpg', mimeType: 'image/jpeg' }, { name: 'video.webm', mimeType: 'video/webm' },
		]);
	});

	for (const [name, mimeType] of [['undecodable.mov', 'video/quicktime'], ['bundle.zip', 'application/zip'], ['custom.bin', 'application/x-custom'], ['broken.png', 'image/png']]) {
		test(`accepts ${name} without decoding and retains original bytes`, async () => {
			const { pane, input, files, submit, container } = await createPane();
			const bytes = new Uint8Array([0, 1, 255, 3]);
			const file = new InstrumentedMediaFile([bytes], name, { type: mimeType });
			pane.getWizard()!['requestAddAttachments']([file]);
			await pane.waitForImports();
			const attachment = savedFiles(input)![0];
			assert.deepStrictEqual({
				name: attachment.name, mimeType: attachment.mimeType,
				bytes: [...files.files.get(URI.file(attachment.filePath))!.buffer],
				reads: file.reads, decoding: pane.decoding.isSettled, thumbnails: pane.thumbnailRequests,
				submissions: submit.callCount, error: container.querySelector('.wizard-attachment-status')?.textContent,
			}, { name, mimeType, bytes: [0, 1, 255, 3], reads: 1, decoding: false, thumbnails: 0, submissions: 0, error: '' });
		});
	}

	for (const [name, suppliedMimeType, expectedMimeType] of [
		['notebook.ipynb', '', 'application/octet-stream'],
		['notebook.IPYNB', 'text/plain', 'text/plain'],
		['document.PDF', 'application/pdf', 'application/pdf'],
		['settings.json', 'application/x-custom-json', 'application/x-custom-json'],
		['photo.JPEG', 'application/octet-stream', 'image/jpeg'],
		['photo.jpe', '', 'image/jpeg'],
	]) {
		test(`preserves the original name, bytes and editor suffix of ${name} declared as ${suppliedMimeType || 'no MIME type'}`, async () => {
			const { pane, input, files, container, openEditor } = await createPane();
			const contents = new Uint8Array([0, 255, 42, 10]);
			const file = new InstrumentedMediaFile([contents], name, { type: suppliedMimeType });
			pane.getWizard()!['requestAddAttachments']([file]);
			await pane.waitForImports();
			const attachment = savedFiles(input)![0];
			const resource = URI.file(attachment.filePath);
			container.querySelector<HTMLElement>('.wizard-file-card, .wizard-screenshot')!.click();
			await timeout(0);
			const opened = openEditor.firstCall?.args[0];
			assert.deepStrictEqual({
				name: attachment.name, mimeType: attachment.mimeType,
				suffix: resource.path.slice(resource.path.lastIndexOf('.') + 1),
				owned: resource.path.startsWith(`${globalStorageHome.path}/issue-attachments/import-`),
				bytes: [...files.files.get(resource)!.buffer], reads: file.reads,
				previewPath: opened && hasKey(opened, { resource: true }) ? opened.resource?.path : undefined,
			}, {
				name, mimeType: expectedMimeType, suffix: name.split('.').at(-1)!.toLowerCase(),
				owned: true, bytes: [...contents], reads: 1, previewPath: resource.path,
			});
		});
	}

	test('does not invent metadata for imported WebM files', async () => {
		const { pane, container } = await createPane();
		pane.getWizard()!['requestAddAttachments']([video('recording.webm', 'video/webm')]);
		await pane.waitForImports();
		const recording = pane.getWizard()!.getFileAttachments()[0];
		assert.deepStrictEqual({
			duration: recording.durationMs, thumbnail: recording.thumbnailDataUrl,
			label: container.querySelector('.wizard-recording-duration')?.textContent,
		}, { duration: undefined, thumbnail: undefined, label: undefined });
	});

	test('keeps completed imports with their input across pane moves and deletes them only on input disposal', async () => {
		const first = await createPane();
		first.pane.getWizard()!['requestAddAttachments']([video()]);
		await first.pane.waitForImports();
		const owned = first.files.writes[0];
		first.pane.dispose();
		const survivedPane = first.files.files.has(owned);
		const second = await createPane(first.input, first.files);
		const restored = second.pane.getWizard()!.getFileAttachments().map(recording => recording.filePath);
		first.input.dispose();
		assert.deepStrictEqual({ survivedPane, restored, deletions: first.files.deletions }, { survivedPane: true, restored: [owned.fsPath], deletions: [owned] });
	});

	test('persists mixed request order, annotations and upload badges across pane moves', async () => {
		const first = await createPane();
		const wizard = first.pane.getWizard()!;
		const pending = image('A.png');
		pending.readGate = new DeferredPromise<void>();
		wizard['requestAddAttachments']([pending]);
		await pending.reading.p;
		const captured = new DeferredPromise<void>();
		store.add(wizard.onDidChangeAttachments(() => {
			if (wizard.getAttachments().some(attachment => attachment.kind === 'screenshot')) {
				void captured.complete();
			}
		}));
		wizard.triggerCaptureScreenshot();
		wizard['requestAddAttachments']([image('B.png')]);
		await first.pane.imports[1];
		await captured.p;
		await pending.readGate.complete();
		await first.pane.waitForImports();
		const annotation = first.container.querySelector('.issue-reporter-annotation-overlay')!;
		[...annotation.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === 'Save')!.click();
		const saved = first.input.savedAttachments!;
		const annotated = saved.find(attachment => attachment.kind === 'screenshot')!;
		const destination = resolveIssueReporterTarget(first.input.data!, product)!.url;
		wizard.setUploading(true);
		for (const attachment of saved) {
			wizard.setAttachmentUploadState(attachment, { destination, state: 'done' });
		}
		wizard.setUploading(false);
		first.pane.dispose();
		const second = await createPane(first.input, first.files);
		const restored = second.pane.getWizard()!.getAttachments();
		const owned = URI.file(savedFiles(first.input)![0].filePath);
		second.container.querySelector<HTMLElement>('.wizard-screenshot-delete')!.click();
		assert.deepStrictEqual({
			order: restored.map(attachment => attachment.kind === 'file' ? attachment.file.name : 'capture'),
			identities: restored.map(attachment => attachment.id),
			annotationPreserved: restored.find(attachment => attachment.kind === 'screenshot') === annotated && !!annotated.screenshot.annotationState,
			remaining: second.pane.getWizard()!.getAttachments().map(attachment => attachment.kind === 'file' ? attachment.file.name : 'capture'),
			checks: second.container.querySelectorAll('.upload-done .review-progress-check').length,
			deletions: first.files.deletions.map(file => file.path),
		}, { order: ['A.png', 'capture', 'B.png'], identities: saved.map(attachment => attachment.id), annotationPreserved: true, remaining: ['capture', 'B.png'], checks: 2, deletions: [owned.path] });
	});

	test('keeps native text and selection across pane moves and supports subsequent undo', async () => {
		const first = await createPane();
		first.editor.focus();
		first.editor.setSelectionRange(0, 11);
		document.execCommand('insertText', false, '**Markdown**');
		first.editor.setSelectionRange(2, 10);
		first.pane.dispose();
		const second = await createPane(first.input, first.files);
		const restored = { sameInput: second.editor === first.editor, value: second.editor.value, selection: [second.editor.selectionStart, second.editor.selectionEnd] };
		second.editor.focus();
		document.execCommand('insertText', false, 'new text');
		document.execCommand('undo');
		assert.deepStrictEqual({ restored, undone: second.editor.value }, {
			restored: { sameInput: true, value: '**Markdown**', selection: [2, 10] },
			undone: '**Markdown**',
		});
		first.input.dispose();
		assert.deepStrictEqual({ attached: second.editor.isConnected, body: first.input.data?.issueBody }, { attached: false, body: '**Markdown**' });
	});

	test('keeps diagnostic inclusion and expansion choices with the input across pane moves', async () => {
		const first = await createPane(createInput({ data: 'Private diagnostic context' }));
		const extension = first.container.querySelector('[data-diagnostic-option="includeExtensionData"]')!;
		extension.querySelector<HTMLElement>('.review-diag-checkbox')!.click();
		extension.querySelector<HTMLElement>('.review-diag-toggle-area')!.click();
		first.pane.dispose();
		const second = await createPane(first.input, first.files);
		const wizard = second.pane.getWizard()!;
		wizard.updateModel({ experimentInfo: 'New background data' });
		const restored = second.container.querySelector('[data-diagnostic-option="includeExtensionData"]')!;
		let body = '';
		store.add(wizard.onDidSubmit(submission => { body = submission.body; }));
		second.container.querySelector<HTMLElement>('.wizard-preview')!.click();
		assert.deepStrictEqual({
			included: restored.querySelector('.review-diag-checkbox')?.getAttribute('aria-checked'),
			expanded: restored.querySelector('.review-diag-toggle-area')?.getAttribute('aria-expanded'),
			contentHidden: restored.querySelector<HTMLElement>('.review-diag-content')?.hidden,
			bodyIncludesDiagnostic: body.includes('Private diagnostic context'),
			bodyIncludesExperiments: body.includes('New background data'),
		}, { included: 'false', expanded: 'true', contentHidden: false, bodyIncludesDiagnostic: false, bodyIncludesExperiments: true });
	});

	test('retains description scroll position across pane moves', async () => {
		const first = await createPane(createInput({ issueBody: Array.from({ length: 30 }, (_, index) => `## Heading ${index}\n\nParagraph ${index}`).join('\n\n') }));
		first.editor.scrollTop = 100;
		const before = first.editor.scrollTop;
		first.pane.dispose();
		const second = await createPane(first.input, first.files);
		const restored = second.editor.scrollTop;
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		assert.deepStrictEqual({ before, restored, afterLayout: second.editor.scrollTop }, { before: 100, restored: 100, afterLayout: 100 });
	});

	test('keeps native draft text and selection when adopted by a different document', async () => {
		const first = await createPane();
		first.editor.focus();
		first.editor.select();
		document.execCommand('insertText', false, 'A moved draft');
		first.editor.setSelectionRange(2, 7);
		const frame = document.createElement('iframe');
		document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		frame.contentDocument!.body.appendChild(first.container);
		const moved = { text: first.editor.value, selection: [first.editor.selectionStart, first.editor.selectionEnd], document: first.editor.ownerDocument === frame.contentDocument };
		first.pane.dispose();
		const second = await createPane(first.input, first.files);
		assert.deepStrictEqual({ moved, restored: { same: second.editor === first.editor, text: second.editor.value, selection: [second.editor.selectionStart, second.editor.selectionEnd], document: second.editor.ownerDocument === document } }, {
			moved: { text: 'A moved draft', selection: [2, 7], document: true },
			restored: { same: true, text: 'A moved draft', selection: [2, 7], document: true },
		});
	});

	test('refreshes Preview and its native field descriptions after returning to a cached controller', async () => {
		const first = await createPane();
		first.container.querySelectorAll<HTMLElement>('.wizard-description-tabs [role=tab]')[1].click();
		const second = await createPane(first.input, first.files);
		second.editor.focus();
		second.editor.select();
		document.execCommand('insertText', false, 'Text changed in the other pane');
		first.pane.setInput(first.input);
		first.container.querySelectorAll<HTMLElement>('.wizard-description-tabs [role=tab]')[1].click();
		const identifiers = [first.container, second.container].flatMap(container => [...container.querySelectorAll('[id]')].map(element => element.id));
		assert.deepStrictEqual({
			preview: first.container.querySelector('.wizard-description-preview')?.textContent,
			inputOwner: first.container.contains(first.editor),
			description: first.editor.getAttribute('aria-describedby'),
			uniqueIdentifiers: new Set(identifiers).size === identifiers.length,
		}, {
			preview: 'Text changed in the other pane', inputOwner: true,
			description: first.container.querySelector('.wizard-description-guidance')!.id,
			uniqueIdentifiers: true,
		});
	});

	test('transfers ownership while both groups remain open and disables stale controls before returning', async () => {
		const first = await createPane();
		const oldWizard = first.pane.getWizard()!;
		oldWizard['requestAddAttachments']([new File(['original'], 'report.json', { type: 'application/json' })]);
		await first.pane.waitForImports();
		const owned = first.files.writes[0];
		const oldRemove = first.container.querySelector<HTMLElement>('.wizard-screenshot-delete')!;
		const oldPreview = first.container.querySelector<HTMLElement>('.wizard-preview')!;
		const oldCapture = document.querySelector<HTMLElement>('.issue-reporter-floating-bar .wizard-segmented-main')!;
		const second = await createPane(first.input, first.files);
		const moved = {
			controller: IssueReporterController.getAnyLiveInstance() === second.pane,
			released: first.pane.getWizard() === undefined,
			oldGroupOpen: first.container.isConnected,
			bars: document.querySelectorAll('.issue-reporter-floating-bar').length,
		};
		oldRemove.click();
		oldPreview.click();
		oldCapture.click();
		oldWizard.triggerCaptureScreenshot();
		oldWizard['requestAddAttachments']([image('stale.png')]);
		await first.pane.waitForImports();
		await timeout(0);
		const afterStaleActions = {
			attachments: savedFiles(first.input)?.map(file => file.name), exists: first.files.files.has(owned),
			submitted: first.submit.callCount, capturing: second.pane.getWizard()!.hasPendingOperations(), writes: first.files.writes.length,
		};
		first.pane.setInput(first.input);
		const returnedWizard = first.pane.getWizard()!;
		const returned = {
			controller: IssueReporterController.getAnyLiveInstance() === first.pane,
			released: second.pane.getWizard() === undefined,
			oldGroupOpen: second.container.isConnected,
			bars: document.querySelectorAll('.issue-reporter-floating-bar').length,
			attachments: returnedWizard.getFileAttachments().map(file => file.name),
		};
		first.pane.setInput(first.input);
		assert.deepStrictEqual({ moved, afterStaleActions, returned, sameOwnerRetained: first.pane.getWizard() === returnedWizard }, {
			moved: { controller: true, released: true, oldGroupOpen: true, bars: 1 },
			afterStaleActions: { attachments: ['report.json'], exists: true, submitted: 0, capturing: false, writes: 1 },
			returned: { controller: true, released: true, oldGroupOpen: true, bars: 1, attachments: ['report.json'] },
			sameOwnerRetained: true,
		});
	});

	test('keeps an in-progress import when the same input is hidden and shown again', async () => {
		const { pane, input } = await createPane();
		const wizard = pane.getWizard()!;
		const file = image();
		file.readGate = new DeferredPromise<void>();
		wizard['requestAddAttachments']([file]);
		await file.reading.p;
		pane.setInput(input);
		await file.readGate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual({ sameWizard: pane.getWizard() === wizard, attachments: savedFiles(input)?.length }, { sameWizard: true, attachments: 1 });
	});

	test('keeps pending reservation order when a partially populated input is shown again', async () => {
		const { pane, input } = await createPane();
		const wizard = pane.getWizard()!;
		wizard['requestAddAttachments']([image('first.png')]);
		await pane.waitForImports();
		const pending = image('second.png');
		pending.readGate = new DeferredPromise<void>();
		wizard['requestAddAttachments']([pending]);
		await pending.reading.p;
		pane.setInput(input);
		await pending.readGate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual(savedFiles(input)?.map(file => file.name), ['first.png', 'second.png']);
	});

	for (const otherPane of ['retained', 'disposed'] as const) {
		test(`rebinds input callbacks after a cached-pane roundtrip with the other pane ${otherPane}`, async () => {
			const first = await createPane();
			first.input.descriptionInput.value = 'User-edited description';
			first.input.descriptionInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			first.pane.getWizard()!.markPreviewOpened();
			const second = await createPane(first.input, first.files);
			second.pane.getWizard()!.markPreviewOpened();
			const movedController = IssueReporterController.getAnyLiveInstance();
			first.pane.setInput(first.input);
			const wizard = first.pane.getWizard()!;
			wizard.markPreviewOpened();
			if (otherPane === 'disposed') {
				second.pane.dispose();
			}
			const observe = (operation: string) => ({
				operation,
				pending: wizard.hasPendingOperations(),
				move: typeof first.input.canMove(1, 2),
				confirm: first.input.closeHandler.showConfirm(),
			});
			wizard.setUploading(true);
			const pending = [observe('upload')];
			wizard.setUploading(false);

			const file = image();
			file.readGate = new DeferredPromise<void>();
			wizard['requestAddAttachments']([file]);
			await file.reading.p;
			pending.push(observe('import'));
			await file.readGate.complete();
			await first.pane.waitForImports();
			wizard.markPreviewOpened();

			const dimensions = new DeferredPromise<{ width: number; height: number }>();
			first.pane.imageDecoder = () => dimensions.p;
			const captured = new DeferredPromise<void>();
			store.add(wizard.onDidChangeAttachments(() => { void captured.complete(); }));
			wizard.triggerCaptureScreenshot();
			await first.pane.decoding.p;
			pending.push(observe('capture'));
			await dimensions.complete({ width: 48, height: 32 });
			await captured.p;
			await timeout(0);
			wizard.markPreviewOpened();
			assert.deepStrictEqual({
				reused: first.pane.getWizard() === wizard,
				movedController: movedController === second.pane,
				returnedController: IssueReporterController.getAnyLiveInstance() === first.pane,
				pending,
				completed: { pending: wizard.hasPendingOperations(), move: first.input.canMove(1, 2), confirm: first.input.closeHandler.showConfirm() },
			}, {
				reused: true,
				movedController: true,
				returnedController: true,
				pending: [
					{ operation: 'upload', pending: true, move: 'string', confirm: true },
					{ operation: 'import', pending: true, move: 'string', confirm: true },
					{ operation: 'capture', pending: true, move: 'string', confirm: true },
				],
				completed: { pending: false, move: true, confirm: false },
			});
		});
	}

	test('prevents cross-group moves during imports without cancelling the pending file', async () => {
		const { pane, input } = await createPane();
		const file = image();
		file.readGate = new DeferredPromise<void>();
		pane.getWizard()!['requestAddAttachments']([file]);
		await file.reading.p;
		const pending = { crossGroup: typeof input.canMove(1, 2), sameGroup: input.canMove(1, 1) };
		await file.readGate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual({ pending, completed: input.canMove(1, 2), files: savedFiles(input)?.length }, {
			pending: { crossGroup: 'string', sameGroup: true }, completed: true, files: 1,
		});
	});

	test('prevents moving an active upload and releases the guard on completion', async () => {
		const { pane, input } = await createPane();
		const wizard = pane.getWizard()!;
		wizard.setUploading(true);
		const pending = typeof input.canMove(1, 2);
		wizard.setUploading(false);
		assert.deepStrictEqual({ pending, completed: input.canMove(1, 2) }, { pending: 'string', completed: true });
	});

	test('retains a recording while its permission and capture operations block moves', async () => {
		const recording = new MediaRecordingService();
		recording.permissionGate = new DeferredPromise<void>();
		const { pane, input } = await createPane(createInput(), new MediaFileService(), recording);
		const wizard = pane.getWizard()!;
		wizard.triggerToggleRecording();
		await recording.permissionRequested.p;
		const permission = typeof input.canMove(1, 2);
		await recording.permissionGate.complete();
		await pane['pendingRecordingStart'];
		const active = typeof input.canMove(1, 2);
		wizard.triggerToggleRecording();
		await pane['pendingRecordingStop'];
		assert.deepStrictEqual({ permission, active, completed: input.canMove(1, 2), discards: recording.discards }, { permission: 'string', active: 'string', completed: true, discards: 0 });
	});

	test('restores an explicitly empty attachment list instead of retaining stale cards', async () => {
		const { pane, input, files } = await createPane();
		pane.getWizard()!['requestAddAttachments']([video()]);
		await pane.waitForImports();
		input.savedAttachments = [];
		pane.setInput(input);
		assert.deepStrictEqual({ recordings: pane.getWizard()!.getFileAttachments(), filesLeft: files.files.size }, { recordings: [], filesLeft: 0 });
	});

	test('removing one reporter input never clears another input’s attachments', async () => {
		const files = new MediaFileService();
		const first = await createPane(createInput(), files);
		const second = await createPane(createInput(), files);
		first.pane.getWizard()!['requestAddAttachments']([video()]);
		second.pane.getWizard()!['requestAddAttachments']([video()]);
		await Promise.all([first.pane.waitForImports(), second.pane.waitForImports()]);
		const firstFile = URI.file(savedFiles(first.input)![0].filePath);
		const secondFile = URI.file(savedFiles(second.input)![0].filePath);
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
		pane.setInput(replacement);
		await pane.waitForImports();
		await file.readGate.complete();
		assert.deepStrictEqual({ old: savedFiles(input), current: pane.getWizard()!.getFileAttachments(), writes: files.writes, decoding: pane.decoding.isSettled }, { old: undefined, current: [], writes: [], decoding: false });
	});

	test('cleans a late owned write after disposal without decoding or retaining the copy', async () => {
		const { pane, input, files } = await createPane();
		files.writeGate = new DeferredPromise<void>();
		pane.getWizard()!['requestAddAttachments']([video()]);
		await files.writeStarted.p;
		pane.dispose();
		await files.writeGate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual({ filesLeft: files.files.size, deletions: files.deletions, recordings: savedFiles(input), decoding: pane.decoding.isSettled }, { filesLeft: 0, deletions: files.writes, recordings: undefined, decoding: false });
	});

	test('removes a late owned write after input replacement', async () => {
		const { pane, input, files } = await createPane();
		files.writeGate = new DeferredPromise<void>();
		pane.getWizard()!['requestAddAttachments']([video()]);
		await files.writeStarted.p;
		pane.setInput(createInput());
		await files.writeGate.complete();
		await pane.waitForImports();
		assert.deepStrictEqual({ old: savedFiles(input), current: pane.getWizard()!.getFileAttachments(), filesLeft: files.files.size, deletions: files.deletions }, { old: undefined, current: [], filesLeft: 0, deletions: files.writes });
	});

	for (const failure of ['write', 'read'] as const) {
		test(`reports ${failure} failure and deletes only its owned partial copy`, async () => {
			const { pane, input, files, container } = await createPane();
			const original = URI.file('/user-videos/original.mp4');
			files.files.set(original, VSBuffer.fromString('original'));
			const file = video();
			if (failure === 'write') {
				files.writeError = new Error('Writing failed');
			} else {
				file.readError = new Error('Reading failed');
			}
			pane.getWizard()!['requestAddAttachments']([file]);
			await pane.waitForImports();
			assert.deepStrictEqual({
				recordings: savedFiles(input), originalExists: files.files.has(original), copies: files.files.size - 1,
				deletions: files.deletions, error: container.querySelector('.wizard-attachment-status')?.textContent?.includes('failed'),
			}, { recordings: undefined, originalExists: true, copies: 0, deletions: files.writes, error: true });
		});
	}

	test('uses filename MIME fallback without reading arbitrary paths or changing the source File type', async () => {
		const { pane, files } = await createPane();
		const file = video('/user-videos/original.webm', 'application/octet-stream');
		pane.getWizard()!['requestAddAttachments']([file]);
		await pane.waitForImports();
		const recording = pane.getWizard()!.getFileAttachments()[0];
		assert.deepStrictEqual({ reads: files.reads, mime: recording.mimeType, name: recording.name, originalType: file.type }, {
			reads: [], mime: 'video/webm', name: '/user-videos/original.webm', originalType: 'application/octet-stream',
		});
	});
});
