/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export function createOrchestrateApi(transport: Transport) {
	return {
		deployGeneratedCode: async (
			prompt: string,
			repoName: string,
			projectName: string,
			userId: string = 'default'
		): Promise<{
			success: boolean;
			steps: Array<{ step: string; success: boolean; error?: string; data?: any }>;
			deployment_url?: string;
		}> => {
			try {
				return await transport.post('/api/orchestrate/deploy', {
					prompt,
					repo_name: repoName,
					project_name: projectName,
					user_id: userId
				});
			} catch (error) {
				return {
					success: false,
					steps: [{
						step: 'error',
						success: false,
						error: error instanceof Error ? error.message : 'Deployment failed'
					}]
				};
			}
		}
	};
}

