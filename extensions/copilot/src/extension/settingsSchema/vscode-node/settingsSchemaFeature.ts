/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { globalConfigRegistry } from '../../../platform/configuration/common/configurationService';
import { JsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorunWithStore, IReader, observableFromEvent } from '../../../util/vs/base/common/observable';
import { VirtualTextDocumentProvider } from '../../inlineEdits/vscode-node/utils/virtualTextDocumentProvider';

export class SettingsSchemaFeature extends Disposable {
	private readonly _copilotToken = observableFromEvent(this, this._authenticationService.onDidAuthenticationChange, () => this._authenticationService.copilotToken);
	private readonly _isInternal = this._copilotToken.map(t => !!(t?.isInternal));

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			const p = store.add(new VirtualTextDocumentProvider('ccsettings'));
			const doc = p.createDocumentForUri(Uri.parse('ccsettings://root/schema.json'));
			const schema = this._getSchema(reader);
			doc.setContent(JSON.stringify(schema));
		}));
	}

	private _getSchema(reader: IReader): JsonSchema {
		const props: Record<string, JsonSchema> = {};

		if (!this._isInternal.read(reader)) {
			return {};
		} else {
			// JSON Schema only for internal users!
			for (const c of globalConfigRegistry.configs.values()) {
				props[c.fullyQualifiedId] = { description: 'Recognized Advanced Setting.\nIgnore the warning "Unknown Configuration Setting", which cannot be surpressed.', ... (c.validator ? c.validator.toSchema() : {}) };
			}

			const schema: JsonSchema = {
				type: 'object',
				properties: props,
				patternProperties: {
					'github\.copilot(\.chat)?\.advanced\..*': {
						deprecated: true,
						description: 'Unknown advanced setting.\nIf you believe this is a supported setting, please file an issue so that it gets registered.',
					}
				}
			};
			return schema;
		}
	}
}
