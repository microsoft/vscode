/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export function usingErdosNotebooks(configurationService: IConfigurationService): boolean {
	const editorAssociations = configurationService.getValue<Record<string, string>>('workbench.editorAssociations') || {};
	return editorAssociations['*.ipynb'] === 'workbench.editor.erdosNotebook';
}
