// @ts-check

// Get access to the VS Code API from within the webview context
// @ts-ignore - acquireVsCodeApi is provided by VSCode webview context
const vscode = acquireVsCodeApi();

// Just like a regular webpage we have access to the document object
document.addEventListener('DOMContentLoaded', function() {
    console.log('Waveform viewer loaded');

    // Get references to DOM elements
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomFitBtn = document.getElementById('zoom-fit');
    const fileContent = document.getElementById('file-content');

    // Set up event listeners
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function() {
            console.log('Zoom in clicked');
            handleZoomIn();
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function() {
            console.log('Zoom out clicked');
            handleZoomOut();
        });
    }

    if (zoomFitBtn) {
        zoomFitBtn.addEventListener('click', function() {
            console.log('Zoom fit clicked');
            handleZoomFit();
        });
    }

    // Listen for messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'update':
                updateContent(message.text, message.filename);
                break;
        }
    });
});

let currentZoom = 1.0;

function handleZoomIn() {
    currentZoom *= 1.2;
    applyZoom();
    vscode.postMessage({
        type: 'zoom',
        value: currentZoom
    });
}

function handleZoomOut() {
    currentZoom /= 1.2;
    applyZoom();
    vscode.postMessage({
        type: 'zoom',
        value: currentZoom
    });
}

function handleZoomFit() {
    currentZoom = 1.0;
    applyZoom();
    vscode.postMessage({
        type: 'zoom',
        value: currentZoom
    });
}

function applyZoom() {
    const display = document.getElementById('waveform-display');
    if (display) {
        display.style.transform = `scale(${currentZoom})`;
        display.style.transformOrigin = 'top left';
    }
}

function updateContent(text, filename) {
    console.log('Updating content for file:', filename);
    const fileContent = document.getElementById('file-content');
    if (fileContent) {
        fileContent.textContent = text;
    }

    // Here you would parse the waveform data and render it
    // For now, just display the raw content
    parseAndRenderWaveform(text, filename);
}

function parseAndRenderWaveform(content, filename) {
    const display = document.getElementById('waveform-display');
    if (!display) return;

    // Clear previous content
    display.innerHTML = '';

    // Create header
    const header = document.createElement('h3');
    header.textContent = `Waveform: ${filename}`;
    display.appendChild(header);

    // For demonstration, create some mock waveform signals
    if (filename.endsWith('.vcd') || filename.endsWith('.ghw') || filename.endsWith('.fst')) {
        createMockWaveforms(display);
    } else {
        // Show raw content for other files
        const pre = document.createElement('pre');
        pre.id = 'file-content';
        pre.textContent = content;
        display.appendChild(pre);
    }
}

function createMockWaveforms(container) {
    const signals = ['clk', 'reset', 'data_in[7:0]', 'data_out[7:0]', 'valid', 'ready'];

    signals.forEach(signalName => {
        const signalDiv = document.createElement('div');
        signalDiv.className = 'waveform-signal';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'signal-name';
        nameDiv.textContent = signalName;

        const waveformDiv = document.createElement('div');
        waveformDiv.className = 'signal-waveform';

        // Create a simple waveform representation
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 30;
        canvas.style.width = '100%';
        canvas.style.height = '30px';

        const ctx = canvas.getContext('2d');
        if (ctx) {
            drawMockWaveform(ctx, signalName, canvas.width, canvas.height);
        }

        waveformDiv.appendChild(canvas);
        signalDiv.appendChild(nameDiv);
        signalDiv.appendChild(waveformDiv);
        container.appendChild(signalDiv);
    });
}

function drawMockWaveform(ctx, signalName, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Draw different waveform patterns based on signal name
    if (signalName === 'clk') {
        // Clock signal
        for (let i = 0; i < width; i += 20) {
            ctx.moveTo(i, height - 5);
            ctx.lineTo(i, 5);
            ctx.lineTo(i + 10, 5);
            ctx.lineTo(i + 10, height - 5);
            ctx.lineTo(i + 20, height - 5);
        }
    } else if (signalName === 'reset') {
        // Reset signal
        ctx.moveTo(0, height - 5);
        ctx.lineTo(30, height - 5);
        ctx.lineTo(30, 5);
        ctx.lineTo(width, 5);
    } else {
        // Data signals
        let y = Math.random() > 0.5 ? 5 : height - 5;
        ctx.moveTo(0, y);
        for (let i = 0; i < width; i += 30 + Math.random() * 20) {
            ctx.lineTo(i, y);
            y = Math.random() > 0.5 ? 5 : height - 5;
            ctx.lineTo(i, y);
        }
        ctx.lineTo(width, y);
    }

    ctx.stroke();
}