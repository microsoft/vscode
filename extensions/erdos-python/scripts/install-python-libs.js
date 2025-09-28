#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function log(message) {
    console.log(`[install-python-libs] ${message}`);
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            ...options,
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
            }
        });
    });
}

function resolveExecutable(executable) {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(whichCmd, [executable], { encoding: 'utf8' });
    if (result.status !== 0) {
        return null;
    }

    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.length > 0 ? lines[0] : null;
}

function locatePython() {
    const candidates = [];
    if (process.env.CI_PYTHON_PATH) {
        candidates.push(process.env.CI_PYTHON_PATH);
    }

    if (process.platform === 'win32') {
        candidates.push('python');
        candidates.push('py');
    } else {
        candidates.push('python3');
        candidates.push('python');
    }

    for (const candidate of candidates) {
        const resolved = resolveExecutable(candidate);
        if (resolved) {
            return resolved;
        }
    }

    throw new Error('Unable to locate a Python interpreter. Set CI_PYTHON_PATH or ensure python is on PATH.');
}

async function pipInstall(pythonExecutable, args, cwd) {
    await run(
        pythonExecutable,
        [
            '-m',
            'pip',
            'install',
            '--disable-pip-version-check',
            '--upgrade',
            '--no-cache-dir',
            '--no-deps',
            '--require-hashes',
            '--only-binary',
            ':all:',
            ...args,
        ],
        { cwd },
    );
}

function ensureCleanDirectory(directory) {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
}

async function installPythonScriptRequirements(pythonExecutable, extensionRoot) {
    const requirementsPath = path.join(extensionRoot, 'requirements.txt');
    if (!fs.existsSync(requirementsPath)) {
        log('Skipping python script requirements (requirements.txt not found).');
        return;
    }

    const targetDir = path.join(extensionRoot, 'python_files', 'lib', 'python');
    ensureCleanDirectory(targetDir);
    log('Installing base Python helper libraries.');
    await pipInstall(pythonExecutable, ['--target', targetDir, '--implementation', 'py', '-r', requirementsPath], extensionRoot);
}

async function vendorPythonKernelRequirements(pythonExecutable, extensionRoot) {
    log('Vendoring shared client libraries.');
    await run(pythonExecutable, [path.join('scripts', 'vendor.py')], { cwd: extensionRoot });
}

async function bundleIPykernel(pythonExecutable, extensionRoot, arch) {
    const requirementsRoot = path.join(extensionRoot, 'python_files', 'ipykernel_requirements');
    const targetRoot = path.join(extensionRoot, 'python_files', 'lib', 'ipykernel');
    const pythonVersions = ['3.9', '3.10', '3.11', '3.12', '3.13'];
    const minimumPythonVersion = '3.9';

    // Pure Python requirements shared by all supported interpreters.
    ensureCleanDirectory(path.join(targetRoot, 'py3'));
    log('Installing ipykernel pure Python dependencies.');
    await pipInstall(
        pythonExecutable,
        [
            '--target',
            path.join(targetRoot, 'py3'),
            '--implementation',
            'py',
            '--python-version',
            minimumPythonVersion,
            '--abi',
            'none',
            '-r',
            path.join(requirementsRoot, 'py3-requirements.txt'),
        ],
        extensionRoot,
    );

    // ABI3 wheels shared across CPython 3.x.
    ensureCleanDirectory(path.join(targetRoot, arch, 'cp3'));
    log('Installing ipykernel ABI3 dependencies.');
    await pipInstall(
        pythonExecutable,
        [
            '--target',
            path.join(targetRoot, arch, 'cp3'),
            '--implementation',
            'cp',
            '--python-version',
            minimumPythonVersion,
            '--abi',
            'abi3',
            '-r',
            path.join(requirementsRoot, 'cp3-requirements.txt'),
        ],
        extensionRoot,
    );

    // Python-version specific wheels.
    for (const pythonVersion of pythonVersions) {
        const shortVersion = pythonVersion.replace('.', '');
        const abi = `cp${shortVersion}`;
        const targetDir = path.join(targetRoot, arch, abi);
        ensureCleanDirectory(targetDir);
        log(`Installing ipykernel dependencies for CPython ${pythonVersion}.`);
        await pipInstall(
            pythonExecutable,
            [
                '--target',
                targetDir,
                '--implementation',
                'cp',
                '--python-version',
                pythonVersion,
                '--abi',
                abi,
                '-r',
                path.join(requirementsRoot, 'cpx-requirements.txt'),
            ],
            extensionRoot,
        );
    }
}

async function main() {
    const extensionRoot = path.resolve(__dirname, '..');
    const pythonExecutable = locatePython();
    log(`Using Python executable: ${pythonExecutable}`);

    const arch = os.arch();
    if (arch !== 'x64' && arch !== 'arm64') {
        throw new Error(`Unsupported architecture: ${arch}`);
    }

    await installPythonScriptRequirements(pythonExecutable, extensionRoot);
    await vendorPythonKernelRequirements(pythonExecutable, extensionRoot);
    await bundleIPykernel(pythonExecutable, extensionRoot, arch);

    log('Python dependencies installed successfully.');
}

main().catch((error) => {
    console.error(`[install-python-libs] ${error.message}`);
    process.exit(1);
});
