. build/azure-pipelines/win32/exec.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ARTIFACT_PROCESSED_WILDCARD_PATH = "$env:PIPELINE_WORKSPACE/artifacts_processed_*/artifacts_processed_*"
$ARTIFACT_PROCESSED_FILE_PATH = "$env:PIPELINE_WORKSPACE/artifacts_processed_$env:SYSTEM_STAGEATTEMPT/artifacts_processed_$env:SYSTEM_STAGEATTEMPT.txt"

function Get-PipelineArtifact {
	param($Name = '*')
	try {
		$res = Invoke-RestMethod "$($env:BUILDS_API_URL)artifacts?api-version=6.0" -Headers @{
			Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
		} -MaximumRetryCount 5 -RetryIntervalSec 1

		if (!$res) {
			return
		}

		$res.value | Where-Object { $_.name -Like $Name -and $_.name -NotLike "*sbom" }
	} catch {
		Write-Warning $_
	}
}

# This set will keep track of which artifacts have already been processed
$set = [System.Collections.Generic.HashSet[string]]::new()

if (Test-Path $ARTIFACT_PROCESSED_WILDCARD_PATH) {
	# Grab the latest artifact_processed text file and load all assets already processed from that.
	# This means that the latest artifact_processed_*.txt file has all of the contents of the previous ones.
	# Note: The kusto-like syntax only works in PS7+ and only in scripts, not at the REPL.
	Get-ChildItem $ARTIFACT_PROCESSED_WILDCARD_PATH
		# Sort by file name length first and then Name to make sure we sort numerically. Ex. 12 comes after 9.
		| Sort-Object { $_.Name.Length },Name -Bottom 1
		| Get-Content
		| ForEach-Object {
			$set.Add($_) | Out-Null
			Write-Host "Already processed artifact: $_"
		}
}

# Create the artifact file that will be used for this run
New-Item -Path $ARTIFACT_PROCESSED_FILE_PATH -Force | Out-Null

# Determine which stages we need to watch
$stages = @(
	if ($env:VSCODE_BUILD_STAGE_WINDOWS -eq 'True') { 'Windows' }
	if ($env:VSCODE_BUILD_STAGE_LINUX -eq 'True') { 'Linux' }
	if ($env:VSCODE_BUILD_STAGE_ALPINE -eq 'True') { 'Alpine' }
	if ($env:VSCODE_BUILD_STAGE_MACOS -eq 'True') { 'macOS' }
	if ($env:VSCODE_BUILD_STAGE_WEB -eq 'True') { 'Web' }
)

do {
	Start-Sleep -Seconds 10

	$artifacts = Get-PipelineArtifact -Name 'vscode_*'
	if (!$artifacts) {
		continue
	}

	$artifacts | ForEach-Object {
		$artifactName = $_.name

		if($set.Add($artifactName)) {
			Write-Host "Processing artifact: '$artifactName. Downloading from: $($_.resource.downloadUrl)"

			$extractPath = "$env:AGENT_TEMPDIRECTORY/$artifactName.zip"
			try {
				Invoke-RestMethod $_.resource.downloadUrl -OutFile $extractPath -Headers @{
					Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
				} -MaximumRetryCount 5 -RetryIntervalSec 1 -TimeoutSec 300 | Out-Null

				Write-Host "Extracting artifact: '$extractPath'"

				Expand-Archive -Path $extractPath -DestinationPath $env:AGENT_TEMPDIRECTORY | Out-Null
			} catch {
				Write-Warning $_
				$set.Remove($artifactName) | Out-Null
				continue
			}

			$null,$product,$os,$arch,$type = $artifactName -split '_'
			$asset = Get-ChildItem -rec "$env:AGENT_TEMPDIRECTORY/$artifactName"

			if ($asset.Size -ne $_.resource.properties.artifactsize) {
				Write-Warning "Artifact size mismatch for '$artifactName'. Expected: $($_.resource.properties.artifactsize). Actual: $($asset.Size)"
				$set.Remove($artifactName) | Out-Null
				continue
			}

			Write-Host "Processing artifact with the following values:"
			# turning in into an object just to log nicely
			@{
				product = $product
				os = $os
				arch = $arch
				type = $type
				asset = $asset.Name
			} | Format-Table

			exec { node build/azure-pipelines/common/createAsset.js $product $os $arch $type $asset.Name $asset.FullName }
		}

		# Mark the artifact as processed. Make sure to keep the previously
		# processed artifacts in the file as well, not just from this run.
		$artifactName >> $ARTIFACT_PROCESSED_FILE_PATH
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

	$artifacts = Get-PipelineArtifact -Name 'vscode_*'
	$artifactsStillToProcess = $artifacts.Count -ne $set.Count
} while (!$otherStageFinished -or $artifactsStillToProcess)

Write-Host "Processed $($set.Count) artifacts."
