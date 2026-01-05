/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

export class WebWorkerDescriptor {
	public readonly esmModuleLocation: URI | (() => URI) | undefined;
	public readonly esmModuleLocationBundler: URL | (() => URL) | undefined;
	public readonly label: string;

	constructor(args: {
		/** The location of the esm module after transpilation */
		esmModuleLocation?: URI | (() => URI);
		/** The location of the esm module when used in a bundler environment. Refer to the typescript file in the src folder and use `?workerModule`. */
		esmModuleLocationBundler?: URL | (() => URL);
		label: string;
	}) {
		this.esmModuleLocation = args.esmModuleLocation;
		this.esmModuleLocationBundler = args.esmModuleLocationBundler;
		this.label = args.label;
	}
}
