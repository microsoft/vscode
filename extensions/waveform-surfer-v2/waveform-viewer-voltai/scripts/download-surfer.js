// scripts/download-surfer.js
// Script to download pre-compiled Surfer WASM build

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SURFER_ARTIFACT_URL = 'https://gitlab.com/surfer-project/surfer/-/jobs/artifacts/main/download?job=pages_build';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const SURFER_DIR = path.join(DIST_DIR, 'surfer');

async function downloadSurfer() {
    console.log('Downloading Surfer WASM build...');

    // Create directories if they don't exist
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    if (!fs.existsSync(SURFER_DIR)) {
        fs.mkdirSync(SURFER_DIR, { recursive: true });
    }

    try {
        // Download the artifact
        const zipPath = path.join(DIST_DIR, 'surfer-artifacts.zip');
        await downloadFile(SURFER_ARTIFACT_URL, zipPath);

        // Extract the ZIP file
        console.log('Extracting Surfer build...');

        // Use system unzip command or a Node.js alternative
        try {
            execSync(`unzip -o "${zipPath}" -d "${DIST_DIR}"`, { stdio: 'inherit' });
        } catch (error) {
            console.log('System unzip not available, trying alternative extraction...');
            // TODO: Add alternative extraction method using a Node.js library
            throw new Error('Failed to extract Surfer build. Please install unzip or implement alternative extraction.');
        }

        // Move public folder contents to surfer directory
        const publicDir = path.join(DIST_DIR, 'public');
        if (fs.existsSync(publicDir)) {
            // Copy contents of public to surfer directory
            execSync(`cp -r "${publicDir}"/* "${SURFER_DIR}"/`, { stdio: 'inherit' });

            // Clean up
            fs.rmSync(publicDir, { recursive: true, force: true });
        }

        // Clean up zip file
        fs.unlinkSync(zipPath);

        // Modify the HTML to add our setup hooks
        const htmlPath = path.join(SURFER_DIR, 'index.html');
        if (fs.existsSync(htmlPath)) {
            modifySurferHtml(htmlPath);
        }

        console.log('Surfer WASM build downloaded and set up successfully!');

    } catch (error) {
        console.error('Failed to download Surfer:', error.message);

        // Create a fallback placeholder
        createSurferPlaceholder();
    }
}

function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);

        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
                return downloadFile(response.headers.location, outputPath)
                    .then(resolve)
                    .catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });

        }).on('error', (error) => {
            fs.unlink(outputPath, () => {}); // Delete the file on error
            reject(error);
        });
    });
}

function modifySurferHtml(htmlPath) {
    console.log('Modifying Surfer HTML for VSCode integration...');

    let html = fs.readFileSync(htmlPath, 'utf8');

    // Add VSCode integration setup
    const setupHook = `
        (function() {
            // VSCode API bridge
            let vscodeApi;
            try {
                // Try to get VSCode API (will fail outside VSCode webview)
                vscodeApi = acquireVsCodeApi && acquireVsCodeApi();
            } catch (e) {
                console.log('Not running in VSCode webview');
            }

            // Notify parent window that Surfer is ready
            function notifyReady() {
                if (vscodeApi) {
                    vscodeApi.postMessage({
                        command: 'ready'
                    });
                } else if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'ready'
                    }, '*');
                }
            }

            // Set up message handling
            window.addEventListener('message', function(event) {
                if (event.data && event.data.type) {
                    console.log('Surfer received message:', event.data);
                    // Handle messages from VSCode extension
                    // TODO: Implement message handlers for waveform loading, etc.
                }
            });

            // Notify when ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', notifyReady);
            } else {
                notifyReady();
            }
        })();
    `;

    // Replace the setup hooks placeholder
    html = html.replace(/\/\*SURFER_SETUP_HOOKS\*\//g, setupHook);

    // Write the modified HTML back
    fs.writeFileSync(htmlPath, html, 'utf8');
}

function createSurferPlaceholder() {
    console.log('Creating Surfer placeholder...');

    const placeholderHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Surfer Placeholder</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: system-ui, -apple-system, sans-serif;
            background-color: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #d4d4d4);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
        }
        .placeholder {
            max-width: 500px;
        }
        .error {
            color: var(--vscode-errorForeground, #f48771);
            margin-bottom: 20px;
        }
        .instructions {
            margin-top: 20px;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="placeholder">
        <div class="error">
            <h2>⚠️ Surfer Not Available</h2>
            <p>The Surfer waveform viewer could not be loaded automatically.</p>
        </div>
        <div class="instructions">
            <p>To manually install Surfer:</p>
            <ol style="text-align: left;">
                <li>Download from: <code>https://gitlab.com/surfer-project/surfer/-/jobs/artifacts/main/download?job=pages_build</code></li>
                <li>Extract to: <code>dist/surfer/</code></li>
                <li>Reload the extension</li>
            </ol>
        </div>
    </div>
    <script>
        // Notify parent that we're ready (even if it's just a placeholder)
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'ready'
            }, '*');
        }
    </script>
</body>
</html>
    `;

    fs.writeFileSync(path.join(SURFER_DIR, 'index.html'), placeholderHtml, 'utf8');
}

// Run the download
if (require.main === module) {
    downloadSurfer().catch(console.error);
}

module.exports = { downloadSurfer };