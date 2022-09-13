/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import { extname } from 'vs/base/common/resources';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { assertType } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { peekViewBorder /*, peekViewEditorBackground, peekViewResultsBackground */ } from 'vs/editor/contrib/peekView/browser/peekView';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/browser/suggest';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { EditorActivation, IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { contrastBorder, listInactiveSelectionBackground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry, IEditorSerializer } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
// import { Color } from 'vs/base/common/color';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { InteractiveWindowSetting, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from 'vs/workbench/contrib/interactive/browser/interactiveCommon';
import { IInteractiveDocumentService, InteractiveDocumentService } from 'vs/workbench/contrib/interactive/browser/interactiveDocumentService';
import { InteractiveEditor } from 'vs/workbench/contrib/interactive/browser/interactiveEditor';
import { InteractiveEditorInput } from 'vs/workbench/contrib/interactive/browser/interactiveEditorInput';
import { IInteractiveHistoryService, InteractiveHistoryService } from 'vs/workbench/contrib/interactive/browser/interactiveHistoryService';
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { INotebookEditorOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { CellEditType, CellKind, CellUri, ICellOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookContentProvider, INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { columnToEditorGroup } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';



Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		InteractiveEditor,
		InteractiveEditor.ID,
		'Interactive Window'
	),
	[
		new SyncDescriptor(InteractiveEditorInput)
	]
);

export class InteractiveDocumentContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@INotebookService notebookService: INotebookService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IEditorService editorService: IEditorService,
	) {
		super();

		const contentOptions = {
			transientOutputs: true,
			transientCellMetadata: {},
			transientDocumentMetadata: {}
		};

		const controller: INotebookContentProvider = {
			get options() {
				return contentOptions;
			},
			set options(newOptions) {
				contentOptions.transientCellMetadata = newOptions.transientCellMetadata;
				contentOptions.transientDocumentMetadata = newOptions.transientDocumentMetadata;
				contentOptions.transientOutputs = newOptions.transientOutputs;
			},
			open: async (_uri: URI, _backupId: string | VSBuffer | undefined, _untitledDocumentData: VSBuffer | undefined, _token: CancellationToken) => {
				if (_backupId instanceof VSBuffer) {
					const backup = _backupId.toString();
					try {
						const document = JSON.parse(backup) as { cells: { kind: CellKind; language: string; metadata: any; mime: string | undefined; content: string; outputs?: ICellOutput[] }[] };
						return {
							data: {
								metadata: {},
								cells: document.cells.map(cell => ({
									source: cell.content,
									language: cell.language,
									cellKind: cell.kind,
									mime: cell.mime,
									outputs: cell.outputs
										? cell.outputs.map(output => ({
											outputId: output.outputId,
											outputs: output.outputs.map(ot => ({
												mime: ot.mime,
												data: ot.data
											}))
										}))
										: [],
									metadata: cell.metadata
								}))
							},
							transientOptions: contentOptions
						};
					} catch (_e) { }
				}

				return {
					data: {
						metadata: {},
						cells: []
					},
					transientOptions: contentOptions
				};
			},
			backup: async (uri: URI, token: CancellationToken) => {
				const doc = notebookService.listNotebookDocuments().find(document => document.uri.toString() === uri.toString());
				if (doc) {
					const cells = doc.cells.map(cell => ({
						kind: cell.cellKind,
						language: cell.language,
						metadata: cell.metadata,
						mine: cell.mime,
						outputs: cell.outputs.map(output => {
							return {
								outputId: output.outputId,
								outputs: output.outputs.map(ot => ({
									mime: ot.mime,
									data: ot.data
								}))
							};
						}),
						content: cell.getValue()
					}));

					const buffer = VSBuffer.fromString(JSON.stringify({
						cells: cells
					}));

					return buffer;
				} else {
					return '';
				}
			}
		};
		this._register(notebookService.registerNotebookController('interactive', {
			id: new ExtensionIdentifier('interactive.builtin'),
			location: undefined
		}, controller));

		const info = notebookService.getContributedNotebookType('interactive');

		if (info) {
			info.update({ selectors: ['*.interactive'] });
		} else {
			this._register(notebookService.registerContributedNotebookType('interactive', {
				providerDisplayName: 'Interactive Notebook',
				displayName: 'Interactive',
				filenamePattern: ['*.interactive'],
				exclusive: true
			}));
		}

		editorResolverService.registerEditor(
			`${Schemas.vscodeInteractiveInput}:/**`,
			{
				id: 'vscode-interactive-input',
				label: 'Interactive Editor',
				priority: RegisteredEditorPriority.exclusive
			},
			{
				canSupportResource: uri => uri.scheme === Schemas.vscodeInteractiveInput,
				singlePerResource: true
			},
			{
				createEditorInput: ({ resource }) => {
					const editorInput = editorService.getEditors(EditorsOrder.SEQUENTIAL).find(editor => editor.editor instanceof InteractiveEditorInput && editor.editor.inputResource.toString() === resource.toString());
					return editorInput!;
				}
			}
		);

		editorResolverService.registerEditor(
			`*.interactive`,
			{
				id: 'interactive',
				label: 'Interactive Editor',
				priority: RegisteredEditorPriority.exclusive
			},
			{
				canSupportResource: uri => uri.scheme === Schemas.vscodeInteractive || (uri.scheme === Schemas.vscodeNotebookCell && extname(uri) === '.interactive'),
				singlePerResource: true
			},
			{
				createEditorInput: ({ resource, options }) => {
					const data = CellUri.parse(resource);
					let notebookUri: URI = resource;
					let cellOptions: IResourceEditorInput | undefined;

					if (data) {
						notebookUri = data.notebook;
						cellOptions = { resource, options };
					}

					const notebookOptions = { ...options, cellOptions } as INotebookEditorOptions;

					const editorInput = editorService.getEditors(EditorsOrder.SEQUENTIAL).find(editor => editor.editor instanceof InteractiveEditorInput && editor.editor.resource?.toString() === notebookUri.toString());
					return {
						editor: editorInput!.editor,
						options: notebookOptions
					};
				}
			}
		);
	}
}

class InteractiveInputContentProvider implements ITextModelContentProvider {

	private readonly _registration: IDisposable;

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
	) {
		this._registration = textModelService.registerTextModelContentProvider(Schemas.vscodeInteractiveInput, this);
	}

	dispose(): void {
		this._registration.dispose();
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}
		const result: ITextModel | null = this._modelService.createModel('', null, resource, false);
		return result;
	}
}


const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InteractiveDocumentContribution, 'InteractiveDocumentContribution', LifecyclePhase.Ready);
workbenchContributionsRegistry.registerWorkbenchContribution(InteractiveInputContentProvider, 'InteractiveInputContentProvider', LifecyclePhase.Ready);

export class InteractiveEditorSerializer implements IEditorSerializer {
	public static readonly ID = InteractiveEditorInput.ID;

	constructor(@IConfigurationService private configurationService: IConfigurationService) {
	}

	canSerialize(): boolean {
		return this.configurationService.getValue<boolean>(InteractiveWindowSetting.interactiveWindowRestore);
	}

	serialize(input: EditorInput): string {
		assertType(input instanceof InteractiveEditorInput);
		return JSON.stringify({
			resource: input.primary.resource,
			inputResource: input.inputResource,
			name: input.getName(),
			data: input.getSerialization()
		});
	}

	deserialize(instantiationService: IInstantiationService, raw: string) {
		if (!this.canSerialize()) {
			return undefined;
		}
		type Data = { resource: URI; inputResource: URI; data: any };
		const data = <Data>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, inputResource } = data;
		if (!data || !URI.isUri(resource) || !URI.isUri(inputResource)) {
			return undefined;
		}

		const input = InteractiveEditorInput.create(instantiationService, resource, inputResource);
		input.restoreSerialization(data.data);
		return input;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(
		InteractiveEditorSerializer.ID,
		InteractiveEditorSerializer);

registerSingleton(IInteractiveHistoryService, InteractiveHistoryService, false);
registerSingleton(IInteractiveDocumentService, InteractiveDocumentService, false);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: '_interactive.open',
			title: { value: localize('interactive.open', "Open Interactive Window"), original: 'Open Interactive Window' },
			f1: false,
			category: 'Interactive',
			description: {
				description: localize('interactive.open', "Open Interactive Window"),
				args: [
					{
						name: 'showOptions',
						description: 'Show Options',
						schema: {
							type: 'object',
							properties: {
								'viewColumn': {
									type: 'number',
									default: -1
								},
								'preserveFocus': {
									type: 'boolean',
									default: true
								}
							},
						}
					},
					{
						name: 'resource',
						description: 'Interactive resource Uri',
						isOptional: true
					},
					{
						name: 'controllerId',
						description: 'Notebook controller Id',
						isOptional: true
					},
					{
						name: 'title',
						description: 'Notebook editor title',
						isOptional: true
					}
				]
			}

		});
	}

	async run(accessor: ServicesAccessor, showOptions?: number | { viewColumn?: number; preserveFocus?: boolean }, resource?: URI, id?: string, title?: string): Promise<{ notebookUri: URI; inputUri: URI; notebookEditorId?: string }> {
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const historyService = accessor.get(IInteractiveHistoryService);
		const kernelService = accessor.get(INotebookKernelService);
		const logService = accessor.get(ILogService);
		const configurationService = accessor.get(IConfigurationService);
		const group = columnToEditorGroup(editorGroupService, configurationService, typeof showOptions === 'number' ? showOptions : showOptions?.viewColumn);
		const editorOptions = {
			activation: EditorActivation.PRESERVE,
			preserveFocus: typeof showOptions !== 'number' ? (showOptions?.preserveFocus ?? false) : false
		};

		if (resource && resource.scheme === Schemas.vscodeInteractive) {
			logService.debug('Open interactive window from resource:', resource.toString());
			const resourceUri = URI.revive(resource);
			const editors = editorService.findEditors(resourceUri).filter(id => id.editor instanceof InteractiveEditorInput && id.editor.resource?.toString() === resourceUri.toString());
			if (editors.length) {
				logService.debug('Find existing interactive window:', resource.toString());
				const editorInput = editors[0].editor as InteractiveEditorInput;
				const currentGroup = editors[0].groupId;
				const editor = await editorService.openEditor(editorInput, editorOptions, currentGroup);
				const editorControl = editor?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

				return {
					notebookUri: editorInput.resource!,
					inputUri: editorInput.inputResource,
					notebookEditorId: editorControl?.notebookEditor?.getId()
				};
			}
		}

		const existingNotebookDocument = new Set<string>();
		editorService.getEditors(EditorsOrder.SEQUENTIAL).forEach(editor => {
			if (editor.editor.resource) {
				existingNotebookDocument.add(editor.editor.resource.toString());
			}
		});

		let notebookUri: URI | undefined = undefined;
		let inputUri: URI | undefined = undefined;
		let counter = 1;
		do {
			notebookUri = URI.from({ scheme: Schemas.vscodeInteractive, path: `Interactive-${counter}.interactive` });
			inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: `/InteractiveInput-${counter}` });

			counter++;
		} while (existingNotebookDocument.has(notebookUri.toString()));

		logService.debug('Open new interactive window:', notebookUri.toString(), inputUri.toString());

		if (id) {
			const allKernels = kernelService.getMatchingKernel({ uri: notebookUri, viewType: 'interactive' }).all;
			const preferredKernel = allKernels.find(kernel => kernel.id === id);
			if (preferredKernel) {
				kernelService.preselectKernelForNotebook(preferredKernel, { uri: notebookUri, viewType: 'interactive' });
			}
		}

		const editorInput = InteractiveEditorInput.create(accessor.get(IInstantiationService), notebookUri, inputUri, title);
		historyService.clearHistory(notebookUri);
		const editorPane = await editorService.openEditor(editorInput, editorOptions, group);
		const editorControl = editorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		// Extensions must retain references to these URIs to manipulate the interactive editor
		logService.debug('New interactive window opened. Notebook editor id', editorControl?.notebookEditor?.getId());
		return { notebookUri, inputUri, notebookEditorId: editorControl?.notebookEditor?.getId() };
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.execute',
			title: { value: localize('interactive.execute', "Execute Code"), original: 'Execute Code' },
			category: 'Interactive',
			keybinding: {
				// when: NOTEBOOK_CELL_LIST_FOCUSED,
				when: ContextKeyExpr.equals('resourceScheme', Schemas.vscodeInteractive),
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyCode.Enter
				},
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
			menu: [
				{
					id: MenuId.InteractiveInputExecute
				}
			],
			icon: icons.executeIcon,
			f1: false,
			description: {
				description: 'Execute the Contents of the Input Box',
				args: [
					{
						name: 'resource',
						description: 'Interactive resource Uri',
						isOptional: true
					}
				]
			}
		});
	}

	async run(accessor: ServicesAccessor, context?: UriComponents): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const bulkEditService = accessor.get(IBulkEditService);
		const historyService = accessor.get(IInteractiveHistoryService);
		let editorControl: { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		if (context) {
			if (context.scheme === Schemas.vscodeInteractive) {
				const resourceUri = URI.revive(context);
				const editors = editorService.findEditors(resourceUri).filter(id => id.editor instanceof InteractiveEditorInput && id.editor.resource?.toString() === resourceUri.toString());
				if (editors.length) {
					const editorInput = editors[0].editor as InteractiveEditorInput;
					const currentGroup = editors[0].groupId;
					const editor = await editorService.openEditor(editorInput, currentGroup);
					editorControl = editor?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
				}
			}
		}
		else {
			editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		}

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			const notebookDocument = editorControl.notebookEditor.textModel;
			const textModel = editorControl.codeEditor.getModel();
			const activeKernel = editorControl.notebookEditor.activeKernel;
			const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;

			if (notebookDocument && textModel) {
				const index = notebookDocument.length;
				const value = textModel.getValue();

				if (isFalsyOrWhitespace(value)) {
					return;
				}

				historyService.addToHistory(notebookDocument.uri, '');
				textModel.setValue('');

				const collapseState = editorControl.notebookEditor.notebookOptions.getLayoutConfiguration().interactiveWindowCollapseCodeCells === 'fromEditor' ?
					{
						inputCollapsed: false,
						outputCollapsed: false
					} :
					undefined;
				await bulkEditService.apply([
					new ResourceNotebookCellEdit(notebookDocument.uri,
						{
							editType: CellEditType.Replace,
							index: index,
							count: 0,
							cells: [{
								cellKind: CellKind.Code,
								mime: undefined,
								language,
								source: value,
								outputs: [],
								metadata: {},
								collapseState
							}]
						}
					)
				]);

				// reveal the cell into view first
				editorControl.notebookEditor.revealCellRangeInView({ start: index, end: index + 1 });
				await editorControl.notebookEditor.executeNotebookCells(editorControl.notebookEditor.getCellsInRange({ start: index, end: index + 1 }));
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.input.clear',
			title: { value: localize('interactive.input.clear', "Clear the interactive window input editor contents"), original: 'Clear the interactive window input editor contents' },
			category: 'Interactive',
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			const notebookDocument = editorControl.notebookEditor.textModel;
			const textModel = editorControl.codeEditor.getModel();
			const range = editorControl.codeEditor.getModel()?.getFullModelRange();

			if (notebookDocument && textModel && range) {
				editorControl.codeEditor.executeEdits('', [EditOperation.replace(range, null)]);
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.history.previous',
			title: { value: localize('interactive.history.previous', "Previous value in history"), original: 'Previous value in history' },
			category: 'Interactive',
			f1: false,
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('resourceScheme', Schemas.vscodeInteractive),
					INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('bottom'),
					INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('none'),
					SuggestContext.Visible.toNegated()
				),
				primary: KeyCode.UpArrow,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const historyService = accessor.get(IInteractiveHistoryService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			const notebookDocument = editorControl.notebookEditor.textModel;
			const textModel = editorControl.codeEditor.getModel();

			if (notebookDocument && textModel) {
				const previousValue = historyService.getPreviousValue(notebookDocument.uri);
				if (previousValue) {
					textModel.setValue(previousValue);
				}
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.history.next',
			title: { value: localize('interactive.history.next', "Next value in history"), original: 'Next value in history' },
			category: 'Interactive',
			f1: false,
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('resourceScheme', Schemas.vscodeInteractive),
					INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('top'),
					INTERACTIVE_INPUT_CURSOR_BOUNDARY.notEqualsTo('none'),
					SuggestContext.Visible.toNegated()
				),
				primary: KeyCode.DownArrow,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const historyService = accessor.get(IInteractiveHistoryService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			const notebookDocument = editorControl.notebookEditor.textModel;
			const textModel = editorControl.codeEditor.getModel();

			if (notebookDocument && textModel) {
				const previousValue = historyService.getNextValue(notebookDocument.uri);
				if (previousValue) {
					textModel.setValue(previousValue);
				}
			}
		}
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.scrollToTop',
			title: localize('interactiveScrollToTop', 'Scroll to Top'),
			keybinding: {
				when: ContextKeyExpr.equals('resourceScheme', Schemas.vscodeInteractive),
				primary: KeyMod.CtrlCmd | KeyCode.Home,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
			category: 'Interactive',
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			if (editorControl.notebookEditor.getLength() === 0) {
				return;
			}

			editorControl.notebookEditor.revealCellRangeInView({ start: 0, end: 1 });
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.scrollToBottom',
			title: localize('interactiveScrollToBottom', 'Scroll to Bottom'),
			keybinding: {
				when: ContextKeyExpr.equals('resourceScheme', Schemas.vscodeInteractive),
				primary: KeyMod.CtrlCmd | KeyCode.End,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
				weight: KeybindingWeight.WorkbenchContrib
			},
			category: 'Interactive',
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			if (editorControl.notebookEditor.getLength() === 0) {
				return;
			}

			const len = editorControl.notebookEditor.getLength();
			editorControl.notebookEditor.revealCellRangeInView({ start: len - 1, end: len });
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.input.focus',
			title: { value: localize('interactive.input.focus', "Focus input editor in the interactive window"), original: 'Focus input editor in the interactive window' },
			category: 'Interactive',
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			editorService.activeEditorPane?.focus();
		}
		else {
			// find and open the most recent interactive window
			const openEditors = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
			const interactiveWindow = Iterable.find(openEditors, identifier => { return identifier.editor.typeId === InteractiveEditorInput.ID; });
			if (interactiveWindow) {
				const editorInput = interactiveWindow.editor as InteractiveEditorInput;
				const currentGroup = interactiveWindow.groupId;
				const editor = await editorService.openEditor(editorInput, currentGroup);
				const editorControl = editor?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

				if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
					editorService.activeEditorPane?.focus();
				}
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.history.focus',
			title: { value: localize('interactive.history.focus', "Focus history in the interactive window"), original: 'Focus input editor in the interactive window' },
			category: 'Interactive',
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget; focusHistory: () => void } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			editorControl.notebookEditor.focus();
		}
	}
});

registerThemingParticipant((theme) => {
	registerColor('interactive.activeCodeBorder', {
		dark: theme.getColor(peekViewBorder) ?? '#007acc',
		light: theme.getColor(peekViewBorder) ?? '#007acc',
		hcDark: contrastBorder,
		hcLight: contrastBorder
	}, localize('interactive.activeCodeBorder', 'The border color for the current interactive code cell when the editor has focus.'));

	// registerColor('interactive.activeCodeBackground', {
	// 	dark: (theme.getColor(peekViewEditorBackground) ?? Color.fromHex('#001F33')).transparent(0.25),
	// 	light: (theme.getColor(peekViewEditorBackground) ?? Color.fromHex('#F2F8FC')).transparent(0.25),
	// 	hc: Color.black
	// }, localize('interactive.activeCodeBackground', 'The background color for the current interactive code cell when the editor has focus.'));

	registerColor('interactive.inactiveCodeBorder', {
		dark: theme.getColor(listInactiveSelectionBackground) ?? transparent(listInactiveSelectionBackground, 1),
		light: theme.getColor(listInactiveSelectionBackground) ?? transparent(listInactiveSelectionBackground, 1),
		hcDark: PANEL_BORDER,
		hcLight: PANEL_BORDER
	}, localize('interactive.inactiveCodeBorder', 'The border color for the current interactive code cell when the editor does not have focus.'));

	// registerColor('interactive.inactiveCodeBackground', {
	// 	dark: (theme.getColor(peekViewResultsBackground) ?? Color.fromHex('#252526')).transparent(0.25),
	// 	light: (theme.getColor(peekViewResultsBackground) ?? Color.fromHex('#F3F3F3')).transparent(0.25),
	// 	hc: Color.black
	// }, localize('interactive.inactiveCodeBackground', 'The backgorund color for the current interactive code cell when the editor does not have focus.'));
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'interactiveWindow',
	order: 100,
	type: 'object',
	'properties': {
		[InteractiveWindowSetting.interactiveWindowAlwaysScrollOnNewCell]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize('interactiveWindow.alwaysScrollOnNewCell', "Automatically scroll the interactive window to show the output of the last statement executed. If this value is false, the window will only scroll if the last cell was already the one scrolled to.")
		},
		[InteractiveWindowSetting.interactiveWindowRestore]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('interactiveWindow.restore', "Controls whether the Interactive Window sessions/history should be restored across window reloads. Whether the state of controllers used in Interactive Windows is persisted across window reloads are controlled by extensions contributing controllers.")
		}
	}
});
