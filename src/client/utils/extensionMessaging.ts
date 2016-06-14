// Borrowed from vscode-cordova extension
import {Hash} from "./hash";
import * as net from "net";
import * as path from "path";

export let ErrorMarker = "vscode-python-error-marker";

/**
 * Defines the messages sent to the extension.
 * Add new messages to this enum.
 */
export enum ExtensionMessage {
    SEND_TELEMETRY
}

export interface MessageWithArguments {
    message: ExtensionMessage;
    args: any[];
}

/**
 * Sends messages to the extension.
 */
export class ExtensionMessageSender {
    private hash: string;

    constructor(projectRoot?: string) {
        if (!projectRoot) {
            projectRoot = path.join(path.dirname(module.filename), "..", "..", "..");
        }
        this.hash = Hash.hashCode(projectRoot);
    }

    public getExtensionPipePath(): string {
        switch (process.platform) {
            case "win32":
                return `\\\\?\\pipe\\vscodepython-${this.hash}`;
            default:
                return `/tmp/vscodepython-${this.hash}.sock`;
        }
    }

    /**
     * Sends telemetry
     */
    public sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): Promise<any> {
        return this.sendMessage(ExtensionMessage.SEND_TELEMETRY, Array.prototype.slice.call(arguments));
    }

    public sendMessage(message: ExtensionMessage, args?: any[]): Promise<any> {
        let messageWithArguments: MessageWithArguments = { message: message, args: args };
        let body = "";

        return new Promise<any>((resolve, reject) => {
            let pipePath = this.getExtensionPipePath();
            let socket = net.connect(pipePath, function () {
                let messageJson = JSON.stringify(messageWithArguments);
                socket.write(messageJson);
            });

            socket.on("data", function (data: any) {
                body += data;
            });

            socket.on("error", function (data: any) {
                reject(new Error("An error occurred while handling message: " + ExtensionMessage[message]));
            });

            socket.on("end", function () {
                try {
                    if (body.startsWith(ErrorMarker)) {
                        let errorString = body.replace(ErrorMarker, "");
                        let error = new Error(errorString ? errorString : "An error occurred while handling message: " + ExtensionMessage[message]);
                        reject(error);
                    } else {
                        let responseBody: any = body ? JSON.parse(body) : null;
                        resolve(responseBody);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
}