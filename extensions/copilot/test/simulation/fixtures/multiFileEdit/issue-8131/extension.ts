import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

const O1_PARTICIPANT_ID = 'vscode-samples.o1';

interface ICatChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
}

const logger = vscode.env.createTelemetryLogger({
    sendEventData(eventName, data) {
        // Capture event telemetry
        console.log(`Event: ${eventName}`);
        console.log(`Data: ${JSON.stringify(data)}`);
    },
    sendErrorData(error, data) {
        // Capture error telemetry
        console.error(`Error: ${error}`);
        console.error(`Data: ${JSON.stringify(data)}`);
    }
});

// Initialize OpenAI client


export function activate(context: vscode.ExtensionContext) {
    // Load .env file from the extension's root directory
    dotenv.config();

    let openai: OpenAI | undefined;
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<ICatChatResult> => {
        if (!openai) {
            let apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                apiKey = await vscode.window.showInputBox({
                    prompt: 'Enter your OpenAI API Key',
                    ignoreFocusOut: true,
                    password: true
                });

                if (!apiKey) {
                    stream.markdown('API Key is required to proceed.');
                    throw new Error('API Key is required');
                }
            }
            openai = new OpenAI({
                apiKey
            });
        }

        try {
            const chatCompletion = await openai.chat.completions.create({
                model: "o1-preview", // You can change this to the appropriate model
                messages: [{ role: "user", content: request.prompt }],
                stream: true,
            });

            for await (const chunk of chatCompletion) {
                if (chunk.choices[0]?.delta?.content) {
                    stream.markdown(chunk.choices[0].delta.content);
                }
            }
        } catch(err) {
            handleError(logger, err, stream);
        }

        logger.logUsage('request', { kind: 'o1' });
        return { metadata: { command: 'o1_chat' } };
    };

    const o1 = vscode.chat.createChatParticipant(O1_PARTICIPANT_ID, handler);
    o1.iconPath = vscode.Uri.joinPath(context.extensionUri, 'openai-icon.png');

    context.subscriptions.push(o1);
}

function handleError(logger: vscode.TelemetryLogger, err: any, stream: vscode.ChatResponseStream): void {
    logger.logError(err);

    if (err instanceof Error) {
        console.error(err.message);
        stream.markdown(`An error occurred: ${err.message}`);
    } else {
        console.error('An unknown error occurred');
        stream.markdown('An unknown error occurred');
    }
}

export function deactivate() { }
