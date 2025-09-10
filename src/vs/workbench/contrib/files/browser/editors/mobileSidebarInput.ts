/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorSerializer } from '../../../../common/editor.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getActiveWindow } from '../../../../../base/browser/dom.js';

export const IMobileSidebarEditorInputService = createDecorator<IMobileSidebarEditorInputService>('mobileSidebarEditorInputService');

export interface IMobileSidebarEditorInputService {
	readonly _serviceBrand: undefined;
	getInstance(): MobileSidebarInput;
	isInMobileMode(): boolean;
	shouldAutoActivate(): boolean;
	getMobileBreakpoint(): number;
	setMobileMode(enabled: boolean): void;
}

export class MobileSidebarEditorInputService implements IMobileSidebarEditorInputService {
	readonly _serviceBrand: undefined;

	private instance: MobileSidebarInput | undefined;
	private mobileMode: boolean = false;
	private configurationService: IConfigurationService | undefined;

	constructor() {
		// Configuration service will be injected when registered
	}

	setConfigurationService(configService: IConfigurationService): void {
		this.configurationService = configService;
	}

	getInstance(): MobileSidebarInput {
		// Always create a fresh instance if the previous one was disposed
		if (!this.instance || this.instance.isDisposed()) {
			console.log('[MobileSidebarEditorInputService] Creating new MobileSidebarInput instance (previous was disposed or didn\'t exist)');
			this.instance = new MobileSidebarInput();
		}
		return this.instance;
	}

	isInMobileMode(): boolean {
		return this.mobileMode;
	}

	shouldAutoActivate(): boolean {
		const breakpoint = this.getMobileBreakpoint();
		const targetWindow = getActiveWindow();
		return targetWindow.innerWidth <= breakpoint;
	}

	getMobileBreakpoint(): number {
		if (this.configurationService) {
			return this.configurationService.getValue<number>('workbench.mobileSidebar.breakpoint') ?? 768;
		}
		return 768; // Default fallback
	}

	setMobileMode(enabled: boolean): void {
		this.mobileMode = enabled;
	}
}

export class MobileSidebarInput extends EditorInput {

	static readonly ID = 'workbench.editors.mobileSidebarInput';
	static readonly RESOURCE = URI.from({ scheme: 'mobile-sidebar', path: 'sidebar' });

	private _isDisposed = false;

	override get typeId(): string {
		return MobileSidebarInput.ID;
	}

	override get editorId(): string {
		// This must match MobileSidebarEditor.ID for VSCode to know which editor to use
		return 'workbench.editor.mobileSidebar';
	}

	override get resource(): URI {
		return MobileSidebarInput.RESOURCE;
	}

	override getName(): string {
		return localize('mobileSidebar', "Sidebar");
	}

	override getIcon(): ThemeIcon {
		return Codicon.layoutSidebarLeft;
	}

	override isDirty(): boolean {
		return false;
	}

	override isReadonly(): boolean {
		return true;
	}

	override matches(other: EditorInput): boolean {
		return other instanceof MobileSidebarInput;
	}

	override dispose(): void {
		console.log('[MobileSidebarInput] Disposed');
		this._isDisposed = true;
		super.dispose();
	}

	override isDisposed(): boolean {
		return this._isDisposed;
	}
}

export class MobileSidebarInputSerializer implements IEditorSerializer {

	canSerialize(_editor: EditorInput): boolean {
		return _editor instanceof MobileSidebarInput;
	}

	serialize(_editor: EditorInput): string {
		return JSON.stringify({});
	}

	deserialize(instantiationService: any): MobileSidebarInput {
		const service = instantiationService.invokeFunction((accessor: any) => {
			return accessor.get(IMobileSidebarEditorInputService);
		});
		return service.getInstance();
	}
}

registerSingleton(IMobileSidebarEditorInputService, MobileSidebarEditorInputService, InstantiationType.Delayed);
