/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IEditorMemento, IEditorCloseEvent, IEditorInput, IEditorOpenContext, EditorResourceAccessor, SideBySideEditor } from 'vs/workbench/common/editor';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtUri } from 'vs/base/common/resources';
import { MutableDisposable } from 'vs/base/common/lifecycle';

/**
 * Base class of editors that want to store and restore view state.
 */
export abstract class BaseEditorWithViewState<T extends object> extends EditorPane {

	private editorMemento: IEditorMemento<T>;

	private readonly groupListener = this._register(new MutableDisposable());

	constructor(
		id: string,
		viewStateStorageKey: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService protected readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IThemeService themeService: IThemeService,
		@IEditorService protected editorService: IEditorService,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService
	) {
		super(id, telemetryService, themeService, storageService);

		this.editorMemento = this.getEditorMemento<T>(editorGroupService, textResourceConfigurationService, viewStateStorageKey, 100);
	}

	protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {

		// Listen to close events to trigger `onWillCloseEditorInGroup`
		this.groupListener.value = group?.onWillCloseEditor(e => this.onWillCloseEditor(e));

		super.setEditorVisible(visible, group);
	}

	private onWillCloseEditor(e: IEditorCloseEvent): void {
		const editor = e.editor;
		if (editor === this.input) {
			this.onWillCloseEditorInGroup(editor);
		}
	}

	protected onWillCloseEditorInGroup(editor: IEditorInput): void {
		// Subclasses can override to persist view state
	}

	override getViewState(): T | undefined {
		const resource = this.input?.resource;
		if (resource) {
			return withNullAsUndefined(this.retrieveEditorViewState(resource));
		}

		return undefined;
	}

	protected saveEditorViewState(resource: URI, cleanUpOnDispose?: IEditorInput): void {
		const editorViewState = this.retrieveEditorViewState(resource);
		if (!editorViewState || !this.group) {
			return;
		}

		this.editorMemento.saveEditorState(this.group, resource, editorViewState);

		if (cleanUpOnDispose) {
			this.editorMemento.clearEditorStateOnDispose(resource, cleanUpOnDispose);
		}
	}

	protected shouldRestoreEditorViewState(editor: IEditorInput, context?: IEditorOpenContext): boolean {

		// new editor: check with workbench.editor.restoreViewState setting
		if (context?.newInGroup) {
			return this.textResourceConfigurationService.getValue<boolean>(EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }), 'workbench.editor.restoreViewState') === false ? false : true /* restore by default */;
		}

		// existing editor: always restore viewstate
		return true;
	}

	protected abstract retrieveEditorViewState(resource: URI): T | undefined;

	protected loadEditorViewState(resource: URI): T | undefined {
		return this.group ? this.editorMemento.loadEditorState(this.group, resource) : undefined;
	}

	protected moveEditorViewState(source: URI, target: URI, comparer: IExtUri): void {
		return this.editorMemento.moveEditorState(source, target, comparer);
	}

	protected clearEditorViewState(resource: URI, group?: IEditorGroup): void {
		this.editorMemento.clearEditorState(resource, group);
	}
}
