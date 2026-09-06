/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILabelService } from '../../../../platform/label/common/label.js';

export interface IResourceLabelHome {
	readonly uri: URI;
	readonly label: string;
}

export class ResourceLabelHomeStore extends Disposable {

	private readonly registrations = this._register(new DisposableMap<string>());

	constructor(
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();
	}

	set(homes: readonly IResourceLabelHome[]): void {
		const keyFor = (home: IResourceLabelHome) => `${getComparisonKey(home.uri)}\0${home.label}`;
		const homeKeys = new Set(homes.map(keyFor));
		for (const home of homes) {
			const key = keyFor(home);
			if (!this.registrations.has(key)) {
				this.registrations.set(key, this.labelService.registerFormatter({
					scheme: home.uri.scheme,
					authority: home.uri.authority || undefined,
					home: home.uri.path,
					priority: true,
					formatting: {
						label: home.label,
						separator: this.labelService.getSeparator(home.uri.scheme, home.uri.authority),
					},
				}));
			}
		}
		for (const [key] of this.registrations) {
			if (!homeKeys.has(key)) {
				this.registrations.deleteAndDispose(key);
			}
		}
	}
}
