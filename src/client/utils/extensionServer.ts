// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as net from "net";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import {
    ErrorMarker,
    ExtensionMessage,
    ExtensionMessageSender,
    MessageWithArguments
} from "./extensionMessaging";

import * as telemetryHelper from "../common/telemetry";

export class ExtensionServer implements vscode.Disposable {
    private serverInstance: net.Server = null;
    private messageHandlerDictionary: { [id: number]: ((...argArray: any[]) => Promise<any>) } = {};
    private pipePath: string;

    public constructor(projectRoot?: string) {
        if (!projectRoot) {
            projectRoot = path.join(path.dirname(module.filename), "..", "..", "..");
        }
        let messageSender = new ExtensionMessageSender(projectRoot);
        this.pipePath = messageSender.getExtensionPipePath();

        // Register handlers for all messages
        this.messageHandlerDictionary[ExtensionMessage.SEND_TELEMETRY] = this.sendTelemetry;
    }

    /**
     * Starts the server.
     */
    public setup(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let launchCallback = (error: any) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(null);
                }
            };

            this.serverInstance = net.createServer(this.handleSocket.bind(this));
            this.serverInstance.on("error", this.recoverServer.bind(this));
            this.serverInstance.listen(this.pipePath, launchCallback);
        });
    }

    /**
     * Stops the server.
     */
    public dispose(): void {
        if (this.serverInstance) {
            this.serverInstance.close();
            this.serverInstance = null;
        }
    }

    /**
     * Sends telemetry
     */
    private sendTelemetry(eventName: string, properties: { [key: string]: string }, measures: { [key: string]: number }): Promise<any> {
        telemetryHelper.sendTelemetryEvent(eventName, properties, measures);
        return Promise.resolve({});
    }

    /**
     * Extension message handler.
     */
    private handleExtensionMessage(messageWithArgs: MessageWithArguments): Promise<any> {
        let handler = this.messageHandlerDictionary[messageWithArgs.message];
        if (handler) {
            return handler.apply(this, messageWithArgs.args);
        } else {
            return Promise.reject("Invalid message: " + messageWithArgs.message);
        }
    }

    /**
     * Handles connections to the server.
     */
    private handleSocket(socket: net.Socket): void {
        let handleError = (e: any) => {
            let errorMessage = e ? e.message || e.error || e.data || e : "";
            socket.end(ErrorMarker + errorMessage);
        };

        let dataCallback = (data: any) => {
            try {
                let messageWithArgs: MessageWithArguments = JSON.parse(data);
                this.handleExtensionMessage(messageWithArgs)
                    .then(result => {
                        socket.end(JSON.stringify(result));
                    })
                    .catch((e) => { handleError(e); });
            } catch (e) {
                handleError(e);
            }
        };

        socket.on("data", dataCallback);
    };

    /**
     * Recovers the server in case the named socket we use already exists, but no other instance of VSCode is active.
     */
    private recoverServer(error: any): void {
        let errorHandler = (e: any) => {
            /* The named socket is not used. */
            if (e.code === "ECONNREFUSED") {
                ExtensionServer.deleteDirectoryRecursive(this.pipePath);
                this.serverInstance.listen(this.pipePath);
            }
        };

        /* The named socket already exists. */
        if (error.code === "EADDRINUSE") {
            let clientSocket = new net.Socket();
            clientSocket.on("error", errorHandler);
            clientSocket.connect(this.pipePath, function () {
                clientSocket.end();
            });
        }
    }


    /**
     *  Helper (synchronous) function to delete a directory recursively
     */
    public static deleteDirectoryRecursive(dirPath: string) {
        if (fs.existsSync(dirPath)) {
            if (fs.lstatSync(dirPath).isDirectory()) {
                fs.readdirSync(dirPath).forEach(function (file) {
                    let curPath = path.join(dirPath, file);
                    ExtensionServer.deleteDirectoryRecursive(curPath);
                });

                fs.rmdirSync(dirPath);
            } else {
                fs.unlinkSync(dirPath);
            }
        }
    };
}
