/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { score } from 'vs/editor/common/languageSelector';
import { localize } from 'vs/nls';
import { ISubmenuItem } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ILabelService } from 'vs/platform/label/common/label';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IShareProvider, IShareService, IShareableItem } from 'vs/workbench/contrib/share/common/share';

export const ShareProviderCountContext = new RawContextKey<number>('shareProviderCount', 0, localize('shareProviderCount', "The number of available share providers"));

export class ShareService implements IShareService {
	readonly _serviceBrand: undefined;

	readonly providerCount: IContextKey<number>;
	private readonly _providers = new Set<IShareProvider>();

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ILabelService private readonly labelService: ILabelService,
		@IQuickInputService private quickInputService: IQuickInputService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
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
			return providers[0].provideShare(item, token);
		}

		const items: (IQuickPickItem & { provider: IShareProvider })[] = providers.map((p) => ({ label: p.label, provider: p }));
		const selected = await this.quickInputService.pick(items, { canPickMany: false, placeHolder: localize('type to filter', 'Choose how to share {0}', this.labelService.getUriLabel(item.resourceUri)) }, token);
		return selected?.provider.provideShare(item, token);
	}
}
