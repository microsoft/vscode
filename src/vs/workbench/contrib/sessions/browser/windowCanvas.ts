/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ITransaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICanvasWorkingSets } from '../../canvases/common/canvas.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities, GroupIdentifier, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';

export interface IWindowCanvas extends IDisposable {
	render(container: HTMLElement): void;
	layout(width: number, height: number): void;
	focus(): void;
	setVisible(visible: boolean): void;
	openNewSession?(): Promise<void>;
}

export interface IWindowCanvasDescriptor {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly ctor: SyncDescriptor<IWindowCanvas>;
	/** Retain this canvas's focused control across background working-set replacement. Defaults to false. */
	readonly retainFocusOnRestore?: boolean;
}

export interface IWindowCanvasPresentation {
	readonly element: HTMLElement;
	readonly content: IWindowCanvas;
}

export interface IWindowCanvasOpenRequest {
	readonly id: string;
	readonly source: 'explicit' | 'history';
}

export const IWindowCanvasService = createDecorator<IWindowCanvasService>('windowCanvasService');

/** Native canvases belong to the window, not to an agent, session, or chat. */
export interface IWindowCanvasService {
	readonly _serviceBrand: undefined;
	readonly canvases: IObservable<readonly IWindowCanvasDescriptor[]>;
	readonly activeCanvasId: IObservable<string | undefined>;
	/** Foreground navigation intent; background restoration does not publish a request. */
	readonly navigationRequest: IObservable<IWindowCanvasOpenRequest | undefined>;
	/** The committed canvas destination, independent of which editor remains visible beside a session. */
	readonly activeCanvasOpen: IObservable<IWindowCanvasOpenRequest | undefined>;
	registerCanvas(descriptor: IWindowCanvasDescriptor): IDisposable;
	openCanvas(id: string, options?: { readonly source?: 'history' }): Promise<void>;
	cancelPendingOpen(): void;
	/** Leave canvas navigation without closing its tab or disposing its retained content. */
	deactivateCanvas(tx?: ITransaction): void;
	closeCanvas(id: string): Promise<void>;
	getPresentation(input: WindowCanvasInput): IWindowCanvasPresentation;
	openNewSession(): Promise<void> | undefined;
	connectWorkingSets(workingSets: ICanvasWorkingSets): IDisposable;
}

export class WindowCanvasInput extends EditorInput {
	static readonly ID = 'sessions.editorInput.windowCanvas';
	static readonly EDITOR_ID = 'sessions.editor.windowCanvas';
	readonly resource: URI;

	constructor(
		readonly descriptor: IWindowCanvasDescriptor,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super();
		this.resource = URI.from({ scheme: Schemas.vscodeWindowCanvas, path: `/${descriptor.id}` });
	}

	override get typeId(): string { return WindowCanvasInput.ID; }
	override get editorId(): string { return WindowCanvasInput.EDITOR_ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal; }
	override getName(): string { return this.descriptor.title; }
	override getIcon(): ThemeIcon { return this.descriptor.icon; }
	override canMove(_source: GroupIdentifier, target: GroupIdentifier): true | string {
		return this.editorGroupsService.getGroup(target)?.windowId === this.editorGroupsService.mainPart.windowId
			? true
			: WindowCanvasInput.getMainWindowOnlyMessage();
	}
	override canMoveToNewWindow(_source: GroupIdentifier): true | string {
		return WindowCanvasInput.getMainWindowOnlyMessage(); // a new window is never the main window
	}
	private static getMainWindowOnlyMessage(): string {
		return localize('windowCanvas.mainWindowOnly', "This canvas can only be shown in the main window.");
	}
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof WindowCanvasInput ? other.descriptor.id === this.descriptor.id : super.matches(other);
	}
}
