/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationNode, IConfigurationRegistry, Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import * as nls from '../../../../nls.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { defaultExternalUriOpenerId } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export { defaultExternalUriOpenerId };

export const externalUriOpenersSettingId = 'workbench.externalUriOpeners';

export interface ExternalUriOpenersConfiguration {
	readonly [uriGlob: string]: string;
}

const externalUriOpenerIdSchemaAddition: IJSONSchema = {
	type: 'string',
	enum: []
};

const exampleUriPatterns = `
- \`https://microsoft.com\`: Matches this specific domain using https
- \`https://microsoft.com:8080\`: Matches this specific domain on this port using https
- \`https://microsoft.com:*\`: Matches this specific domain on any port using https
- \`https://microsoft.com/foo\`: Matches \`https://microsoft.com/foo\` and \`https://microsoft.com/foo/bar\`, but not \`https://microsoft.com/foobar\` or \`https://microsoft.com/bar\`
- \`https://*.microsoft.com\`: Match all domains ending in \`microsoft.com\` using https
- \`microsoft.com\`: Match this specific domain using either http or https
- \`*.microsoft.com\`: Match all domains ending in \`microsoft.com\` using either http or https
- \`http://192.168.0.1\`: Matches this specific IP using http
- \`http://192.168.0.*\`: Matches all IP's with this prefix using http
- \`*\`: Match all domains using either http or https`;

export const externalUriOpenersConfigurationNode: IConfigurationNode = {
	...workbenchConfigurationNodeBase,
	properties: {
		[externalUriOpenersSettingId]: {
			type: 'object',
			markdownDescription: nls.localize('externalUriOpeners', "Configure the opener to use for external URIs (http, https)."),
			defaultSnippets: [{
				body: {
					'example.com': '$1'
				}
			}],
			additionalProperties: {
				anyOf: [
					{
						type: 'string',
						markdownDescription: nls.localize('externalUriOpeners.uri', "Map URI pattern to an opener id.\nExample patterns: \n{0}", exampleUriPatterns),
					},
					{
						type: 'string',
						markdownDescription: nls.localize('externalUriOpeners.uri', "Map URI pattern to an opener id.\nExample patterns: \n{0}", exampleUriPatterns),
						enum: [defaultExternalUriOpenerId],
						enumDescriptions: [nls.localize('externalUriOpeners.defaultId', "Open using VS Code's standard opener.")],
					},
					externalUriOpenerIdSchemaAddition
				]
			}
		}
	}
};

interface IBuiltInOpener {
	readonly description: string;
	readonly alternateIds: readonly string[];
}

const builtInOpeners = new Map<string, IBuiltInOpener>();
let contributedOpenerIds: string[] = [];
let contributedOpenerDescriptions: string[] = [];

function refreshOpenerSchema(): void {
	const alternateIds = new Set([...builtInOpeners.values()].flatMap(opener => opener.alternateIds));
	const contributed = contributedOpenerIds.map((id, i) => ({ id, description: contributedOpenerDescriptions[i] })).filter(opener => !alternateIds.has(opener.id));
	externalUriOpenerIdSchemaAddition.enum = [...builtInOpeners.keys(), ...contributed.map(opener => opener.id)];
	externalUriOpenerIdSchemaAddition.enumDescriptions = [...[...builtInOpeners.values()].map(opener => opener.description), ...contributed.map(opener => opener.description)];

	Registry.as<IConfigurationRegistry>(Extensions.Configuration)
		.notifyConfigurationSchemaUpdated(externalUriOpenersConfigurationNode);
}

export function updateContributedOpeners(enumValues: string[], enumDescriptions: string[]): void {
	contributedOpenerIds = enumValues;
	contributedOpenerDescriptions = enumDescriptions;
	refreshOpenerSchema();
}

/**
 * Lists a workbench opener, which is not contributed by an extension, as a value of the opener setting.
 * Contributed openers in `alternateIds` stay usable in settings but are no longer offered, because this opener replaces them.
 */
export function registerBuiltInExternalUriOpener(id: string, description: string, alternateIds: readonly string[] = []): IDisposable {
	builtInOpeners.set(id, { description, alternateIds });
	refreshOpenerSchema();
	return toDisposable(() => {
		builtInOpeners.delete(id);
		refreshOpenerSchema();
	});
}
