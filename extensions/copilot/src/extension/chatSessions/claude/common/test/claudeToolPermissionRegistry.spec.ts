/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClaudeToolPermissionResult, IClaudeToolPermissionHandler } from '../claudeToolPermission';
import { getToolPermissionHandlerRegistry, registerToolPermissionHandler } from '../claudeToolPermissionRegistry';
import { ClaudeToolNames } from '../claudeTools';

// Import handlers to ensure they're registered
import '../toolPermissionHandlers/index';

describe('claudeToolPermissionRegistry', () => {
	// Store original registry length to detect changes
	let originalRegistryLength: number;

	beforeEach(() => {
		originalRegistryLength = getToolPermissionHandlerRegistry().length;
	});

	afterEach(() => {
		// Note: Since the registry is a module-level array, registrations persist.
		// Tests should account for this by checking relative changes.
	});

	describe('registerToolPermissionHandler', () => {
		it('registers a handler for a single tool', () => {
			class TestHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.Glob> {
				readonly toolNames = [ClaudeToolNames.Glob] as const;
			}

			registerToolPermissionHandler([ClaudeToolNames.Glob], TestHandler);

			const registry = getToolPermissionHandlerRegistry();
			expect(registry.length).toBe(originalRegistryLength + 1);

			const lastRegistration = registry[registry.length - 1];
			expect(lastRegistration.toolNames).toEqual([ClaudeToolNames.Glob]);
			expect(lastRegistration.ctor).toBe(TestHandler);
		});

		it('registers a handler for multiple tools', () => {
			class MultiToolHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.Read | ClaudeToolNames.LS> {
				readonly toolNames = [ClaudeToolNames.Read, ClaudeToolNames.LS] as const;
			}

			registerToolPermissionHandler([ClaudeToolNames.Read, ClaudeToolNames.LS], MultiToolHandler);

			const registry = getToolPermissionHandlerRegistry();
			const lastRegistration = registry[registry.length - 1];
			expect(lastRegistration.toolNames).toEqual([ClaudeToolNames.Read, ClaudeToolNames.LS]);
		});

		it('allows registering handlers with custom methods', () => {
			class CustomHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.Grep> {
				readonly toolNames = [ClaudeToolNames.Grep] as const;

				async canAutoApprove(): Promise<boolean> {
					return true;
				}

				getConfirmationParams() {
					return {
						title: 'Test',
						message: 'Test message'
					};
				}

				async handle(): Promise<ClaudeToolPermissionResult> {
					return { behavior: 'allow', updatedInput: {} };
				}
			}

			registerToolPermissionHandler([ClaudeToolNames.Grep], CustomHandler);

			const registry = getToolPermissionHandlerRegistry();
			const lastRegistration = registry[registry.length - 1];
			expect(lastRegistration.ctor).toBe(CustomHandler);
		});
	});

	describe('getToolPermissionHandlerRegistry', () => {
		it('returns a readonly array', () => {
			const registry = getToolPermissionHandlerRegistry();
			expect(Array.isArray(registry)).toBe(true);
		});

		it('returns consistent results on multiple calls', () => {
			const registry1 = getToolPermissionHandlerRegistry();
			const registry2 = getToolPermissionHandlerRegistry();
			expect(registry1).toBe(registry2);
		});

		it('contains registrations from imported handlers', () => {
			// Handlers are imported at module level above
			const registry = getToolPermissionHandlerRegistry();

			// Should have at least the Bash and ExitPlanMode handlers
			const hasBashHandler = registry.some(r => r.toolNames.includes(ClaudeToolNames.Bash));
			const hasExitPlanModeHandler = registry.some(r => r.toolNames.includes(ClaudeToolNames.ExitPlanMode));

			expect(hasBashHandler).toBe(true);
			expect(hasExitPlanModeHandler).toBe(true);
		});
	});

	describe('registry behavior', () => {
		it('allows multiple handlers for different tools', () => {
			class Handler1 implements IClaudeToolPermissionHandler<ClaudeToolNames.WebFetch> {
				readonly toolNames = [ClaudeToolNames.WebFetch] as const;
			}

			class Handler2 implements IClaudeToolPermissionHandler<ClaudeToolNames.WebSearch> {
				readonly toolNames = [ClaudeToolNames.WebSearch] as const;
			}

			const startLength = getToolPermissionHandlerRegistry().length;

			registerToolPermissionHandler([ClaudeToolNames.WebFetch], Handler1);
			registerToolPermissionHandler([ClaudeToolNames.WebSearch], Handler2);

			const registry = getToolPermissionHandlerRegistry();
			expect(registry.length).toBe(startLength + 2);
		});

		it('preserves registration order', () => {
			class FirstHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.Task> {
				readonly toolNames = [ClaudeToolNames.Task] as const;
			}

			class SecondHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.TodoWrite> {
				readonly toolNames = [ClaudeToolNames.TodoWrite] as const;
			}

			const startLength = getToolPermissionHandlerRegistry().length;

			registerToolPermissionHandler([ClaudeToolNames.Task], FirstHandler);
			registerToolPermissionHandler([ClaudeToolNames.TodoWrite], SecondHandler);

			const registry = getToolPermissionHandlerRegistry();
			expect(registry[startLength].ctor).toBe(FirstHandler);
			expect(registry[startLength + 1].ctor).toBe(SecondHandler);
		});
	});
});
