/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/runtimeExtensionsEditor';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { EditorInput } from 'vs/workbench/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionsWorkbenchService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService, IExtensionDescription, IExtensionsStatus } from 'vs/platform/extensions/common/extensions';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { WorkbenchList, IListService } from 'vs/platform/list/browser/listService';
import { append, $, addDisposableListener, addClass } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';

interface IRuntimeExtension {

	description: IExtensionDescription;
	marketplaceInfo: IExtension;
	status: IExtensionsStatus;

}

export class RuntimeExtensionsEditor extends BaseEditor {

	static ID: string = 'workbench.editor.runtimeExtensions';

	private _list: WorkbenchList<IRuntimeExtension>;
	private _elements: IRuntimeExtension[];
	private _extensionsDescriptions: IExtensionDescription[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IListService private readonly _listService: IListService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMessageService private readonly _messageService: IMessageService,

	) {
		super(RuntimeExtensionsEditor.ID, telemetryService, themeService);

		this._list = null;
		this._elements = null;

		this._extensionsDescriptions = [];
		this._updateExtensions();

		this._extensionService.getExtensions().then((extensions) => {
			// We only deal with extensions with source code!
			this._extensionsDescriptions = extensions.filter((extension) => {
				return !!extension.main;
			});
			this._updateExtensions();
		});
		this._register(this._extensionService.onDidChangeExtensionsStatus(() => this._updateExtensions()));

		// TODO@Alex TODO@Isi ????
		// this._extensionsWorkbenchService.onChange(() => this._updateExtensions());
	}

	private _updateExtensions(): void {
		this._elements = this._resolveExtensions();
		if (this._list) {
			this._list.splice(0, this._list.length, this._elements);
		}
	}

	private _resolveExtensions(): IRuntimeExtension[] {
		let marketplaceMap: { [id: string]: IExtension; } = Object.create(null);
		for (let extension of this._extensionsWorkbenchService.local) {
			marketplaceMap[extension.id] = extension;
		}

		let statusMap = this._extensionService.getExtensionsStatus();

		let result: IRuntimeExtension[] = [];
		for (let i = 0, len = this._extensionsDescriptions.length; i < len; i++) {
			const extensionDescription = this._extensionsDescriptions[i];

			result[i] = {
				description: extensionDescription,
				marketplaceInfo: marketplaceMap[extensionDescription.id],
				status: statusMap[extensionDescription.id]
			};
		}

		return result.filter((element) => element.status.activationTimes);
	}

	protected createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();

		addClass(container, 'runtime-extensions-editor');

		const TEMPLATE_ID = 'runtimeExtensionElementTemplate';

		const delegate = new class implements IDelegate<IRuntimeExtension>{
			getHeight(element: IRuntimeExtension): number {
				return 62;
			}
			getTemplateId(element: IRuntimeExtension): string {
				return TEMPLATE_ID;
			}
		};

		interface IRuntimeExtensionTemplateData {
			root: HTMLElement;
			element: HTMLElement;
			icon: HTMLImageElement;
			name: HTMLElement;
			time: HTMLElement;
			disposables: IDisposable[];
			elementDisposables: IDisposable[];
		}

		const renderer: IRenderer<IRuntimeExtension, IRuntimeExtensionTemplateData> = {
			templateId: TEMPLATE_ID,
			renderTemplate: (root: HTMLElement): IRuntimeExtensionTemplateData => {
				const element = append(root, $('.extension'));
				const icon = append(element, $<HTMLImageElement>('img.icon'));

				const desc = append(element, $('div.desc'));
				const name = append(desc, $('div.name'));
				const timeContainer = append(desc, $('div.time'));
				append(timeContainer, $('span.octicon.octicon-clock'));
				const time = append(timeContainer, $('span.time-label'));
				const actionbar = new ActionBar(element, {
					animated: false,
					actionItemProvider: (action: Action) => {
						// TODO
						// if (action.id === ManageExtensionAction.ID) {
						// 	return (<ManageExtensionAction>action).actionItem;
						// }
						return null;
					}
				});
				actionbar.onDidRun(({ error }) => error && this._messageService.show(Severity.Error, error));

				const disposables = [actionbar];

				return {
					root,
					element,
					icon,
					name,
					time,
					disposables,
					elementDisposables: []
				};
			},

			renderElement: (element: IRuntimeExtension, index: number, data: IRuntimeExtensionTemplateData): void => {

				data.elementDisposables = dispose(data.elementDisposables);

				data.elementDisposables.push(
					addDisposableListener(data.icon, 'error', () => {
						data.icon.src = element.marketplaceInfo.iconUrlFallback;
					})
				);
				data.icon.src = element.marketplaceInfo.iconUrl;

				data.name.textContent = element.marketplaceInfo.displayName;

				const activationTimes = element.status.activationTimes;
				let syncTime = activationTimes.codeLoadingTime + activationTimes.activateCallTime;
				data.time.textContent = `${syncTime}ms`;

				let title: string;
				if (activationTimes.activationEvent === '*') {
					title = nls.localize('starActivation', "Activated on start-up");
				} else if (/^workspaceContains:/.test(activationTimes.activationEvent)) {
					let fileNameOrGlob = activationTimes.activationEvent.substr('workspaceContains:'.length);
					if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
						title = nls.localize('workspaceContainsGlobActivation', "Activated because a file matching {0} exists in your workspace", fileNameOrGlob);
					} else {
						title = nls.localize('workspaceContainsFileActivation', "Activated because file {0} exists in your workspace", fileNameOrGlob);
					}
				} else if (/^onLanguage:/.test(activationTimes.activationEvent)) {
					let language = activationTimes.activationEvent.substr('onLanguage:'.length);
					title = nls.localize('languageActivation', "Activated because you opened a {0} file", language);
				} else {
					title = nls.localize('workspaceGenericActivation', "Activated on {0}", activationTimes.activationEvent);
				}
				data.time.title = title;
			},

			disposeTemplate: (data: IRuntimeExtensionTemplateData): void => {
				data.disposables = dispose(data.disposables);
			}
		};

		this._list = new WorkbenchList<IRuntimeExtension>(container, delegate, [renderer], {
			multipleSelectionSupport: false
		}, this._contextKeyService, this._listService, this.themeService);

		this._list.splice(0, this._list.length, this._elements);
	}

	public layout(dimension: Dimension): void {
		this._list.layout(dimension.height);
	}
}

export class RuntimeExtensionsInput extends EditorInput {

	static ID = 'workbench.runtimeExtensions.input';

	constructor() {
		super();
	}

	getTypeId(): string {
		return RuntimeExtensionsInput.ID;
	}

	getName(): string {
		return nls.localize('extensionsInputName', "Running Extensions");
	}

	matches(other: any): boolean {
		if (!(other instanceof RuntimeExtensionsInput)) {
			return false;
		}
		return true;
	}

	resolve(refresh?: boolean): TPromise<any> {
		return TPromise.as(null);
	}

	supportsSplitEditor(): boolean {
		return false;
	}

	getResource(): URI {
		return URI.from({
			scheme: 'runtime-extensions',
			path: 'default'
		});
	}
}

export class ShowRuntimeExtensionsAction extends Action {
	static ID = 'workbench.action.showRuntimeExtensions';
	static LABEL = nls.localize('showRuntimeExtensions', "Show Running Extensions");

	constructor(
		id: string, label: string,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(e?: any): TPromise<any> {
		return this._editorService.openEditor(this._instantiationService.createInstance(RuntimeExtensionsInput));
	}
}
