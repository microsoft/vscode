/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { CancellationToken } from 'vscode';
import {
	getClaudeSlashCommandRegistry,
	IClaudeSlashCommandHandler,
	IClaudeSlashCommandHandlerCtor,
	registerClaudeSlashCommand,
} from '../claudeSlashCommandRegistry';

describe('claudeSlashCommandRegistry', () => {
	// Store original registry length to detect changes
	let originalRegistryLength: number;

	beforeEach(() => {
		originalRegistryLength = getClaudeSlashCommandRegistry().length;
	});

	describe('registerClaudeSlashCommand', () => {
		it('registers a handler to the registry', () => {
			class TestHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'testRegister';
				readonly description = 'A test command';
				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			registerClaudeSlashCommand(TestHandler);

			const registry = getClaudeSlashCommandRegistry();
			expect(registry.length).toBe(originalRegistryLength + 1);
			expect(registry.includes(TestHandler)).toBe(true);
		});

		it('registers a handler with optional commandId', () => {
			class TestHandlerWithId implements IClaudeSlashCommandHandler {
				readonly commandName = 'testWithId';
				readonly description = 'A test command with ID';
				readonly commandId = 'copilot.claude.testWithId';
				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			registerClaudeSlashCommand(TestHandlerWithId);

			const registry = getClaudeSlashCommandRegistry();
			expect(registry.length).toBe(originalRegistryLength + 1);
			expect(registry.includes(TestHandlerWithId)).toBe(true);
		});

		it('allows registering multiple handlers', () => {
			class Handler1 implements IClaudeSlashCommandHandler {
				readonly commandName = 'multi1';
				readonly description = 'Handler 1';
				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			class Handler2 implements IClaudeSlashCommandHandler {
				readonly commandName = 'multi2';
				readonly description = 'Handler 2';
				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			registerClaudeSlashCommand(Handler1);
			registerClaudeSlashCommand(Handler2);

			const registry = getClaudeSlashCommandRegistry();
			expect(registry.length).toBe(originalRegistryLength + 2);
			expect(registry.includes(Handler1)).toBe(true);
			expect(registry.includes(Handler2)).toBe(true);
		});

		it('preserves registration order', () => {
			class FirstHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'first';
				readonly description = 'First handler';
				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			class SecondHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'second';
				readonly description = 'Second handler';
				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			registerClaudeSlashCommand(FirstHandler);
			registerClaudeSlashCommand(SecondHandler);

			const registry = getClaudeSlashCommandRegistry();
			expect(registry[originalRegistryLength]).toBe(FirstHandler);
			expect(registry[originalRegistryLength + 1]).toBe(SecondHandler);
		});
	});

	describe('getClaudeSlashCommandRegistry', () => {
		it('returns an array', () => {
			const registry = getClaudeSlashCommandRegistry();
			expect(Array.isArray(registry)).toBe(true);
		});

		it('returns consistent results on multiple calls', () => {
			const registry1 = getClaudeSlashCommandRegistry();
			const registry2 = getClaudeSlashCommandRegistry();
			expect(registry1).toBe(registry2);
		});

		it('returns a readonly array', () => {
			const registry = getClaudeSlashCommandRegistry();
			// TypeScript enforces readonly at compile time, but at runtime
			// the array is still technically mutable. This test verifies
			// the return type contract exists.
			expect(typeof registry.length).toBe('number');
			expect(typeof registry[Symbol.iterator]).toBe('function');
		});
	});

	describe('IClaudeSlashCommandHandler interface', () => {
		it('allows handlers with required properties only', () => {
			class MinimalHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'minimal';
				readonly description = 'Minimal handler';
				async handle(
					_args: string,
					_stream: vscode.ChatResponseStream | undefined,
					_token: CancellationToken
				): Promise<vscode.ChatResult> {
					return {};
				}
			}

			const handler: IClaudeSlashCommandHandler = new MinimalHandler();
			expect(handler.commandName).toBe('minimal');
			expect(handler.description).toBe('Minimal handler');
			expect(handler.commandId).toBeUndefined();
		});

		it('allows handlers with optional commandId', () => {
			class HandlerWithId implements IClaudeSlashCommandHandler {
				readonly commandName = 'withCommandId';
				readonly description = 'Handler with command ID';
				readonly commandId = 'copilot.claude.withCommandId';
				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			const handler = new HandlerWithId();
			expect(handler.commandId).toBe('copilot.claude.withCommandId');
		});

		it('handle method receives all parameters', async () => {
			let receivedArgs: string | undefined;
			let receivedStream: vscode.ChatResponseStream | undefined;
			let receivedToken: CancellationToken | undefined;

			class ParamHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'params';
				readonly description = 'Tests parameters';
				async handle(
					args: string,
					stream: vscode.ChatResponseStream | undefined,
					token: CancellationToken
				): Promise<vscode.ChatResult> {
					receivedArgs = args;
					receivedStream = stream;
					receivedToken = token;
					return { metadata: { success: true } };
				}
			}

			const handler = new ParamHandler();
			const mockToken: CancellationToken = {
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => { } }),
			};

			const result = await handler.handle('test args', undefined, mockToken);

			expect(receivedArgs).toBe('test args');
			expect(receivedStream).toBeUndefined();
			expect(receivedToken).toBe(mockToken);
			expect(result).toEqual({ metadata: { success: true } });
		});

		it('handle method can return void', async () => {
			class VoidHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'void';
				readonly description = 'Returns void';
				async handle(
					_args: string,
					_stream: vscode.ChatResponseStream | undefined,
					_token: CancellationToken
				): Promise<void> {
					// Returns void instead of ChatResult
				}
			}

			const handler = new VoidHandler();
			const mockToken: CancellationToken = {
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => { } }),
			};

			const result = await handler.handle('', undefined, mockToken);
			expect(result).toBeUndefined();
		});
	});

	describe('IClaudeSlashCommandHandlerCtor interface', () => {
		it('registered handler can be instantiated from registry', () => {
			class InstantiableHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'instantiable';
				readonly description = 'Can be instantiated';

				constructor(public readonly testValue?: string) { }

				async handle(): Promise<vscode.ChatResult> {
					return {};
				}
			}

			registerClaudeSlashCommand(InstantiableHandler);

			const registry = getClaudeSlashCommandRegistry();
			const HandlerCtor = registry.find(
				ctor => ctor === InstantiableHandler
			) as IClaudeSlashCommandHandlerCtor | undefined;

			expect(HandlerCtor).toBeDefined();

			const instance = new HandlerCtor!('test-value');
			expect(instance).toBeInstanceOf(InstantiableHandler);
			expect(instance.commandName).toBe('instantiable');
			expect((instance as InstantiableHandler).testValue).toBe('test-value');
		});

		it('supports handlers with dependency injection style constructors', () => {
			class DIHandler implements IClaudeSlashCommandHandler {
				readonly commandName = 'di';
				readonly description = 'DI-style handler';

				constructor(
					private readonly dep1: { value: string },
					private readonly dep2: number
				) { }

				async handle(): Promise<vscode.ChatResult> {
					return { metadata: { dep1: this.dep1.value, dep2: this.dep2 } };
				}
			}

			registerClaudeSlashCommand(DIHandler);

			const registry = getClaudeSlashCommandRegistry();
			const HandlerCtor = registry.find(
				ctor => ctor === DIHandler
			) as IClaudeSlashCommandHandlerCtor | undefined;

			expect(HandlerCtor).toBeDefined();

			const instance = new HandlerCtor!({ value: 'injected' }, 42) as DIHandler;
			expect(instance.commandName).toBe('di');
		});
	});
});
