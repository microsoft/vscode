/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';

export enum ViewsWelcomeExtensionPointFields {
	view = 'view',
	contents = 'contents',
	when = 'when',
}

export interface ViewWelcome {
	readonly [ViewsWelcomeExtensionPointFields.view]: string;
	readonly [ViewsWelcomeExtensionPointFields.contents]: string;
	readonly [ViewsWelcomeExtensionPointFields.when]: string;
}

export type ViewsWelcomeExtensionPoint = ViewWelcome[];

const viewsWelcomeExtensionPointSchema = Object.freeze<IConfigurationPropertySchema>({
	type: 'array',
	description: nls.localize('contributes.viewsWelcome', "Contributed views welcome content."),
	items: {
		type: 'object',
		description: nls.localize('contributes.viewsWelcome.view', "Contributed welcome content for a specific view."),
		required: [
			ViewsWelcomeExtensionPointFields.view,
			ViewsWelcomeExtensionPointFields.contents
		],
		properties: {
			[ViewsWelcomeExtensionPointFields.view]: {
				type: 'string',
				description: nls.localize('contributes.viewsWelcome.view.view', "View identifier for this welcome content."),
			},
			[ViewsWelcomeExtensionPointFields.contents]: {
				type: 'string',
				description: nls.localize('contributes.viewsWelcome.view.contents', "Welcome content."),
			},
			[ViewsWelcomeExtensionPointFields.when]: {
				type: 'string',
				description: nls.localize('contributes.viewsWelcome.view.when', "When clause for this welcome content."),
			},
		}
	}
});

export const viewsWelcomeExtensionPointDescriptor = {
	extensionPoint: 'viewsWelcome',
	jsonSchema: viewsWelcomeExtensionPointSchema
};
