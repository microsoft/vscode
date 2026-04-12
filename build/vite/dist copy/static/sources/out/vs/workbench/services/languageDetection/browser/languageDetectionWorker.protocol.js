/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class LanguageDetectionWorkerHost {
    static { this.CHANNEL_NAME = 'languageDetectionWorkerHost'; }
    static getChannel(workerServer) {
        return workerServer.getChannel(LanguageDetectionWorkerHost.CHANNEL_NAME);
    }
    static setChannel(workerClient, obj) {
        workerClient.setChannel(LanguageDetectionWorkerHost.CHANNEL_NAME, obj);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXIucHJvdG9jb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvbGFuZ3VhZ2VEZXRlY3Rpb24vYnJvd3Nlci9sYW5ndWFnZURldGVjdGlvbldvcmtlci5wcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLE9BQWdCLDJCQUEyQjthQUNsQyxpQkFBWSxHQUFHLDZCQUE2QixDQUFDO0lBQ3BELE1BQU0sQ0FBQyxVQUFVLENBQUMsWUFBOEI7UUFDdEQsT0FBTyxZQUFZLENBQUMsVUFBVSxDQUE4QiwyQkFBMkIsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUN2RyxDQUFDO0lBQ00sTUFBTSxDQUFDLFVBQVUsQ0FBQyxZQUF1QyxFQUFFLEdBQWdDO1FBQ2pHLFlBQVksQ0FBQyxVQUFVLENBQThCLDJCQUEyQixDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNyRyxDQUFDIn0=