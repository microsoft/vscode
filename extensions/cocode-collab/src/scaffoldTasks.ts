import * as vscode from 'vscode';

type ToolchainResult = { name: string; present: boolean };

type DetectionOutcome = { known: boolean; results: ToolchainResult[] };

export async function scaffoldTasks() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Open a folder before scaffolding tasks.');
    return;
  }

  const tasksContent = {
    version: '2.0.0',
    tasks: [
      {
        label: 'C++ Build & Run (g++)',
        type: 'shell',
        command: 'g++',
        args: ['-std=c++17', '-O2', '${file}', '-o', '${fileBasenameNoExtension}.out'],
        windows: {
          args: ['-std=c++17', '-O2', '${file}', '-o', '${fileBasenameNoExtension}.exe']
        },
        options: {
          cwd: '${fileDirname}'
        },
        group: 'build',
        problemMatcher: '$gcc',
        detail: 'Build active C++ file with g++'
      },
      {
        label: 'Run C++',
        type: 'shell',
        command: './${fileBasenameNoExtension}.out',
        windows: {
          command: '${fileBasenameNoExtension}.exe'
        },
        options: {
          cwd: '${fileDirname}'
        },
        problemMatcher: [],
        detail: 'Run compiled C++ output'
      },
      {
        label: 'C Build & Run (gcc)',
        type: 'shell',
        command: 'gcc',
        args: ['-O2', '${file}', '-o', '${fileBasenameNoExtension}.out'],
        windows: {
          args: ['-O2', '${file}', '-o', '${fileBasenameNoExtension}.exe']
        },
        options: {
          cwd: '${fileDirname}'
        },
        group: 'build',
        problemMatcher: '$gcc'
      },
      {
        label: 'Run C',
        type: 'shell',
        command: './${fileBasenameNoExtension}.out',
        windows: {
          command: '${fileBasenameNoExtension}.exe'
        },
        options: {
          cwd: '${fileDirname}'
        },
        problemMatcher: [],
        detail: 'Run compiled C output'
      },
      {
        label: 'Python Run',
        type: 'shell',
        command: 'python',
        args: ['${file}'],
        options: {
          cwd: '${fileDirname}'
        },
        problemMatcher: []
      }
    ]
  };

  const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
  const tasksUri = vscode.Uri.joinPath(vscodeDir, 'tasks.json');

  try {
    await vscode.workspace.fs.createDirectory(vscodeDir);
    await vscode.workspace.fs.writeFile(tasksUri, Buffer.from(JSON.stringify(tasksContent, null, 2), 'utf8'));

    const detection = await detectToolchains();
    if (!detection.known) {
      vscode.window.showInformationMessage('Tasks scaffolded. Toolchain availability could not be verified in this environment.');
      return;
    }

    const missing = detection.results.filter((result) => !result.present);
    if (missing.length > 0) {
      const names = missing.map((item) => item.name).join(', ');
      vscode.window.showWarningMessage(`Tasks scaffolded. Missing toolchains: ${names}. Install them to run the tasks successfully.`);
    } else {
      vscode.window.showInformationMessage('Scaffolded .vscode/tasks.json for C/C++/Python. Toolchains detected.');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Unable to scaffold tasks: ${error}`);
  }
}

async function detectToolchains(): Promise<DetectionOutcome> {
  const checks: ToolchainResult[] = [
    { name: 'g++', present: false },
    { name: 'gcc', present: false },
    { name: 'python', present: false }
  ];

  if (typeof process === 'undefined' || process.platform === 'browser') {
    return { known: false, results: checks };
  }

  try {
    const { exec } = await import('node:child_process');
    const commands = checks.map((entry) => {
      const probe = isWindows() ? `where ${entry.name}` : `command -v ${entry.name}`;
      return new Promise<ToolchainResult>((resolve) => {
        exec(probe, (error) => {
          resolve({ name: entry.name, present: !error });
        });
      });
    });
    const results = await Promise.all(commands);
    return { known: true, results };
  } catch {
    return { known: false, results: checks };
  }
}

function isWindows() {
  return typeof process !== 'undefined' && process.platform === 'win32';
}
