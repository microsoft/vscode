#!/bin/bash
# #### Instructions to fill the GCP_ADC_FILE env var
#  1. `gcloud auth login <gcp-email>` and authenticate
#  2. `gcloud auth application-default login` and authenticate
#  3. `cat ~/.config/gcloud/application_default_credentials.json` and copy the output
#  4. Go to https://gitpod.io/settings/ and create:
#     - name: GCP_ADC_FILE
#     - value: paste-the-output
#     - repo: gitpod-io/vscode

GCLOUD_ADC_PATH="/home/gitpod/.config/gcloud/application_default_credentials.json"

if [ ! -f "$GCLOUD_ADC_PATH" ]; then
    if [ -z "$GCP_ADC_FILE" ]; then
        echo "GCP_ADC_FILE not set, doing nothing."
        return;
    fi
    echo "$GCP_ADC_FILE" > "$GCLOUD_ADC_PATH"
    echo "Set GOOGLE_APPLICATION_CREDENTIALS value based on contents from GCP_ADC_FILE"
fi
export GOOGLE_APPLICATION_CREDENTIALS="$GCLOUD_ADC_PATH"

