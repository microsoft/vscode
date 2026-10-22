/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { OS } from '../../../../base/common/platform.js';
import { CommandsRegistry } from '../../../commands/common/commands.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { KeybindingResolver, ResultKind } from '../../../keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../keybinding/common/usLayoutResolvedKeybinding.js';

/** Routes the real action-widget keybindings in tests and fixtures without a workbench keybinding service. */
export function registerActionWidgetTestKeybindings(container: HTMLElement, contextKeyService: IContextKeyService, instantiationService: IInstantiationService) {
	const commands = new Set(['hideCodeActionWidget', 'clearFilterCodeActionWidget', 'selectPrevCodeAction', 'selectNextCodeAction', 'toggleSectionCodeAction', 'acceptSelectedCodeAction']);
	const bindings = KeybindingsRegistry.getDefaultKeybindingsForOS(OS).filter(item => item.command && commands.has(item.command) && item.keybinding).map(item =>
		new ResolvedKeybindingItem(USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding!, OS)[0], item.command, item.commandArgs, item.when ?? undefined, true, null, false));
	const resolver = new KeybindingResolver(bindings, [], () => { });
	return dom.addStandardDisposableListener(container, 'keydown', event => {
		if (event.browserEvent.defaultPrevented || event.browserEvent.isComposing) {
			return;
		}
		const chord = new USLayoutResolvedKeybinding([event.toKeyCodeChord()], OS).getDispatchChords()[0];
		if (!chord) {
			return;
		}
		const result = resolver.resolve({ getValue: key => contextKeyService.getContextKeyValue(key) }, [], chord);
		if (result.kind === ResultKind.KbFound && result.commandId) {
			dom.EventHelper.stop(event, true);
			instantiationService.invokeFunction(CommandsRegistry.getCommand(result.commandId)!.handler);
		}
	});
}
