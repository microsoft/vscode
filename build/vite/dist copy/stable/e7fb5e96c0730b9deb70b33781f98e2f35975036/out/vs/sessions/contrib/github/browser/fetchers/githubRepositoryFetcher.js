/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Stateless fetcher for GitHub repository data.
 * All methods return raw typed data with no caching or state.
 */
export class GitHubRepositoryFetcher {
    constructor(_apiClient) {
        this._apiClient = _apiClient;
    }
    async getRepository(owner, repo) {
        const data = await this._apiClient.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, 'githubApi.getRepository');
        return {
            owner: data.owner.login,
            name: data.name,
            fullName: data.full_name,
            defaultBranch: data.default_branch,
            isPrivate: data.private,
            description: data.description ?? '',
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViUmVwb3NpdG9yeUZldGNoZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi9icm93c2VyL2ZldGNoZXJzL2dpdGh1YlJlcG9zaXRvcnlGZXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBY2hHOzs7R0FHRztBQUNILE1BQU0sT0FBTyx1QkFBdUI7SUFFbkMsWUFDa0IsVUFBMkI7UUFBM0IsZUFBVSxHQUFWLFVBQVUsQ0FBaUI7SUFDekMsQ0FBQztJQUVMLEtBQUssQ0FBQyxhQUFhLENBQUMsS0FBYSxFQUFFLElBQVk7UUFDOUMsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FDekMsS0FBSyxFQUNMLFVBQVUsa0JBQWtCLENBQUMsS0FBSyxDQUFDLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFDakUseUJBQXlCLENBQ3pCLENBQUM7UUFDRixPQUFPO1lBQ04sS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSztZQUN2QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDeEIsYUFBYSxFQUFFLElBQUksQ0FBQyxjQUFjO1lBQ2xDLFNBQVMsRUFBRSxJQUFJLENBQUMsT0FBTztZQUN2QixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsSUFBSSxFQUFFO1NBQ25DLENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==