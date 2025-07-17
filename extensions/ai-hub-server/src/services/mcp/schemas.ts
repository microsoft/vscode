/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { z } from 'zod';

export const ServerConfigSchema = z.object({
	type: z.enum(['stdio', 'sse']),
	disabled: z.boolean().optional(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	cwd: z.string().optional(),
	env: z.record(z.string()).optional(),
	url: z.string().optional(),
	headers: z.record(z.string()).optional(),
});

export const McpSettingsSchema = z.object({
	mcpServers: z.record(ServerConfigSchema),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type McpSettings = z.infer<typeof McpSettingsSchema>;
