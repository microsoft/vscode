/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { score } from '../../../../editor/common/languageSelector.js';
import { localize } from '../../../../nls.js';
import { ISubmenuItem, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ToggleTitleBarConfigAction } from '../../../browser/parts/titlebar/titlebarActions.js';
import { WorkspaceFolderCountContext } from '../../../common/contextkeys.js';
import { IShareProvider, IShareService, IShareableItem } from '../common/share.js';

export const ShareProviderCountContext = new RawContextKey<number>('shareProviderCount', 0, localize('shareProviderCount', "The number of available share providers"));

type ShareEvent = {
	providerId: string;
};
type ShareClassification = {
	owner: 'joyceerhl'; comment: 'Reporting which share provider is invoked.';
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the selected share provider.' };
};

export class ShareService implements IShareService {
	readonly _serviceBrand: undefined;

	readonly providerCount: IContextKey<number>;
	private readonly _providers = new Set<IShareProvider>();

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ILabelService private readonly labelService: ILabelService,
		@IQuickInputService private quickInputService: IQuickInputService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		this.providerCount = ShareProviderCountContext.bindTo(this.contextKeyService);
	}

	registerShareProvider(provider: IShareProvider): IDisposable {
		this._providers.add(provider);
		this.providerCount.set(this._providers.size);
		return {
			dispose: () => {
				this._providers.delete(provider);
				this.providerCount.set(this._providers.size);
			}
		};
	}

	getShareActions(): ISubmenuItem[] {
		// todo@joyceerhl return share actions
		return [];
	}

	async provideShare(item: IShareableItem, token: CancellationToken): Promise<URI | string | undefined> {
		const language = this.codeEditorService.getActiveCodeEditor()?.getModel()?.getLanguageId() ?? '';
		const providers = [...this._providers.values()]
			.filter((p) => score(p.selector, item.resourceUri, language, true, undefined, undefined) > 0)
			.sort((a, b) => a.priority - b.priority);

		if (providers.length === 0) {
			return undefined;
		}

		if (providers.length === 1) {
			this.telemetryService.publicLog2<ShareEvent, ShareClassification>('shareService.share', { providerId: providers[0].id });
			return providers[0].provideShare(item, token);
		}

		const items: (IQuickPickItem & { provider: IShareProvider })[] = providers.map((p) => ({ label: p.label, provider: p }));
		const selected = await this.quickInputService.pick(items, { canPickMany: false, placeHolder: localize('type to filter', 'Choose how to share {0}', this.labelService.getUriLabel(item.resourceUri)) }, token);

		if (selected !== undefined) {
			this.telemetryService.publicLog2<ShareEvent, ShareClassification>('shareService.share', { providerId: selected.provider.id });
			return selected.provider.provideShare(item, token);
		}

		return;
	}
}

registerAction2(class ToggleShareControl extends ToggleTitleBarConfigAction {
	constructor() {
		super('workbench.experimental.share.enabled', localize('toggle.share', 'Share'), localize('toggle.shareDescription', "Toggle visibility of the Share action in title bar"), 3, false, ContextKeyExpr.and(ContextKeyExpr.has('config.window.commandCenter'), ContextKeyExpr.and(ShareProviderCountContext.notEqualsTo(0), WorkspaceFolderCountContext.notEqualsTo(0))));
	}
});
