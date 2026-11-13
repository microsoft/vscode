/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { isLayoutOverridableSetting } from '../../../services/configuration/common/configuration.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { IContributedNamedLayout, INamedLayoutsService } from '../../../services/namedLayouts/common/namedLayouts.js';
import { namedLayoutContributionSchema, parseNamedLayoutDefinition } from '../common/namedLayoutDefinition.js';

const layoutsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IStringDictionary<unknown>[]>({
	extensionPoint: 'layouts',
	jsonSchema: {
		markdownDescription: localize('vscode.extension.contributes.layouts', "Contributes layouts of the window. A layout arranges the side bars, the panel, view containers, views and editor groups, and can define layout related settings. Aspects a layout does not specify are taken from the default layout. Requires the `windowLayouts` API proposal."),
		type: 'array',
		items: namedLayoutContributionSchema
	}
});

/**
 * Passes the layouts that extensions contribute to the named layouts service.
 */
export class NamedLayoutsExtensionPointContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.namedLayoutsExtensionPoint';

	private contributedLayouts: IContributedNamedLayout[] = [];

	constructor(
		@INamedLayoutsService namedLayoutsService: INamedLayoutsService,
		@IExtensionService extensionService: IExtensionService
	) {
		super();

		this._register(layoutsExtensionPoint.setHandler(extensions => {
			const contributedLayouts: IContributedNamedLayout[] = [];
			for (const { description, value, collector } of extensions) {
				if (!isProposedApiEnabled(description, 'windowLayouts')) {
					collector.error(localize('layouts.proposedApi', "The '{0}' contribution point is proposed API. Add 'windowLayouts' to 'enabledApiProposals' to use it.", layoutsExtensionPoint.name));
					continue;
				}
				if (!Array.isArray(value)) {
					collector.error(localize('layouts.notAnArray', "'contributes.{0}' must be an array.", layoutsExtensionPoint.name));
					continue;
				}

				const ids = new Set<string>();
				for (const candidate of value) {
					const id = isObject(candidate) ? candidate.id : undefined;
					const label = isObject(candidate) ? candidate.label : undefined;
					if (typeof id !== 'string' || !id || typeof label !== 'string' || !label) {
						collector.error(localize('layouts.missingIdOrLabel', "A layout must have a non-empty 'id' and 'label'."));
						continue;
					}
					if (ids.has(id)) {
						collector.error(localize('layouts.duplicateId', "The extension contributes more than one layout with the id '{0}'.", id));
						continue;
					}
					ids.add(id);

					const { definition, problems } = parseNamedLayoutDefinition(candidate, isLayoutOverridableSetting);
					for (const problem of problems) {
						collector.warn(localize('layouts.problem', "Layout '{0}': {1}", id, problem));
					}
					if (candidate.locked !== undefined && typeof candidate.locked !== 'boolean') {
						collector.warn(localize('layouts.invalidLocked', "Layout '{0}': The value of 'locked' is invalid and ignored.", id));
					}

					contributedLayouts.push({
						extensionId: description.identifier.value,
						extensionName: description.displayName || description.name,
						id,
						label,
						locked: candidate.locked === true,
						definition
					});
				}
			}

			this.contributedLayouts = contributedLayouts;
			namedLayoutsService.setContributedLayouts(contributedLayouts);
		}));

		// The handler is not called if no extension contributes layouts
		extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (!this._store.isDisposed) {
				namedLayoutsService.setContributedLayouts(this.contributedLayouts);
			}
		});
	}
}

class LayoutsDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.layouts?.length;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const layouts = manifest.contributes?.layouts ?? [];
		const rows: IRowData[][] = layouts.map(layout => [
			new MarkdownString().appendMarkdown(`\`${layout.id}\``),
			layout.label,
			layout.locked === true ? localize('layouts.lockedYes', "Yes") : ''
		]);

		return {
			data: {
				headers: [localize('layouts.idHeader', "ID"), localize('layouts.labelHeader', "Label"), localize('layouts.lockedHeader', "Locked")],
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'layouts',
	label: localize('layouts', "Layouts"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(LayoutsDataRenderer),
});
