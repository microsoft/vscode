// src/webview/main.ts
// Webview script for Surfer integration

declare function acquireVsCodeApi(): {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
};

class SurferBridge {
    private vscode = acquireVsCodeApi();
    private surferIframe: HTMLIFrameElement | null = null;
    private surferReady: boolean = false;

    constructor() {
        this.init();
    }

    private init(): void {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupSurfer());
        } else {
            this.setupSurfer();
        }

        // Listen for messages from VSCode extension
        window.addEventListener('message', (event) => {
            this.handleVSCodeMessage(event.data);
        });
    }

    private setupSurfer(): void {
        this.surferIframe = document.getElementById('surfer-iframe') as HTMLIFrameElement;

        if (!this.surferIframe) {
            console.error('Surfer iframe not found');
            return;
        }

        // Listen for messages from Surfer iframe
        window.addEventListener('message', (event) => {
            if (event.source === this.surferIframe?.contentWindow) {
                this.handleSurferMessage(event.data);
            }
        });

        // Wait for Surfer to load
        this.surferIframe.onload = () => {
            console.log('Surfer iframe loaded');
            this.checkSurferReady();
        };
    }

    private checkSurferReady(): void {
        // Poll until Surfer is ready
        const checkInterval = setInterval(() => {
            if (this.surferIframe?.contentWindow) {
                try {
                    // Try to communicate with Surfer
                    this.surferIframe.contentWindow.postMessage({
                        type: 'ping'
                    }, '*');
                } catch (error) {
                    console.log('Waiting for Surfer to be ready...');
                }
            }
        }, 500);

        // Stop checking after 30 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!this.surferReady) {
                console.error('Surfer failed to initialize within 30 seconds');
            }
        }, 30000);
    }

    private handleVSCodeMessage(message: any): void {
        console.log('Message from VSCode:', message);

        switch (message.command) {
            case 'loadWaveform':
                this.loadWaveform(message.data);
                break;
            case 'signalData':
                this.sendSignalDataToSurfer(message.data);
                break;
            case 'addSignal':
                this.addSignalToSurfer(message.signal);
                break;
            case 'removeSignal':
                this.removeSignalFromSurfer(message.signalId);
                break;
        }
    }

    private handleSurferMessage(message: any): void {
        console.log('Message from Surfer:', message);

        switch (message.type) {
            case 'ready':
                this.surferReady = true;
                console.log('Surfer is ready');
                this.vscode.postMessage({
                    command: 'ready'
                });
                break;
            case 'signalRequest':
                this.vscode.postMessage({
                    command: 'requestSignalData',
                    signalIds: message.signalIds,
                    timeRange: message.timeRange
                });
                break;
            case 'addSignal':
                this.vscode.postMessage({
                    command: 'addSignal',
                    signalId: message.signalId
                });
                break;
            case 'removeSignal':
                this.vscode.postMessage({
                    command: 'removeSignal',
                    signalId: message.signalId
                });
                break;
        }
    }

    private loadWaveform(data: any): void {
        if (!this.surferReady || !this.surferIframe?.contentWindow) {
            console.log('Surfer not ready, queuing waveform load');
            // TODO: Queue the load operation
            return;
        }

        this.surferIframe.contentWindow.postMessage({
            type: 'loadWaveform',
            fileType: data.fileType,
            fileName: data.fileName,
            // Additional waveform metadata
        }, '*');
    }

    private sendSignalDataToSurfer(data: any): void {
        if (!this.surferReady || !this.surferIframe?.contentWindow) {
            return;
        }

        this.surferIframe.contentWindow.postMessage({
            type: 'signalData',
            data: data
        }, '*');
    }

    private addSignalToSurfer(signal: any): void {
        if (!this.surferReady || !this.surferIframe?.contentWindow) {
            return;
        }

        this.surferIframe.contentWindow.postMessage({
            type: 'addSignal',
            signal: signal
        }, '*');
    }

    private removeSignalFromSurfer(signalId: number): void {
        if (!this.surferReady || !this.surferIframe?.contentWindow) {
            return;
        }

        this.surferIframe.contentWindow.postMessage({
            type: 'removeSignal',
            signalId: signalId
        }, '*');
    }
}

// Initialize the bridge when the script loads
new SurferBridge();