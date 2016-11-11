/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import * as network from 'vs/base/common/network';
import * as strings from 'vs/base/common/strings';
import Event, { Emitter } from 'vs/base/common/event';
import { LinkedMap as Map } from 'vs/base/common/map';
import { EditorOptions, EditorInput, } from 'vs/workbench/common/editor';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { ICommonCodeEditor, IEditorViewState } from 'vs/editor/common/editorCommon';
import { StringEditor } from 'vs/workbench/browser/parts/editor/stringEditor';
import { getDefaultValuesContent } from 'vs/platform/configuration/common/model';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IFoldingController, ID as FoldingContributionId } from 'vs/editor/contrib/folding/common/folding';

export class AbstractSettingsInput extends StringEditorInput {

	private _willDispose = new Emitter<void>();
	public willDispose: Event<void> = this._willDispose.event;

	public get resource(): URI {
		return this.getResource();
	}

	public dispose() {
		this._willDispose.fire();
		this._willDispose.dispose();
		super.dispose();
	}
}

export class DefaultSettingsInput extends AbstractSettingsInput {
	static uri: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' }); // URI is used to register JSON schema support
	private static INSTANCE: DefaultSettingsInput;

	public static getInstance(instantiationService: IInstantiationService, configurationService: IWorkspaceConfigurationService): DefaultSettingsInput {
		if (!DefaultSettingsInput.INSTANCE) {
			const editorConfig = configurationService.getConfiguration<any>();
			const defaults = getDefaultValuesContent(editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t');

			let defaultsHeader = '// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file.");
			defaultsHeader += '\n// ' + nls.localize('defaultSettingsHeader2', "See http://go.microsoft.com/fwlink/?LinkId=808995 for the most commonly used settings.");
			DefaultSettingsInput.INSTANCE = instantiationService.createInstance(DefaultSettingsInput, nls.localize('defaultName', "Default Settings"), null, defaultsHeader + '\n' + defaults, 'application/json', false);
		}

		return DefaultSettingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return DefaultSettingsInput.uri;
	}
}

export class DefaultKeybindingsInput extends AbstractSettingsInput {
	private static INSTANCE: DefaultKeybindingsInput;

	public static getInstance(instantiationService: IInstantiationService, keybindingService: IKeybindingService): DefaultKeybindingsInput {
		if (!DefaultKeybindingsInput.INSTANCE) {
			const defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Overwrite key bindings by placing them into your key bindings file.");
			const defaultContents = keybindingService.getDefaultKeybindings();

			DefaultKeybindingsInput.INSTANCE = instantiationService.createInstance(DefaultKeybindingsInput, nls.localize('defaultKeybindings', "Default Keyboard Shortcuts"), null, defaultsHeader + '\n' + defaultContents, 'application/json', false);
		}

		return DefaultKeybindingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' }); // URI is used to register JSON schema support
	}
}

export class DefaultSettingsEditor extends StringEditor {

	public static ID = 'workbench.editors.defaultSettingsEditor';

	private static VIEW_STATE: Map<URI, IEditorViewState> = new Map<URI, IEditorViewState>();

	private inputDisposeListener;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@ICommandService private commandService: ICommandService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService
	) {
		super(telemetryService, instantiationService, contextService, storageService,
			messageService, configurationService, eventService, editorService, themeService, untitledEditorService);
	}

	public getId(): string {
		return DefaultSettingsEditor.ID;
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		this.listenToInput(input);
		return super.setInput(input, options);
	}

	public clearInput(): void {
		this.saveState(<AbstractSettingsInput>this.input);
		if (this.inputDisposeListener) {
			this.inputDisposeListener.dispose();
		}
		super.clearInput();
	}

	protected restoreViewState(input: EditorInput) {
		const viewState = DefaultSettingsEditor.VIEW_STATE.get(this.getResource(<AbstractSettingsInput>input));
		if (viewState) {
			this.getControl().restoreViewState(viewState);
		} else if (input instanceof DefaultSettingsInput) {
			this.foldAll();
		}
	}

	private saveState(input: AbstractSettingsInput) {
		const state = this.getControl().saveViewState();
		if (state) {
			const resource = this.getResource(input);
			if (DefaultSettingsEditor.VIEW_STATE.has(resource)) {
				DefaultSettingsEditor.VIEW_STATE.delete(resource);
			}
			DefaultSettingsEditor.VIEW_STATE.set(resource, state);
		}
	}

	private getResource(input: AbstractSettingsInput): URI {
		return input.resource;
	}

	private foldAll() {
		const foldingController = (<ICommonCodeEditor>this.getControl()).getContribution<IFoldingController>(FoldingContributionId);
		foldingController.foldAll();
	}

	private listenToInput(input: EditorInput) {
		if (this.inputDisposeListener) {
			this.inputDisposeListener.dispose();
		}
		if (input instanceof AbstractSettingsInput) {
			this.inputDisposeListener = (<AbstractSettingsInput>input).willDispose(() => this.saveState(<AbstractSettingsInput>input));
		}
	}
}