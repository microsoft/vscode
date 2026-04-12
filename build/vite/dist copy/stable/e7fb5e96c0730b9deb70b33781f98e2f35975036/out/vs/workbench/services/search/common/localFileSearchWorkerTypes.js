/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class LocalFileSearchWorkerHost {
    static { this.CHANNEL_NAME = 'localFileSearchWorkerHost'; }
    static getChannel(workerServer) {
        return workerServer.getChannel(LocalFileSearchWorkerHost.CHANNEL_NAME);
    }
    static setChannel(workerClient, obj) {
        workerClient.setChannel(LocalFileSearchWorkerHost.CHANNEL_NAME, obj);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxGaWxlU2VhcmNoV29ya2VyVHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL2NvbW1vbi9sb2NhbEZpbGVTZWFyY2hXb3JrZXJUeXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQStDaEcsTUFBTSxPQUFnQix5QkFBeUI7YUFDaEMsaUJBQVksR0FBRywyQkFBMkIsQ0FBQztJQUNsRCxNQUFNLENBQUMsVUFBVSxDQUFDLFlBQThCO1FBQ3RELE9BQU8sWUFBWSxDQUFDLFVBQVUsQ0FBNEIseUJBQXlCLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDbkcsQ0FBQztJQUNNLE1BQU0sQ0FBQyxVQUFVLENBQUMsWUFBdUMsRUFBRSxHQUE4QjtRQUMvRixZQUFZLENBQUMsVUFBVSxDQUE0Qix5QkFBeUIsQ0FBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDakcsQ0FBQyJ9