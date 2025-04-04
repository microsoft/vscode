import { gql, Client, cacheExchange, fetchExchange } from 'urql';
import * as vscode from 'vscode';
import { folderUploader } from '../folderUpload';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

export async function getJwt(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const secrets = context['secrets'];
  const jwt = await secrets.get('shipd-jwt');
  if (jwt) {
    return jwt;
  }
}

function getClient(token: string | undefined): Client {
  if (!token) {
    return new Client({
      url: vscode.workspace
        .getConfiguration('datacurve-tracer')
        .get('graphqlEndpoint', ''),
      exchanges: [cacheExchange, fetchExchange],
    });
  }
  return new Client({
    url: vscode.workspace
      .getConfiguration('datacurve-tracer')
      .get('graphqlEndpoint', ''),
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => {
      return {
        headers: { authorization: `Bearer ${token}` },
      };
    },
  });
}

export const ProjectPageQuery = gql`
  query ($projectId: ID!) {
    getProject(id: $projectId) {
      id
      name
      description
      pendingReview
      language
      complexity
      signed_url
      author {
        id
        username
        name
        imageUrl
        elo
      }
    }
  }
`;

export const ProjectSolutionMetation = gql`
  mutation useProjectSolver_ProjectSolutionMutation(
    $input: SubmitProjectSolutionInput!
  ) {
    submitProjectSolution(input: $input)
  }
`;

export async function uploadProjectFiles(context: vscode.ExtensionContext) {
  const solutionId = context.workspaceState.get(
    'datacurve-solution-id',
  ) as string;
  if (!solutionId) {
    vscode.window.showErrorMessage('Solution ID is required.');
    return;
  }

  const explanation: string | undefined = await vscode.window.showInputBox({
    prompt: 'Enter your explanation',
    placeHolder: 'Explanation of your solution',
  });

  if (!explanation) {
    vscode.window.showErrorMessage('Explanation is required.');
    return;
  }

  const demoVidUrl: string | undefined = await vscode.window.showInputBox({
    prompt: 'Enter your url',
    placeHolder: 'https://www.youtube.com/watch?v=abcabcabc',
  });

  if (!explanation) {
    vscode.window.showErrorMessage('Demo Video Url is required.');
    return;
  }

  // Determine the project directory
  const workspaceFolders = vscode.workspace?.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder is open.');
    return;
  }

  const projectPath = path.resolve(workspaceFolders[0].uri.fsPath, 'project');
  if (!fs.existsSync(projectPath)) {
    vscode.window.showErrorMessage(
      'Project folder not found at ' + projectPath,
    );
    return;
  }

  await getClient(await getJwt(context))
    .mutation(ProjectSolutionMetation, {
      input: {
        solutionId: solutionId,
        explanation: explanation,
        demoVideoUrl: demoVidUrl,
      },
    })
    .then((result) => {
      if (result.error) {
        vscode.window.showErrorMessage(
          'Error submitting solution: ' + result.error.message,
        );
        return;
      }
    });
  await folderUploader.uploadFolder(solutionId, context);
}

export function isConfigured(context: vscode.ExtensionContext): boolean {
  const projectId = context.workspaceState.get('datacurve-project-id');
  return !!projectId; // Return true if project ID exists
}

export async function downloadProjectFiles(context: vscode.ExtensionContext) {
  // Ask the user for the project ID

  try {
    // Query the project details using your GraphQL client
    // Extract the signed URL from the query result
    //const signedUrl: string | undefined = result.data?.getProject?.signed_url;
    //if (!signedUrl) {
    //  vscode.window.showErrorMessage('Signed URL not found for this project.');
    //  return;
    //}

    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showErrorMessage(
        'Workspace URI not found in the current context.',
      );
      return;
    }

    const project_id = context.workspaceState.get('datacurve-project-id');

    // Download the file from the signed URL using HTTPS
    https
      .get(
        {
          hostname: 'testing-duplicate.s3.amazonaws.com',
          path: `/project_files/${project_id}/project.zip`,
        },
        (res) => {
          const zipPath = path.resolve(
            (vscode.workspace?.workspaceFolders as vscode.WorkspaceFolder[])[0]
              .uri.fsPath,
            'project.zip',
          );
          const file = fs.createWriteStream(zipPath, { flags: 'w' });
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            vscode.window.showInformationMessage(
              'Downloaded challenge files successfully to ' + zipPath,
            );

            // Unzip the downloaded file
            try {
              const zip = new AdmZip(zipPath);
              // Extract to a folder named 'project' in the current directory
              const extractPath = path.resolve(
                (
                  vscode.workspace?.workspaceFolders as vscode.WorkspaceFolder[]
                )[0].uri.fsPath,
                'project',
              );
              zip.extractAllTo(extractPath, true);
              // Delete the zip file after extraction
              fs.unlinkSync(zipPath);
              vscode.window.showInformationMessage(
                'Extracted challenge files successfully to ' + extractPath,
              );
            } catch (ex: any) {
              vscode.window.showErrorMessage(
                'Error extracting project.zip: ' + ex.message,
              );
            }
          });
        },
      )
      .on('error', (err: Error) => {
        vscode.window.showErrorMessage(
          'Error downloading file: ' + err.message,
        );
      });
  } catch (err: any) {
    vscode.window.showErrorMessage('Error querying project: ' + err.message);
  }
}
