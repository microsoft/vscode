/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import Severity from '../../../../base/common/severity.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';
import { TextSearchCompleteMessage, TextSearchCompleteMessageType } from '../../../services/search/common/searchExtTypes.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Schemas } from '../../../../base/common/network.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { URI } from '../../../../base/common/uri.js';

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
