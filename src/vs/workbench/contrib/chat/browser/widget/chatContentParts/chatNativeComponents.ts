/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The seam between shared chat code and the renderer of native components.
 *
 * This module is part of every bundle that renders chat, including the size-constrained phone
 * bundle, so it only holds the contract and the registration point. The parser, the components
 * and their styles are contributed by the entries that render them. Do not import them here.
 */

import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { NATIVE_COMPONENTS_LANGUAGE_ID } from '../../../common/nativeComponents/nativeComponents.js';
import { getClosedCodeFenceInfo } from '../../../common/widget/codeFence.js';
import { EditorPool } from './chatContentCodePools.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { ICodeBlockData } from './codeBlockPart.js';

/** A native components block in a response, which shows either its visual or its source. */
export interface IChatNativeComponentsPart extends IDisposable {
	readonly element: HTMLElement;
	/** The resource of the source editor, by which Find and code block navigation address the block. */
	readonly uri: URI | undefined;
	readonly isFocused: boolean;
	hasSameContent(text: string, fenceInfo: string): boolean;
	layout(width: number): void;
	onDidRemount(): void;
	focus(): void;
	/** Shows the source without taking focus. Returns whether that changed the layout. */
	reveal(): boolean;
}

export interface IChatNativeComponentsRenderer {
	/**
	 * Creates the part of a block whose closing fence has arrived.
	 * @param fenceInfo The info string of the opening fence, which may declare a schema version.
	 */
	createPart(instantiationService: IInstantiationService, data: ICodeBlockData, fenceInfo: string, context: IChatContentPartRenderContext, editorPool: EditorPool, onDidChangeHeight: () => void): IChatNativeComponentsPart;
	/** Returns the text alternative of a block that renders as a visual, or `undefined` for one that shows its source. */
	describe(source: string, fenceInfo: string): string | undefined;
}

let registeredRenderer: IChatNativeComponentsRenderer | undefined;

/** Contributes the renderer. Entries that do not, such as the phone bundle, show these blocks as source. */
export function registerChatNativeComponentsRenderer(renderer: IChatNativeComponentsRenderer): IDisposable {
	registeredRenderer = renderer;
	return toDisposable(() => {
		if (registeredRenderer === renderer) {
			registeredRenderer = undefined;
		}
	});
}

/**
 * Returns the renderer when native components are available and enabled. A chat surface must also
 * opt in with its `renderNativeComponents` renderer option before it uses one.
 */
export function getChatNativeComponentsRenderer(configurationService: IConfigurationService): IChatNativeComponentsRenderer | undefined {
	const isEnabled = configurationService.getValue<boolean>(ChatConfiguration.NativeComponentsEnabled) === true
		&& configurationService.getValue<boolean>(ChatAIDisabledSettingId) !== true;
	return isEnabled ? registeredRenderer : undefined;
}

/** Returns the fence info string of a native components block whose closing fence has arrived, or `undefined` for any other code block. */
export function getNativeComponentsFenceInfo(languageId: string, raw: string | undefined): string | undefined {
	return languageId.toLowerCase() === NATIVE_COMPONENTS_LANGUAGE_ID ? getClosedCodeFenceInfo(raw) : undefined;
}
