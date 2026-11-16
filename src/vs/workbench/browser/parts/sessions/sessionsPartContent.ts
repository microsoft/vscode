/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { BrandedService, IConstructorSignature } from '../../../../platform/instantiation/common/instantiation.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';

/**
 * How the Sessions part lays out its content.
 */
export interface ISessionsPartContentLayout {
	/** Whether the window uses the phone layout. */
	readonly phoneLayout: boolean;
	/** The gap between the content's views, or `undefined` for the content's default. */
	readonly gap: number | undefined;
}

/**
 * What the Sessions part offers the content it shows.
 */
export interface ISessionsPartContentHost {
	/** Lays the part out again with its last dimensions, such as after the content changed what it shows. */
	requestLayout(): void;
}

/**
 * What a window shows inside the card of the Sessions part. The part creates the content in its constructor, renders
 * and lays it out, and disposes it with itself.
 */
export interface ISessionsPartContent extends IDisposable {
	/** Paints what shows behind the content, such as the chat background. Called once, before {@link render}. */
	renderBackground?(partContainer: HTMLElement): void;
	/** Renders the content into the part's content area. Called once, after the part's progress bar was added. */
	render(contentArea: HTMLElement): void;
	layout(width: number, height: number, top: number, left: number, options: ISessionsPartContentLayout): void;
	/** Whether the content may render: the part is visible and its host allows the content to show. */
	setVisible(visible: boolean): void;
	updateStyles(theme: IColorTheme): void;
}

/**
 * A kind of content the Sessions part can show. The window hosting the part names the kind to show.
 */
export interface ISessionsPartContentDescriptor {
	readonly id: string;
	readonly ctor: IConstructorSignature<ISessionsPartContent, [ISessionsPartContentHost]>;
}

export interface ISessionsPartContentRegistry {
	/**
	 * Registers a kind of content. Throws when a kind with the same id is registered. Disposing the result
	 * unregisters the kind; parts that already show it keep their content.
	 */
	register<Services extends BrandedService[]>(descriptor: { readonly id: string; readonly ctor: new (host: ISessionsPartContentHost, ...services: Services) => ISessionsPartContent }): IDisposable;
	get(id: string): ISessionsPartContentDescriptor | undefined;
}

/**
 * The kinds of content the Sessions part can show. Defining it registers nothing: windows register their kinds from
 * their own registration modules.
 */
export const SessionsPartContentRegistry: ISessionsPartContentRegistry = new class implements ISessionsPartContentRegistry {

	private readonly descriptors = new Map<string, ISessionsPartContentDescriptor>();

	register<Services extends BrandedService[]>(descriptor: { readonly id: string; readonly ctor: new (host: ISessionsPartContentHost, ...services: Services) => ISessionsPartContent }): IDisposable {
		if (this.descriptors.has(descriptor.id)) {
			throw new Error(`Sessions part content '${descriptor.id}' is already registered`);
		}
		const registered: ISessionsPartContentDescriptor = { id: descriptor.id, ctor: descriptor.ctor as IConstructorSignature<ISessionsPartContent, [ISessionsPartContentHost]> };
		this.descriptors.set(descriptor.id, registered);
		return toDisposable(() => {
			if (this.descriptors.get(descriptor.id) === registered) {
				this.descriptors.delete(descriptor.id);
			}
		});
	}

	get(id: string): ISessionsPartContentDescriptor | undefined {
		return this.descriptors.get(id);
	}
};
