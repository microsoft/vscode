/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ICanvasReference, ICanvasService, REVEAL_CANVAS_COMMAND_ID } from '../../common/canvas.js';
import { registerCanvasCommands } from '../../electron-browser/canvasCommands.js';

suite('CanvasCommands', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reveals the referenced canvas through the canvas service', async () => {
		const reference: ICanvasReference = {
			providerId: 'local/copilotcli',
			session: URI.parse('ahp-session:/42'),
			chat: URI.parse('ahp-session:/42/chats/main'),
			canvas: URI.parse('agent-host-canvas:/preview'),
		};
		const revealed: ICanvasReference[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICanvasService, upcastPartial<ICanvasService>({
			revealCanvas: async canvas => { revealed.push(canvas); },
		}));
		store.add(registerCanvasCommands());
		const command = CommandsRegistry.getCommand(REVEAL_CANVAS_COMMAND_ID);
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, reference));

		assert.deepStrictEqual(revealed, [reference]);
	});
});
