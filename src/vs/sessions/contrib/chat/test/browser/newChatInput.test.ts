/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IIconLabelValueOptions } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, IReference } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { FileThemeIcon, FolderThemeIcon } from '../../../../../platform/theme/common/themeService.js';
import { IFileLabelOptions } from '../../../../../workbench/browser/labels.js';
import { ChatDynamicVariableModel } from '../../../../../workbench/contrib/chat/browser/attachments/chatDynamicVariables.js';
import { hasSendableNewChatContent, NewChatInputWidget } from '../../browser/newChatInput.js';
import { ChatPasteAttachmentMetadata, IChatRequestVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { NewChatContextAttachments } from '../../browser/newChatContextAttachments.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../../common/newChatContextIds.js';

interface IInputModelReferenceHarness {
	readonly _store: DisposableStore;
	readonly textModelService: {
		createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>>;
	};
	readonly logService: {
		error(message: string, error: Error): void;
	};
	_register<T extends IDisposable>(disposable: T): T;
}

const holdInputModelReference = Reflect.get(NewChatInputWidget.prototype, '_holdInputModelReference') as (this: IInputModelReferenceHarness, uri: URI, model: ITextModel) => void;
const getDraftState = Reflect.get(NewChatInputWidget.prototype, '_getDraftState') as (this: IDraftStateHarness) => { inputText: string; attachments: readonly IChatRequestVariableEntry[]; contrib?: Record<string, unknown> } | undefined;
const restoreState = Reflect.get(NewChatInputWidget.prototype, '_restoreState') as (this: IRestoreStateHarness) => void;
const saveState = Reflect.get(NewChatInputWidget.prototype, 'saveState') as (this: IDraftStateHarness) => void;
const clearDraftState = Reflect.get(NewChatInputWidget.prototype, '_clearDraftState') as (this: IDraftStateHarness) => void;
const updateDraftState = Reflect.get(NewChatInputWidget.prototype, '_updateDraftState') as (this: IUpdateDraftStateHarness) => void;
const updateAndSaveDraftState = Reflect.get(NewChatInputWidget.prototype, '_updateAndSaveDraftState') as (this: IUpdateAndSaveDraftStateHarness) => void;
const updateSendButtonState = Reflect.get(NewChatInputWidget.prototype, '_updateSendButtonState') as (this: IUpdateSendButtonStateHarness) => void;
const setInputEditorFocused = Reflect.get(NewChatInputWidget.prototype, '_setInputEditorFocused') as (container: HTMLElement, focused: boolean) => void;
const updateAttachmentRendering = Reflect.get(NewChatContextAttachments.prototype, '_updateRendering') as (this: IAttachmentRenderingHarness) => void;
const getStaticContextPicks = Reflect.get(NewChatContextAttachments.prototype, '_getStaticPicks') as (contextActions: readonly { label: string; icon: ThemeIcon }[]) => readonly { label?: string; type?: string }[];

interface IDraftStateHarness {
	readonly storageService: {
		get(key: string, scope: unknown): string | undefined;
		store(key: string, value: string, scope: unknown, target: unknown): void;
	};
	_draftState?: { inputText: string; attachments: readonly IChatRequestVariableEntry[]; contrib?: Record<string, unknown> };
}

interface IRestoreStateHarness {
	_getDraftState(): { inputText: string; attachments: readonly IChatRequestVariableEntry[]; contrib?: Record<string, unknown> } | undefined;
	readonly _editor: {
		getModel(): { setValue(value: string): void } | null;
	};
	readonly _contextAttachments: {
		setAttachments(entries: readonly IChatRequestVariableEntry[]): void;
	};
	readonly _dynamicVariableModel: {
		setInputState(contrib: Readonly<Record<string, unknown>>): void;
	};
	_updateSendButtonState(): void;
}

interface IUpdateDraftStateHarness extends IDraftStateHarness {
	readonly _editor: {
		getModel(): { getValue(): string } | null;
	};
	readonly _contextAttachments: {
		readonly attachments: readonly IChatRequestVariableEntry[];
	};
	readonly _dynamicVariableModel?: {
		readonly variables: readonly object[];
		getInputState(contrib: Record<string, unknown>): void;
	};
}

interface IUpdateAndSaveDraftStateHarness extends IUpdateDraftStateHarness {
	readonly _sending: boolean;
	_updateDraftState(): void;
	saveState(): void;
}

interface IUpdateSendButtonStateHarness {
	readonly _sendButton: { enabled: boolean } | undefined;
	readonly _sending: boolean;
	readonly _editor: {
		getModel(): { getValue(): string } | null;
	};
	readonly _contextAttachments: {
		readonly attachments: readonly IChatRequestVariableEntry[];
	};
	readonly options: {
		readonly hasAdditionalSendContent?: { get(): boolean };
	};
	readonly _canSendRequest: { get(): boolean };
}

interface IAttachmentRenderingHarness {
	readonly _container: HTMLElement;
	readonly _attachedContext: readonly IChatRequestVariableEntry[];
	readonly _renderDisposables: DisposableStore;
	readonly _resourceLabels: {
		clear(): void;
		create(container: HTMLElement): IDisposable & {
			setLabel(label: string, description?: string, options?: IIconLabelValueOptions): void;
			setFile(resource: URI, options?: IFileLabelOptions): void;
		};
	};
	readonly openerService: {
		open(resource: URI): Promise<boolean>;
	};
	readonly themeService?: {
		getFileIconTheme(): { hasFileIcons: boolean; hasFolderIcons: boolean };
		getColorTheme(): { type: ColorScheme };
		readonly onDidColorThemeChange: Event<void>;
	};
	readonly modelService?: {
		getModel(): null;
	};
	readonly languageService?: {
		guessLanguageIdByFilepathOrFirstLine(): string;
	};
	removeAttachment(id: string): void;
}

class InputModelReferenceHarness implements IInputModelReferenceHarness, IDisposable {
	readonly _store = new DisposableStore();

	constructor(
		readonly textModelService: IInputModelReferenceHarness['textModelService'],
		readonly logService: IInputModelReferenceHarness['logService'],
	) { }

	_register<T extends IDisposable>(disposable: T): T {
		return this._store.add(disposable);
	}

	dispose(): void {
		this._store.dispose();
	}
}

suite('NewChatInputWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('only keeps the input frame focused while editor text has focus', () => {
		const stack = document.createElement('div');
		stack.classList.add('chat-input-stack');
		const inputArea = document.createElement('div');
		stack.appendChild(inputArea);

		setInputEditorFocused(inputArea, true);
		const focused = {
			input: inputArea.classList.contains('focused'),
			stack: stack.classList.contains('chat-input-stack-input-focused'),
		};
		setInputEditorFocused(inputArea, false);

		assert.deepStrictEqual({
			focused,
			blurred: {
				input: inputArea.classList.contains('focused'),
				stack: stack.classList.contains('chat-input-stack-input-focused'),
			},
		}, {
			focused: { input: true, stack: true },
			blurred: { input: false, stack: false },
		});

		test('keeps the input model alive until reference acquisition settles during disposal', async () => {
			const referenceDeferred = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
			let modelDisposed = false;
			let referenceDisposed = false;
			const errors: { message: string; error: Error }[] = [];
			const model = new class extends mock<ITextModel>() {
				override dispose(): void {
					modelDisposed = true;
				}
			}();
			const resolvedModel = new class extends mock<IResolvedTextEditorModel>() {
				override readonly textEditorModel = model;
			}();
			const harness = disposables.add(new InputModelReferenceHarness(
				{
					createModelReference: () => referenceDeferred.p,
				},
				{
					error: (message, error) => errors.push({ message, error }),
				},
			));

			holdInputModelReference.call(harness, URI.from({ scheme: Schemas.sessionsChatInput, path: 'input-test' }), model);
			harness.dispose();
			const disposedBeforeReferenceSettled = modelDisposed;

			referenceDeferred.complete({
				object: resolvedModel,
				dispose: () => {
					referenceDisposed = true;
					model.dispose();
				},
			});
			await referenceDeferred.p;
			await Promise.resolve();

			assert.deepStrictEqual({
				disposedBeforeReferenceSettled,
				modelDisposed,
				referenceDisposed,
				errors,
			}, {
				disposedBeforeReferenceSettled: false,
				modelDisposed: true,
				referenceDisposed: true,
				errors: [],
			});
		});
	});

	test('treats an additional folder pill as sendable content without prompt text', () => {
		const folder = URI.file('/workspace/docs');
		const attachment: IChatRequestVariableEntry = {
			kind: 'directory',
			id: getAdditionalFolderContextId(folder),
			name: 'docs',
			value: folder,
		};

		assert.deepStrictEqual({
			empty: hasSendableNewChatContent('', []),
			additionalFolder: hasSendableNewChatContent('', [attachment]),
		}, {
			empty: false,
			additionalFolder: true,
		});
	});

	test('persists and restores additional folder and repository context with URI values', () => {
		let stored: string | undefined;
		const storageService: IDraftStateHarness['storageService'] = {
			get: () => stored,
			store: (_key, value) => stored = value,
		};
		const folder = URI.file('/workspace/docs');
		const repositoryRoot = URI.parse('vscode-vfs://github/microsoft/typescript/HEAD');
		const attachments: IChatRequestVariableEntry[] = [
			{
				kind: 'directory',
				id: getAdditionalFolderContextId(folder),
				name: 'docs',
				value: folder,
			},
			{
				kind: 'generic',
				id: getAdditionalRepositoryContextId(URI.parse('https://github.com/microsoft/typescript')),
				name: 'microsoft/typescript',
				value: repositoryRoot,
			},
		];
		const saveHarness: IUpdateAndSaveDraftStateHarness = {
			storageService,
			_sending: false,
			_editor: { getModel: () => ({ getValue: () => '' }) },
			_contextAttachments: { attachments },
			_updateDraftState() {
				updateDraftState.call(this);
			},
			saveState() {
				saveState.call(this);
			},
		};
		updateAndSaveDraftState.call(saveHarness);
		const restored: { inputText?: string; attachments?: readonly IChatRequestVariableEntry[] } = {};
		const draft = getDraftState.call({ storageService });

		restoreState.call({
			_getDraftState: () => draft,
			_editor: { getModel: () => ({ setValue: value => restored.inputText = value }) },
			_contextAttachments: { setAttachments: entries => restored.attachments = entries },
			_dynamicVariableModel: { setInputState: () => { } },
			_updateSendButtonState: () => { },
		});

		assert.deepStrictEqual({
			inputText: restored.inputText,
			attachmentIds: restored.attachments?.map(attachment => attachment.id),
			folderValue: restored.attachments?.[0].value,
			repositoryValue: restored.attachments?.[1].value,
		}, {
			inputText: '',
			attachmentIds: attachments.map(attachment => attachment.id),
			folderValue: folder,
			repositoryValue: repositoryRoot,
		});
	});

	test('persists draft text when state is saved', () => {
		let stored: string | undefined;
		const storageService: IDraftStateHarness['storageService'] = {
			get: () => stored,
			store: (_key, value) => stored = value,
		};
		const harness: IUpdateAndSaveDraftStateHarness = {
			storageService,
			_sending: false,
			_editor: { getModel: () => ({ getValue: () => 'Fix this after reload' }) },
			_contextAttachments: { attachments: [] },
			_updateDraftState() {
				updateDraftState.call(this);
			},
			saveState() {
				saveState.call(this);
			},
		};

		updateDraftState.call(harness);
		saveState.call(harness);

		assert.deepStrictEqual(getDraftState.call({ storageService }), {
			inputText: 'Fix this after reload',
			attachments: [],
		});
	});

	test('persists and restores inline reference contribution state', () => {
		let stored: string | undefined;
		const storageService: IDraftStateHarness['storageService'] = {
			get: () => stored,
			store: (_key, value) => stored = value,
		};
		const url = 'https://github.com/microsoft/vscode/issues/334061';
		const contribution = [{
			id: url,
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 25 },
			promptText: url,
			data: URI.parse(url),
		}];
		const saveHarness: IUpdateAndSaveDraftStateHarness = {
			storageService,
			_sending: false,
			_editor: { getModel: () => ({ getValue: () => 'microsoft/vscode#334061' }) },
			_contextAttachments: { attachments: [] },
			_dynamicVariableModel: {
				variables: contribution,
				getInputState: contrib => contrib[ChatDynamicVariableModel.ID] = contribution,
			},
			_updateDraftState() {
				updateDraftState.call(this);
			},
			saveState() {
				saveState.call(this);
			},
		};
		updateAndSaveDraftState.call(saveHarness);

		let restoredContrib: Readonly<Record<string, unknown>> | undefined;
		const draft = getDraftState.call({ storageService });
		restoreState.call({
			_getDraftState: () => draft,
			_editor: { getModel: () => ({ setValue: () => { } }) },
			_contextAttachments: { setAttachments: () => { } },
			_dynamicVariableModel: { setInputState: contrib => restoredContrib = contrib },
			_updateSendButtonState: () => { },
		});

		assert.deepStrictEqual(restoredContrib, {
			[ChatDynamicVariableModel.ID]: contribution,
		});
	});

	test('does not re-persist a sent prompt when attachments clear during send', () => {
		let stored: string | undefined;
		let editorValue = 'Fix this';
		const storageService: IDraftStateHarness['storageService'] = {
			get: () => stored,
			store: (_key, value) => stored = value,
		};
		const harness: IUpdateAndSaveDraftStateHarness = {
			storageService,
			_sending: true,
			_editor: { getModel: () => ({ getValue: () => editorValue }) },
			_contextAttachments: { attachments: [] },
			_updateDraftState() {
				updateDraftState.call(this);
			},
			saveState() {
				saveState.call(this);
			},
		};

		clearDraftState.call(harness);
		updateAndSaveDraftState.call(harness);
		editorValue = '';
		updateDraftState.call(harness);

		assert.deepStrictEqual(getDraftState.call({ storageService }), {
			inputText: '',
			attachments: [],
		});
	});

	test('orders native attachment picks before provider context actions', () => {
		const picks = getStaticContextPicks([{
			label: 'Issue...',
			icon: Codicon.issues,
		}]);

		assert.deepStrictEqual(picks.map(pick => pick.label ?? pick.type), [
			'Files...',
			'Image from Clipboard',
			'separator',
			'Issue...',
		]);
	});

	test('enables send after restoring an unchanged retained input model', () => {
		const sendButton = { enabled: false };
		const harness: IRestoreStateHarness & IUpdateSendButtonStateHarness = {
			_getDraftState: () => ({ inputText: 'Fix this', attachments: [] }),
			_sendButton: sendButton,
			_sending: false,
			_editor: {
				getModel: () => ({
					getValue: () => 'Fix this',
					setValue: () => { },
				}),
			},
			_contextAttachments: {
				attachments: [],
				setAttachments: () => { },
			},
			_dynamicVariableModel: { setInputState: () => { } },
			options: {},
			_canSendRequest: { get: () => true },
			_updateSendButtonState() {
				updateSendButtonState.call(this);
			},
		};

		restoreState.call(harness);

		assert.strictEqual(sendButton.enabled, true);
	});

	test('renders GitHub context pills as openable with a keyboard-reachable remove button', async () => {
		const container = document.createElement('div');
		const entry = toPasteVariableEntry('microsoft/vscode#332825', 'GitHub context: https://github.com/microsoft/vscode/pull/332825', {
			id: 'github-context:https://github.com/microsoft/vscode/pull/332825',
		});
		let removed: string | undefined;
		let opened: string | undefined;
		const renderDisposables = disposables.add(new DisposableStore());
		updateAttachmentRendering.call({
			_container: container,
			_attachedContext: [entry],
			_renderDisposables: renderDisposables,
			_resourceLabels: {
				clear: () => { },
				create: () => ({
					dispose: () => { },
					setLabel: () => { },
					setFile: () => { },
				}),
			},
			openerService: {
				open: async resource => {
					opened = resource.toString();
					return true;
				},
			},
			removeAttachment: id => removed = id,
		});
		const removeButton = container.querySelector<HTMLButtonElement>('.sessions-chat-attachment-remove');
		const pill = container.querySelector<HTMLElement>('.sessions-chat-attachment-pill');
		const openButton = container.querySelector<HTMLButtonElement>('.sessions-chat-attachment-open');
		let bubbledKeyDown = false;
		pill?.addEventListener('keydown', () => bubbledKeyDown = true);
		removeButton?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		openButton?.click();
		await Promise.resolve();
		removeButton?.click();

		assert.deepStrictEqual({
			pillRole: pill?.getAttribute('role'),
			pillTabIndex: pill?.tabIndex,
			openTagName: openButton?.tagName,
			openAriaLabel: openButton?.getAttribute('aria-label'),
			tagName: removeButton?.tagName,
			tabIndex: removeButton?.tabIndex,
			ariaLabel: removeButton?.getAttribute('aria-label'),
			bubbledKeyDown,
			opened,
			removed,
		}, {
			pillRole: null,
			pillTabIndex: -1,
			openTagName: 'BUTTON',
			openAriaLabel: 'Open microsoft/vscode#332825',
			tagName: 'BUTTON',
			tabIndex: 0,
			ariaLabel: 'Remove microsoft/vscode#332825',
			bubbledKeyDown: false,
			opened: 'https://github.com/microsoft/vscode/pull/332825',
			removed: entry.id,
		});
	});

	test('renders issue and pull request attachment icons without nested focus targets', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const entries = [
			toPasteVariableEntry('microsoft/vscode#9014', 'Issue context', {
				id: 'github-context:https://github.com/microsoft/vscode/issues/9014',
				icon: { ...Codicon.issues, color: { id: 'charts.green' } },
			}),
			toPasteVariableEntry('microsoft/vscode#123', 'Pull request context', {
				id: 'github-context:https://github.com/microsoft/vscode/pull/123',
				icon: Codicon.gitPullRequest,
			}),
		];
		const renderDisposables = disposables.add(new DisposableStore());
		try {
			updateAttachmentRendering.call({
				_container: container,
				_attachedContext: entries,
				_renderDisposables: renderDisposables,
				_resourceLabels: {
					clear: () => { },
					create: () => ({
						dispose: () => { },
						setLabel: () => { },
						setFile: () => { },
					}),
				},
				openerService: { open: async () => true },
				removeAttachment: () => { },
			});

			const pills = Array.from(container.querySelectorAll('.sessions-chat-attachment-pill'));
			const focusTargets = pills.map(pill => pill.querySelector<HTMLButtonElement>('.sessions-chat-attachment-open'));
			focusTargets[0]?.focus();
			const issueButtonFocused = document.activeElement === focusTargets[0];
			focusTargets[1]?.focus();
			const pullRequestButtonFocused = document.activeElement === focusTargets[1];

			assert.deepStrictEqual({
				pills: pills.map(pill => ({
					label: pill.querySelector('.sessions-chat-attachment-name')?.textContent,
					icon: pill.querySelector('.codicon:not(.codicon-close-compact)')?.className,
					color: pill.querySelector<HTMLElement>('.codicon:not(.codicon-close-compact)')?.style.color,
					nestedLinks: pill.querySelectorAll('a').length,
				})),
				issueButtonFocused,
				pullRequestButtonFocused,
			}, {
				pills: [
					{ label: 'microsoft/vscode#9014', icon: 'codicon codicon-issues', color: 'var(--vscode-charts-green)', nestedLinks: 0 },
					{ label: 'microsoft/vscode#123', icon: 'codicon codicon-git-pull-request', color: '', nestedLinks: 0 },
				],
				issueButtonFocused: true,
				pullRequestButtonFocused: true,
			});
		} finally {
			container.remove();
		}
	});

	test('renders leading removal and compact attachment icons', () => {
		const container = document.createElement('div');
		const entries: IChatRequestVariableEntry[] = [
			{
				kind: 'file',
				id: 'file',
				name: 'README.md',
				value: URI.file('/workspace/README.md'),
			},
			{
				kind: 'directory',
				id: 'directory',
				name: 'spritesheet',
				value: URI.file('/workspace/spritesheet'),
			},
			{
				kind: 'generic',
				id: 'unknown',
				name: 'Unknown context',
				value: 'unknown',
			},
			{
				kind: 'string',
				id: 'themed-file',
				name: 'Themed file',
				value: 'themed-file',
				uri: URI.parse('vscode://context/themed-file'),
				resourceUri: URI.file('/workspace/src/index.ts'),
				iconPath: FileThemeIcon,
				handle: 1,
			},
			{
				kind: 'image',
				id: 'image',
				name: 'image.png',
				value: URI.file('/workspace/image.png'),
			},
		];
		const labels: { label: string; icon?: string; extraClasses?: readonly string[] }[] = [];
		const files: { resource: string; fileKind?: FileKind; icon?: string }[] = [];
		const renderDisposables = disposables.add(new DisposableStore());
		updateAttachmentRendering.call({
			_container: container,
			_attachedContext: entries,
			_renderDisposables: renderDisposables,
			_resourceLabels: {
				clear: () => { },
				create: content => {
					const labelElement = document.createElement('span');
					labelElement.className = 'resource-label';
					content.appendChild(labelElement);
					return {
						dispose: () => { },
						setLabel: (label, _description, options) => labels.push({
							label,
							icon: ThemeIcon.isThemeIcon(options?.iconPath) ? options.iconPath.id : options?.iconPath?.toString(),
							extraClasses: options?.extraClasses,
						}),
						setFile: (resource, options) => files.push({
							resource: resource.path,
							fileKind: options?.fileKind,
							icon: ThemeIcon.isThemeIcon(options?.icon) ? options.icon.id : options?.icon?.toString(),
						}),
					};
				},
			},
			openerService: { open: async () => true },
			themeService: {
				getFileIconTheme: () => ({ hasFileIcons: true, hasFolderIcons: false }),
				getColorTheme: () => ({ type: ColorScheme.DARK }),
				onDidColorThemeChange: Event.None,
			},
			modelService: {
				getModel: () => null,
			},
			languageService: {
				guessLanguageIdByFilepathOrFirstLine: () => 'typescript',
			},
			removeAttachment: () => { },
		});
		const firstPill = container.querySelector<HTMLElement>('.sessions-chat-attachment-pill');
		const openButton = firstPill?.querySelector<HTMLElement>('.sessions-chat-attachment-open');
		const removeButton = firstPill?.querySelector<HTMLElement>('.sessions-chat-attachment-remove');

		assert.deepStrictEqual({
			pillChildren: Array.from(firstPill?.children ?? []).map(child => child.className),
			removeButtonNestedInOpenButton: openButton?.contains(removeButton ?? null),
			hasCompactImageIcon: !!container.querySelector('.codicon-file-media-compact'),
			files,
			labels,
		}, {
			pillChildren: ['sessions-chat-attachment-remove', 'sessions-chat-attachment-open'],
			removeButtonNestedInOpenButton: false,
			hasCompactImageIcon: true,
			files: [
				{ resource: '/workspace/README.md', fileKind: FileKind.FILE, icon: undefined },
				{ resource: '/workspace/spritesheet', fileKind: FileKind.FOLDER, icon: FolderThemeIcon.id },
			],
			labels: [
				{ label: 'Unknown context', icon: Codicon.attachCompact.id, extraClasses: undefined },
				{
					label: 'Themed file',
					icon: undefined,
					extraClasses: ['file-icon', 'src-name-dir-icon', 'index.ts-name-file-icon', 'name-file-icon', 'ts-ext-file-icon', 'ext-file-icon', 'typescript-lang-file-icon'],
				},
			],
		});
	});

	test('updates light and dark attachment icons without rebuilding controls', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const colorThemeEmitter = disposables.add(new Emitter<void>());
		const lightIcon = URI.parse('test:/light.svg');
		const darkIcon = URI.parse('test:/dark.svg');
		let colorScheme = ColorScheme.DARK;
		const icons: string[] = [];
		const renderDisposables = disposables.add(new DisposableStore());
		updateAttachmentRendering.call({
			_container: container,
			_attachedContext: [{
				kind: 'generic',
				id: 'themed',
				name: 'Themed context',
				value: 'themed',
				iconPath: { light: lightIcon, dark: darkIcon },
			}],
			_renderDisposables: renderDisposables,
			_resourceLabels: {
				clear: () => { },
				create: content => {
					content.appendChild(document.createElement('span'));
					return {
						dispose: () => { },
						setLabel: (_label, _description, options) => {
							if (URI.isUri(options?.iconPath)) {
								icons.push(options.iconPath.toString());
							}
						},
						setFile: () => { },
					};
				},
			},
			openerService: { open: async () => true },
			themeService: {
				getFileIconTheme: () => ({ hasFileIcons: true, hasFolderIcons: true }),
				getColorTheme: () => ({ type: colorScheme }),
				onDidColorThemeChange: colorThemeEmitter.event,
			},
			modelService: {
				getModel: () => null,
			},
			languageService: {
				guessLanguageIdByFilepathOrFirstLine: () => 'typescript',
			},
			removeAttachment: () => { },
		});
		const pill = container.querySelector('.sessions-chat-attachment-pill');
		const removeButton = container.querySelector<HTMLElement>('.sessions-chat-attachment-remove');
		removeButton?.focus();

		colorScheme = ColorScheme.LIGHT;
		colorThemeEmitter.fire();

		assert.deepStrictEqual({
			icons,
			samePill: container.querySelector('.sessions-chat-attachment-pill') === pill,
			sameRemoveButton: container.querySelector('.sessions-chat-attachment-remove') === removeButton,
			focusedElementPreserved: document.activeElement === removeButton,
		}, {
			icons: [darkIcon.toString(), lightIcon.toString()],
			samePill: true,
			sameRemoveButton: true,
			focusedElementPreserved: true,
		});
		container.remove();
	});

	test('marks the pasted text fallback as a predefined file icon', () => {
		const container = document.createElement('div');
		const entry = toPasteVariableEntry('Pasted text', 'const value = 1;', {
			language: 'typescript',
			fileName: 'pasted.ts',
			pastedLines: '1 line',
			_meta: { [ChatPasteAttachmentMetadata.TextArtifact]: true },
		});
		let labelOptions: IIconLabelValueOptions | undefined;
		const renderDisposables = disposables.add(new DisposableStore());
		updateAttachmentRendering.call({
			_container: container,
			_attachedContext: [entry],
			_renderDisposables: renderDisposables,
			_resourceLabels: {
				clear: () => { },
				create: content => {
					content.appendChild(document.createElement('span'));
					return {
						dispose: () => { },
						setLabel: (_label, _description, options) => labelOptions = options,
						setFile: () => { },
					};
				},
			},
			openerService: { open: async () => true },
			themeService: {
				getFileIconTheme: () => ({ hasFileIcons: false, hasFolderIcons: false }),
				getColorTheme: () => ({ type: ColorScheme.DARK }),
				onDidColorThemeChange: Event.None,
			},
			modelService: {
				getModel: () => null,
			},
			languageService: {
				guessLanguageIdByFilepathOrFirstLine: () => 'typescript',
			},
			removeAttachment: () => { },
		});

		assert.deepStrictEqual({
			iconPath: labelOptions?.iconPath,
			extraClasses: labelOptions?.extraClasses,
		}, {
			iconPath: undefined,
			extraClasses: ['codicon-file', 'predefined-file-icon'],
		});
	});

	test('renders additional folder and repository context as attachment pills', () => {
		const container = document.createElement('div');
		const folder = URI.file('/workspace/docs');
		const repositoryRoot = URI.parse('vscode-vfs://github/microsoft/typescript/HEAD');
		const entries: readonly IChatRequestVariableEntry[] = [
			{
				kind: 'directory',
				id: getAdditionalFolderContextId(folder),
				name: 'docs',
				value: folder,
			},
			{
				kind: 'generic',
				id: getAdditionalRepositoryContextId(URI.parse('https://github.com/microsoft/typescript')),
				name: 'microsoft/typescript',
				value: repositoryRoot,
			},
		];
		const renderDisposables = disposables.add(new DisposableStore());
		updateAttachmentRendering.call({
			_container: container,
			_attachedContext: entries,
			_renderDisposables: renderDisposables,
			_resourceLabels: {
				clear: () => { },
				create: pill => ({
					dispose: () => { },
					setLabel: label => pill.textContent = label,
					setFile: (_resource, _options) => pill.textContent = 'docs',
				}),
			},
			openerService: { open: async () => true },
			themeService: {
				getFileIconTheme: () => ({ hasFileIcons: true, hasFolderIcons: false }),
				getColorTheme: () => ({ type: ColorScheme.DARK }),
				onDidColorThemeChange: Event.None,
			},
			removeAttachment: () => { },
		});

		assert.deepStrictEqual(
			Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-attachment-pill')).map(pill => ({
				text: pill.textContent,
				removeAriaLabel: pill.querySelector('.sessions-chat-attachment-remove')?.getAttribute('aria-label'),
				hasCompactRepositoryIcon: !!pill.querySelector('.codicon-repo-compact'),
			})),
			[
				{ text: 'docs', removeAriaLabel: 'Remove docs', hasCompactRepositoryIcon: false },
				{ text: 'microsoft/typescript', removeAriaLabel: 'Remove microsoft/typescript', hasCompactRepositoryIcon: true },
			],
		);
	});
});
