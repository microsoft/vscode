. build/azure-pipelines/win32/exec.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ARTIFACT_PROCESSED_ARTIFACT_NAME = 'artifacts_processed'

# This set will keep track of which artifacts have already been processed
$set = [System.Collections.Generic.HashSet[string]]::new()

function Get-PipelineArtifact {
	param($Name = '*')
	try {
		$res = Invoke-RestMethod "$($env:BUILDS_API_URL)artifacts?api-version=6.0" -Headers @{
			Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
		} -MaximumRetryCount 5 -RetryIntervalSec 1

		if (!$res) {
			return
		}

		$res.value | Where-Object { $_.name -Like $Name }
	} catch {
		Write-Warning $_
	}
}

$res = Get-PipelineArtifact -Name $ARTIFACT_PROCESSED_ARTIFACT_NAME
# If we have already processed some artifacts, don't publish them again (example, you need to rerun the Release stage)
if ($res) {
	try {
		Invoke-RestMethod $artifactsProcessedArtifact.resource.downloadUrl -OutFile "$env:AGENT_TEMPDIRECTORY/$ARTIFACT_PROCESSED_ARTIFACT_NAME.zip" -Headers @{
			Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
		} -MaximumRetryCount 5 -RetryIntervalSec 1

		Expand-Archive -Path "$env:AGENT_TEMPDIRECTORY/$ARTIFACT_PROCESSED_ARTIFACT_NAME.zip" -DestinationPath $env:AGENT_TEMPDIRECTORY

		Get-Content "$env:AGENT_TEMPDIRECTORY/$ARTIFACT_PROCESSED_ARTIFACT_NAME/$ARTIFACT_PROCESSED_ARTIFACT_NAME.txt" | ForEach-Object {
			$set.Add($_);
			Write-Host "Already processed artifact: $_"
		}
	} catch {
		Write-Warning $_
	}
}

# Determine which stages we need to watch
$stages = @(
	if ($env:VSCODE_BUILD_STAGE_WINDOWS -eq 'True') { 'Windows' }
	if ($env:VSCODE_BUILD_STAGE_LINUX -eq 'True') { 'Linux' }
	if ($env:VSCODE_BUILD_STAGE_MACOS -eq 'True') { 'macOS' }
)

do {
	Start-Sleep -Seconds 10

	$res = Get-PipelineArtifact -Name 'vscode_*'

	if (!$res) {
		continue
	}

	$res | ForEach-Object {
		$artifactName = $_.name
		if($set.Add($artifactName)) {
			Write-Host "Processing artifact: '$artifactName. Downloading from: $($_.resource.downloadUrl)"

			try {
				Invoke-RestMethod $_.resource.downloadUrl -OutFile "$env:AGENT_TEMPDIRECTORY/$artifactName.zip" -Headers @{
					Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
				} -MaximumRetryCount 5 -RetryIntervalSec 1

				Expand-Archive -Path "$env:AGENT_TEMPDIRECTORY/$artifactName.zip" -DestinationPath $env:AGENT_TEMPDIRECTORY
			} catch {
				Write-Warning $_
				$set.Remove($artifactName)
				continue
			}

			Write-Host "Expanding variables:"
			$null,$product,$os,$arch,$type = $artifactName -split '_'
			$asset = Get-ChildItem -rec "$env:AGENT_TEMPDIRECTORY/$artifactName"
			# turning in into an object just to log nicely
			@{
				product = $product
				os = $os
				arch = $arch
				type = $type
				asset = $asset.Name
			}

			exec { node build/azure-pipelines/common/createAsset.js $product $os $arch $type $asset.Name $asset.FullName }
			$artifactName >> "$env:AGENT_TEMPDIRECTORY/$ARTIFACT_PROCESSED_ARTIFACT_NAME.txt"
		}
	}

	# Get the timeline and see if it says the other stage completed
	try {
		$timeline = Invoke-RestMethod "$($env:BUILDS_API_URL)timeline?api-version=6.0" -Headers @{
			Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
		}  -MaximumRetryCount 5 -RetryIntervalSec 1
	} catch {
		Write-Warning $_
		continue
	}

	foreach ($stage in $stages) {
		$otherStageFinished = $timeline.records | Where-Object { $_.name -eq $stage -and $_.type -eq 'stage' -and $_.state -eq 'completed' }
		if (!$otherStageFinished) {
			break
		}
	}
} while (!$otherStageFinished)

Write-Host "DONE WITH NUMBER OF ARTIFACTS: $($set.Count)"
