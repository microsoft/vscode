# This is a basic workflow to help you get started with Using Checkmarx CxFlow Action

name: CxFlow

# Controls when the action will run. Triggers the workflow on push or pull request
# events but only for the master branch
on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

# A workflow run is made up of one or more jobs that can run sequentially or in parallel - this job is specifically configured to use the Checkmarx CxFlow Action
jobs:
  # This workflow contains a single job called "build"
  build:
    # The type of runner that the job will run on - Ubuntu is required as Docker is leveraged for the action
    runs-on: ubuntu-latest

    # Steps require - checkout code, run CxFlow Action, Upload SARIF report (optional)
    steps:
    # Checks-out your repository under $GITHUB_WORKSPACE, so your job can access it
    - uses: actions/checkout@v2
    # Runs the Checkmarx Scan leveraging the latest version of CxFlow - REFER to Action README for list of inputs
    - name: Checkmarx CxFlow Action
      uses: checkmarx-ts/checkmarx-cxflow-github-action@v1.0
      with:
        project: GithubActionTest
        team: '\CxServer\SP\Checkmarx'
        checkmarx_url: ${{ secrets.CHECKMARX_URL }}
        checkmarx_username: ${{ secrets.CHECKMARX_USERNAME }}
        checkmarx_password: ${{ secrets.CHECKMARX_PASSWORD }}
        checkmarx_client_secret: ${{ secrets.CHECKMARX_CLIENT_SECRET }}
    # Upload the Report for CodeQL/Security Alerts
    - name: Upload SARIF file
      uses: github/codeql-action/upload-sarif@v1
      with:
        sarif_file: cx.sarif
