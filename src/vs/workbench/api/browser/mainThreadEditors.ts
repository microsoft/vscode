/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposed } from 'vs/base/common/errors';
import { IDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { equals as objectEquals } from 'vs/base/common/objects';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import { IDecorationOptions, IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ITextEditorOptions, IResourceEditorInput, EditorActivation, EditorResolution } from 'vs/platform/editor/common/editor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { MainThreadTextEditor } from 'vs/workbench/api/browser/mainThreadEditor';
import { ExtHostContext, ExtHostEditorsShape, IApplyEditsOptions, ITextDocumentShowOptions, ITextEditorConfigurationUpdate, ITextEditorPositionData, IUndoStopOptions, MainThreadTextEditorsShape, TextEditorRevealType } from 'vs/workbench/api/common/extHost.protocol';
import { editorGroupToColumn, columnToEditorGroup, EditorGroupColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILineChange } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IEditorControl } from 'vs/workbench/common/editor';
import { getCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface IMainThreadEditorLocator {
	getEditor(id: string): MainThreadTextEditor | undefined;
	findTextEditorIdFor(editorControl: IEditorControl): string | undefined;
	getIdOfCodeEditor(codeEditor: ICodeEditor): string | undefined;
}

export class MainThreadTextEditors implements MainThreadTextEditorsShape {

	private static INSTANCE_COUNT: number = 0;

	private readonly _instanceId: string;
	private readonly _proxy: ExtHostEditorsShape;
	private readonly _toDispose = new DisposableStore();
	private _textEditorsListenersMap: { [editorId: string]: IDisposable[] };
	private _editorPositionData: ITextEditorPositionData | null;
	private _registeredDecorationTypes: { [decorationType: string]: boolean };

	constructor(
		private readonly _editorLocator: IMainThreadEditorLocator,
		extHostContext: IExtHostContext,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this._instanceId = String(++MainThreadTextEditors.INSTANCE_COUNT);
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditors);

		this._textEditorsListenersMap = Object.create(null);
		this._editorPositionData = null;

		this._toDispose.add(this._editorService.onDidVisibleEditorsChange(() => this._updateActiveAndVisibleTextEditors()));
		this._toDispose.add(this._editorGroupService.onDidRemoveGroup(() => this._updateActiveAndVisibleTextEditors()));
		this._toDispose.add(this._editorGroupService.onDidMoveGroup(() => this._updateActiveAndVisibleTextEditors()));

		this._registeredDecorationTypes = Object.create(null);
	}

	dispose(): void {
		Object.keys(this._textEditorsListenersMap).forEach((editorId) => {
			dispose(this._textEditorsListenersMap[editorId]);
		});
		this._textEditorsListenersMap = Object.create(null);
		this._toDispose.dispose();
		for (const decorationType in this._registeredDecorationTypes) {
			this._codeEditorService.removeDecorationType(decorationType);
		}
		this._registeredDecorationTypes = Object.create(null);
	}

	handleTextEditorAdded(textEditor: MainThreadTextEditor): void {
		const id = textEditor.getId();
		const toDispose: IDisposable[] = [];
		toDispose.push(textEditor.onPropertiesChanged((data) => {
			this._proxy.$acceptEditorPropertiesChanged(id, data);
		}));

		this._textEditorsListenersMap[id] = toDispose;
	}

	handleTextEditorRemoved(id: string): void {
		dispose(this._textEditorsListenersMap[id]);
		delete this._textEditorsListenersMap[id];
	}

	private _updateActiveAndVisibleTextEditors(): void {

		// editor columns
		const editorPositionData = this._getTextEditorPositionData();
		if (!objectEquals(this._editorPositionData, editorPositionData)) {
			this._editorPositionData = editorPositionData;
			this._proxy.$acceptEditorPositionData(this._editorPositionData);
		}
	}

	private _getTextEditorPositionData(): ITextEditorPositionData {
		const result: ITextEditorPositionData = Object.create(null);
		for (const editorPane of this._editorService.visibleEditorPanes) {
			const id = this._editorLocator.findTextEditorIdFor(editorPane);
			if (id) {
				result[id] = editorGroupToColumn(this._editorGroupService, editorPane.group);
			}
		}
		return result;
	}

	// --- from extension host process

	async $tryShowTextDocument(resource: UriComponents, options: ITextDocumentShowOptions): Promise<string | undefined> {
		const uri = URI.revive(resource);

		const editorOptions: ITextEditorOptions = {
			preserveFocus: options.preserveFocus,
			pinned: options.pinned,
			selection: options.selection,
			// preserve pre 1.38 behaviour to not make group active when preserveFocus: true
			// but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
			activation: options.preserveFocus ? EditorActivation.RESTORE : undefined,
			override: EditorResolution.EXCLUSIVE_ONLY
		};

		const input: IResourceEditorInput = {
			resource: uri,
			options: editorOptions
		};

		const editor = await this._editorService.openEditor(input, columnToEditorGroup(this._editorGroupService, this._configurationService, options.position));
		if (!editor) {
			return undefined;
		}
		// Composite editors are made up of many editors so we return the active one at the time of opening
		const editorControl = editor.getControl();
		const codeEditor = getCodeEditor(editorControl);
		return codeEditor ? this._editorLocator.getIdOfCodeEditor(codeEditor) : undefined;
	}

	async $tryShowEditor(id: string, position?: EditorGroupColumn): Promise<void> {
		const mainThreadEditor = this._editorLocator.getEditor(id);
		if (mainThreadEditor) {
			const model = mainThreadEditor.getModel();
			await this._editorService.openEditor({
				resource: model.uri,
				options: { preserveFocus: false }
			}, columnToEditorGroup(this._editorGroupService, this._configurationService, position));
			return;
		}
	}

	async $tryHideEditor(id: string): Promise<void> {
		const mainThreadEditor = this._editorLocator.getEditor(id);
		if (mainThreadEditor) {
			const editorPanes = this._editorService.visibleEditorPanes;
			for (const editorPane of editorPanes) {
				if (mainThreadEditor.matches(editorPane)) {
					await editorPane.group.closeEditor(editorPane.input);
					return;
				}
			}
		}
	}

	$trySetSelections(id: string, selections: ISelection[]): Promise<void> {
		const editor = this._editorLocator.getEditor(id);
		if (!editor) {
			return Promise.reject(disposed(`TextEditor(${id})`));
		}
		editor.setSelections(selections);
		return Promise.resolve(undefined);
	}

	$trySetDecorations(id: string, key: string, ranges: IDecorationOptions[]): Promise<void> {
		key = `${this._instanceId}-${key}`;
		const editor = this._editorLocator.getEditor(id);
		if (!editor) {
			return Promise.reject(disposed(`TextEditor(${id})`));
		}
		editor.setDecorations(key, ranges);
		return Promise.resolve(undefined);
	}

	$trySetDecorationsFast(id: string, key: string, ranges: number[]): Promise<void> {
		key = `${this._instanceId}-${key}`;
		const editor = this._editorLocator.getEditor(id);
		if (!editor) {
			return Promise.reject(disposed(`TextEditor(${id})`));
		}
		editor.setDecorationsFast(key, ranges);
		return Promise.resolve(undefined);
	}

	$tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): Promise<void> {
		const editor = this._editorLocator.getEditor(id);
		if (!editor) {
			return Promise.reject(disposed(`TextEditor(${id})`));
		}
		editor.revealRange(range, revealType);
		return Promise.resolve();
	}

	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): Promise<void> {
		const editor = this._editorLocator.getEditor(id);
		if (!editor) {
			return Promise.reject(disposed(`TextEditor(${id})`));
		}
		editor.setConfiguration(options);
		return Promise.resolve(undefined);
	}

	$tryApplyEdits(id: string, modelVersionId: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): Promise<boolean> {
		const editor = this._editorLocator.getEditor(id);
		if (!editor) {
			return Promise.reject(disposed(`TextEditor(${id})`));
		}
		return Promise.resolve(editor.applyEdits(modelVersionId, edits, opts));
	}

	$tryInsertSnippet(id: string, modelVersionId: number, template: string, ranges: readonly IRange[], opts: IUndoStopOptions): Promise<boolean> {
		const editor = this._editorLocator.getEditor(id);
		if (!editor) {
			return Promise.reject(disposed(`TextEditor(${id})`));
		}
		return Promise.resolve(editor.insertSnippet(modelVersionId, template, ranges, opts));
	}

	$registerTextEditorDecorationType(extensionId: ExtensionIdentifier, key: string, options: IDecorationRenderOptions): void {
		key = `${this._instanceId}-${key}`;
		this._registeredDecorationTypes[key] = true;
		this._codeEditorService.registerDecorationType(`exthost-api-${extensionId}`, key, options);
	}

	$removeTextEditorDecorationType(key: string): void {
		key = `${this._instanceId}-${key}`;
		delete this._registeredDecorationTypes[key];
		this._codeEditorService.removeDecorationType(key);
	}

	$getDiffInformation(id: string): Promise<ILineChange[]> {
		const editor = this._editorLocator.getEditor(id);

		if (!editor) {
			return Promise.reject(new Error('No such TextEditor'));
		}

		const codeEditor = editor.getCodeEditor();
		if (!codeEditor) {
			return Promise.reject(new Error('No such CodeEditor'));
		}

		const codeEditorId = codeEditor.getId();
		const diffEditors = this._codeEditorService.listDiffEditors();
		const [diffEditor] = diffEditors.filter(d => d.getOriginalEditor().getId() === codeEditorId || d.getModifiedEditor().getId() === codeEditorId);

		if (diffEditor) {
			return Promise.resolve(diffEditor.getLineChanges() || []);
		}

		const dirtyDiffContribution = codeEditor.getContribution('editor.contrib.dirtydiff');

		if (dirtyDiffContribution) {
			return Promise.resolve((dirtyDiffContribution as any).getChanges());
		}

		return Promise.resolve([]);
	}
}

// --- commands

CommandsRegistry.registerCommand('_workbench.revertAllDirty', async function (accessor: ServicesAccessor) {
	const environmentService = accessor.get(IEnvironmentService);
	if (!environmentService.extensionTestsLocationURI) {
		throw new Error('Command is only available when running extension tests.');
	}

	const workingCopyService = accessor.get(IWorkingCopyService);
	for (const workingCopy of workingCopyService.dirtyWorkingCopies) {
		await workingCopy.revert({ soft: true });
	}
});
