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
import { IConfigurationNode, IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/platform';

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

interface ISettingsGroup {
	title: string;
	sections: ISettingsSection[];
}

interface ISettingsSection {
	description?: string;
	settings: ISetting[];
}

interface ISetting {
	key: string;
	value: any;
	description?: string;
}

class SettingsModel {

	private settingsGroups: ISettingsGroup[];
	private indent: string;

	constructor( @IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService) {
		const editorConfig = this.configurationService.getConfiguration<any>();
		this.indent = editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t';

		const configurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
		this.settingsGroups = configurations.sort(this.compareConfigurationNodes).reduce((result, config) => this.parseConfig(config, result), []);
	}

	private parseConfig(config: IConfigurationNode, result: ISettingsGroup[], settingsGroup?: ISettingsGroup): ISettingsGroup[] {
		if (config.title) {
			if (!settingsGroup) {
				settingsGroup = result.filter(g => g.title === config.title)[0];
				if (!settingsGroup) {
					settingsGroup = { sections: [{ settings: [] }], title: config.title };
					result.push(settingsGroup);
				}
			} else {
				settingsGroup.sections[settingsGroup.sections.length - 1].description = config.title;
			}
		}
		if (config.properties) {
			if (!settingsGroup) {
				settingsGroup = { sections: [{ settings: [] }], title: config.id };
				result.push(settingsGroup);
			}
			const configurationSettings = Object.keys(config.properties).map((key) => {
				const prop = config.properties[key];
				const value = prop.default;
				const description = prop.description || '';
				return { key, value, description };
			});
			settingsGroup.sections[settingsGroup.sections.length - 1].settings.push(...configurationSettings);
		}
		if (config.allOf) {
			config.allOf.forEach(c => this.parseConfig(c, result, settingsGroup));
		}
		return result;
	}

	private compareConfigurationNodes(c1: IConfigurationNode, c2: IConfigurationNode): number {
		if (typeof c1.order !== 'number') {
			return 1;
		}
		if (typeof c2.order !== 'number') {
			return -1;
		}
		if (c1.order === c2.order) {
			const title1 = c1.title || '';
			const title2 = c2.title || '';
			return title1.localeCompare(title2);
		}
		return c1.order - c2.order;
	}

	public toContent(): string {
		let defaultsHeader = '// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file.\n");
		defaultsHeader += '// ' + nls.localize('defaultSettingsHeader2', "See http://go.microsoft.com/fwlink/?LinkId=808995 for the most commonly used settings.\n\n");

		let lastEntry = -1;
		const result: string[] = [];
		result.push('{');
		for (const group of this.settingsGroups) {
			result.push('// ' + group.title);
			for (const section of group.sections) {
				if (section.description) {
					result.push(this.indent + '// ' + section.description);
				}
				for (const setting of section.settings) {
					result.push(this.indent + '// ' + setting.description);
					let valueString = JSON.stringify(setting.value, null, this.indent);
					if (valueString && (typeof setting.value === 'object')) {
						valueString = valueString.split('\n').join('\n' + this.indent);
					}
					if (lastEntry !== -1) {
						result[lastEntry] += ',';
					}
					lastEntry = result.length;
					result.push(this.indent + JSON.stringify(setting.key) + ': ' + valueString);
					result.push('');
				}
			}
		}
		result.push('}');

		return defaultsHeader + result.join('\n');
	}

}

export class DefaultSettingsInput extends AbstractSettingsInput {
	static uri: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' }); // URI is used to register JSON schema support
	private static INSTANCE: DefaultSettingsInput;

	public static getInstance(instantiationService: IInstantiationService, configurationService: IWorkspaceConfigurationService): DefaultSettingsInput {
		if (!DefaultSettingsInput.INSTANCE) {
			const content = instantiationService.createInstance(SettingsModel).toContent();
			DefaultSettingsInput.INSTANCE = instantiationService.createInstance(DefaultSettingsInput, nls.localize('defaultName', "Default Settings"), null, content, 'application/json', false);
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