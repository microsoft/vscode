import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';

interface FileInfo {
  path: string;
  name: string;
}

export class FolderUploader {
  private uploadInProgress = false;
  private fileExclusionPatterns = [
    'node_modules',
    '.git',
    '.DS_Store',
    '.vscode'
  ];

  /**
   * Uploads a folder to the specified endpoint
   * @param solutionId The solution ID to associate with the upload
   * @param url The base URL for the upload endpoint
   */
  public async uploadFolder(solutionId: string, context: vscode.ExtensionContext): Promise<void> {
    if (this.uploadInProgress) {
      vscode.window.showErrorMessage('A folder upload is already in progress');
      return;
    }

    this.uploadInProgress = true;

    // Prompt for self-assessment
    const assessment = await this.promptSelfAssessment();

    if (!assessment.passed) {
      this.uploadInProgress = false;
      vscode.window.showErrorMessage('Self-assessment failed. Please review the assessment questions and try again.');
      return;
    }

    // Get folder to upload
    const folderUri = await this.selectFolder();
    if (!folderUri) {
      this.uploadInProgress = false;
      return; // User cancelled the folder selection
    }

    // Generate the list of file paths from the folderUri.
    const filesList = this.getAllFiles(folderUri.fsPath);

    // Upload the files
    await this.uploadSolutionFiles(filesList, solutionId);

  }


  /**
  * Prompts the user with a series of self-assessment questions
  * @returns Assessment results with user responses and whether all questions passed
  */
  public async promptSelfAssessment(): Promise<{
    passed: boolean;
    auto: any[];
    self: Array<{ label: string; passing: boolean }>;
  }> {
    const assessmentQuestions = [
      {
        label: 'The solution is writtten fully on my own, without AI assistance.',
        passing: false,
      },
      {
        label: 'The solution directly addresses the problem posed in the challenge.',
        passing: false,
      },
      {
        label:
          'The description includes a detailed explanation of the methodology or approach used.',
        passing: false,
      },
      {
        label:
          'The solution adheres to any constraints or limitations specified in the challenge (e.g., time complexity, resource usage, budget).',
        passing: false,
      },
      {
        label:
          'Any assumptions made during the problem-solving process are clearly stated and justified.',
        passing: false,
      },
      {
        label:
          'The solution accounts for edge cases or potential exceptions and handles them appropriately.',
        passing: false,
      },
      {
        label:
          'The solution adheres to a style guide, and the solution is professional and polished.',
        passing: false,
      },
    ];

    const results = [];
    let allPassed = true;

    for (const question of assessmentQuestions) {
      const response = await vscode.window.showInformationMessage(
        question.label,
        { modal: true },
        'Yes', 'No'
      );

      const isPassing = response === 'Yes';

      // If any question is answered with 'No', set allPassed to false
      if (!isPassing) {
        allPassed = false;
      }

      results.push({
        label: question.label,
        passing: isPassing
      });
    }

    return {
      passed: allPassed,
      auto: [],
      self: results
    };
  }

  // Helper function to recursively get all files from a directory.
  private getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        this.getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    });

    return arrayOfFiles;
  }

  public async uploadSolutionFiles(
    filePaths: string[],
    solutionId: string,
  ): Promise<void> {
    const apiUrl = `${vscode.workspace.getConfiguration('datacurve-tracer').get('apiEndpoint')}/api/upload_solution`;

    try {
      const formData = new FormData();

      // Add each file to the form data
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        const fileName = path.basename(filePath);
        const fileStream = fs.createReadStream(filePath);

        formData.append(`file${i}`, fileStream, fileName);
      }

      // Add the solution ID
      formData.append('solution_id', solutionId);

      // Send the request
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Origin: 'localhost:3000',
        },
        body: formData,
      });

      // Handle response
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload files: ${errorText}`);
      }

      return;
    } catch (error) {
      console.error('Error uploading solution files:', error);
      throw error;
    }
  }

  /**
   * Shows a folder selection dialog
   */
  private async selectFolder(): Promise<vscode.Uri | undefined> {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Project Folder to Upload'
    };

    const folderUris = await vscode.window.showOpenDialog(options);
    return folderUris && folderUris.length > 0 ? folderUris[0] : undefined;
  }

  /**
   * Recursively reads all files from a folder
   */
  private async readFilesFromFolder(folderPath: string, relativePath: string = ''): Promise<FileInfo[]> {
    let files: FileInfo[] = [];

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);

        // Skip excluded directories and files
        if (this.shouldExcludeFile(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively process subdirectories
          const subFiles = await this.readFilesFromFolder(entryPath, entryRelativePath);
          files = [...files, ...subFiles];
        } else if (entry.isFile()) {
          // Process individual file
          files.push({
            name: entryRelativePath,
            path: entryPath
          });
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${folderPath}:`, error);
      throw new Error(`Failed to read directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return files;
  }

  /**
   * Checks if a file or directory should be excluded
   */
  private shouldExcludeFile(fileName: string): boolean {
    return this.fileExclusionPatterns.some(pattern => {
      if (pattern as any instanceof RegExp) {
        return pattern.match(fileName);
      }
      return fileName === pattern || fileName.startsWith(pattern + path.sep);
    });
  }
}

// Export singleton instance
export const folderUploader = new FolderUploader();
