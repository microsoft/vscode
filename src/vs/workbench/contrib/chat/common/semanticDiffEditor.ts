/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ISemanticDiffReport } from '../../../../platform/agentHost/common/semanticDiff.js';
import { ISemanticDiffResolvedFile } from '../../../../platform/agentHost/common/semanticDiffProjection.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const SemanticDiffCardMenu = new MenuId('ChatSemanticDiffCard');
export const OpenSemanticDiffEditorCommandId = 'workbench.action.chat.openSemanticDiffEditor';

/** View-owned identity, never model-authored navigation instructions. */
export interface ISemanticDiffCardSource {
	readonly sessionResource: URI;
	readonly responseId: string;
	readonly toolCallId: string;
}

export interface ISemanticDiffEditorRequest extends ISemanticDiffCardSource {
	readonly groupId: string;
	readonly report: ISemanticDiffReport;
	readonly repositoryUri?: string;
}

export interface ISemanticDiffEditorSource {
	readonly repository: URI;
	readonly files: readonly ISemanticDiffResolvedFile[];
}

export const ISemanticDiffSourceResolverService = createDecorator<ISemanticDiffSourceResolverService>('semanticDiffSourceResolverService');

/** Resolves verified, immutable source for a group without running another model or changing the checkout. */
export interface ISemanticDiffSourceResolverService {
	readonly _serviceBrand: undefined;
	resolve(request: ISemanticDiffEditorRequest, token: CancellationToken): Promise<ISemanticDiffEditorSource>;
}
