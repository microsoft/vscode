/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { parseLinkedText } from 'vs/base/common/linkedText';
import Severity from 'vs/base/common/severity';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { SeverityIcon } from 'vs/platform/severityIcon/browser/severityIcon';
import { TextSearchCompleteMessage, TextSearchCompleteMessageType } from 'vs/workbench/services/search/common/searchExtTypes';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Schemas } from 'vs/base/common/network';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Link } from 'vs/platform/opener/browser/link';
import { URI } from 'vs/base/common/uri';

export const renderSearchMessage = (
	message: TextSearchCompleteMessage,
	instantiationService: IInstantiationService,
	notificationService: INotificationService,
	openerService: IOpenerService,
	commandService: ICommandService,
	disposableStore: DisposableStore,
	triggerSearch: () => void,
): HTMLElement => {
	const div = dom.$('div.providerMessage');
	const linkedText = parseLinkedText(message.text);
	dom.append(div,
		dom.$('.' +
			SeverityIcon.className(
				message.type === TextSearchCompleteMessageType.Information
					? Severity.Info
					: Severity.Warning)
				.split(' ')
				.join('.')));

	for (const node of linkedText.nodes) {
		if (typeof node === 'string') {
			dom.append(div, document.createTextNode(node));
		} else {
			const link = instantiationService.createInstance(Link, div, node, {
				opener: async href => {
					if (!message.trusted) { return; }
					const parsed = URI.parse(href, true);
					if (parsed.scheme === Schemas.command && message.trusted) {
						const result = await commandService.executeCommand(parsed.path);
						if ((result as any)?.triggerSearch) {
							triggerSearch();
						}
					} else if (parsed.scheme === Schemas.https) {
						openerService.open(parsed);
					} else {
						if (parsed.scheme === Schemas.command && !message.trusted) {
							notificationService.error(nls.localize('unable to open trust', "Unable to open command link from untrusted source: {0}", href));
						} else {
							notificationService.error(nls.localize('unable to open', "Unable to open unknown link: {0}", href));
						}
					}
				}
			});
			disposableStore.add(link);
		}
	}
	return div;
};
