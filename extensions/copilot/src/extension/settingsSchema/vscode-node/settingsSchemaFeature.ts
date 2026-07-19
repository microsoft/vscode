/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { globalConfigRegistry } from '../../../platform/configuration/common/configurationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorunWithStore, observableFromEvent } from '../../../util/vs/base/common/observable';
import { VirtualTextDocumentProvider } from '../../inlineEdits/vscode-node/utils/virtualTextDocumentProvider';
import { buildSettingsSchema } from '../common/settingsSchema';

export class SettingsSchemaFeature extends Disposable {
	private readonly _copilotToken = observableFromEvent(this, this._authenticationService.onDidCopilotTokenChange, () => this._authenticationService.copilotToken);
	private readonly _isInternal = this._copilotToken.map(t => !!(t?.isInternal));

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			const p = store.add(new VirtualTextDocumentProvider('ccsettings'));
			const doc = p.createDocumentForUri(Uri.parse('ccsettings://root/schema.json'));
			const schema = buildSettingsSchema(this._isInternal.read(reader), globalConfigRegistry.configs.values());
			doc.setContent(JSON.stringify(schema));
		}));
	}
}
