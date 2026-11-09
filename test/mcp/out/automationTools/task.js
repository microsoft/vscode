"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTaskTools = applyTaskTools;
const zod_1 = require("zod");
/**
 * Task Tools
 */
function applyTaskTools(server, appService) {
    const tools = [];
    // Seems too niche
    // server.tool(
    // 	'vscode_automation_task_assert_tasks',
    // 	'Assert that specific tasks exist with given properties',
    // 	{
    // 		filter: z.string().describe('Filter string for tasks'),
    // 		expected: z.array(z.object({
    // 			label: z.string().optional(),
    // 			type: z.string().optional(),
    // 			command: z.string().optional(),
    // 			identifier: z.string().optional(),
    // 			group: z.string().optional(),
    // 			isBackground: z.boolean().optional(),
    // 			promptOnClose: z.boolean().optional(),
    // 			icon: z.object({
    // 				id: z.string().optional(),
    // 				color: z.string().optional()
    // 			}).optional(),
    // 			hide: z.boolean().optional()
    // 		})).describe('Array of expected task properties'),
    // 		type: z.enum(['run', 'configure']).describe('Type of task operation')
    // 	},
    // 	async (args) => {
    // 		const { filter, expected, type } = args;
    // 		await app.workbench.task.assertTasks(filter, expected, type);
    // 		return {
    // 			content: [{
    // 				type: 'text' as const,
    // 				text: `Asserted ${expected.length} tasks for ${type} with filter: "${filter}"`
    // 			}]
    // 		};
    // 	}
    // );
    tools.push(server.tool('vscode_automation_task_configure', 'Configure a task with specific properties', {
        properties: zod_1.z.object({
            label: zod_1.z.string().optional(),
            type: zod_1.z.string().optional(),
            command: zod_1.z.string().optional(),
            identifier: zod_1.z.string().optional(),
            group: zod_1.z.string().optional(),
            isBackground: zod_1.z.boolean().optional(),
            promptOnClose: zod_1.z.boolean().optional(),
            icon: zod_1.z.object({
                id: zod_1.z.string().optional(),
                color: zod_1.z.string().optional()
            }).optional(),
            hide: zod_1.z.boolean().optional()
        }).describe('Task configuration properties')
    }, async (args) => {
        const { properties } = args;
        const app = await appService.getOrCreateApplication();
        await app.workbench.task.configureTask(properties);
        return {
            content: [{
                    type: 'text',
                    text: `Configured task: ${properties.label || properties.identifier || 'unnamed task'}`
                }]
        };
    }));
    return tools;
}
//# sourceMappingURL=task.js.map