# This workflow checks out code, performs an Anchore container image
# vulnerability and compliance scan, and integrates the results with
# GitHub Advanced Security code scanning feature.  For more information on
# the Anchore scan action usage and parameters, see
# https://github.com/anchore/scan-action.  For more information on
# Anchore container image scanning in general, see
# https://docs.anchore.com.

name: Anchore Container Scan

on: push

jobs:
  Anchore-Build-Scan:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout the code
      uses: actions/checkout@v2
    - name: Build the Docker image
      run: docker build . --file Dockerfile --tag localbuild/testimage:latest      
    - name: Run the local Anchore scan action itself with GitHub Advanced Security code scanning integration enabled
      uses: anchore/scan-action@master
      with:
        image-reference: "localbuild/testimage:latest"
        dockerfile-path: "Dockerfile"
        acs-report-enable: true
    - name: Upload Anchore Scan Report
      uses: github/codeql-action/upload-sarif@v1
      with:
        sarif_file: results.sarif
