. build/azure-pipelines/win32/exec.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$set = [System.Collections.Generic.HashSet[string]]::new()

# Determine which stages we need to watch
$stages = @(
	if ('$(VSCODE_BUILD_STAGE_WINDOWS)' -eq 'True') { 'Windows' }
	if ('$(VSCODE_BUILD_STAGE_LINUX)' -eq 'True') { 'Linux' }
	if ('$(VSCODE_BUILD_STAGE_MACOS)' -eq 'True') { 'macOS' }
)

do
{
	Start-Sleep -Seconds 10

	try
	{
		$res = Invoke-RestMethod "$(BUILDS_API_URL)artifacts?api-version=6.0" -Headers @{
			Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
		} -MaximumRetryCount 5 -RetryIntervalSec 1
	} catch {
		Write-Warning $_
		$res = $null
	}

	if ($res)
	{
		$res.value | Where-Object { $_.name -Like 'vscode_*' } | ForEach-Object {
			$artifactName = $_.name
			if($set.Add($artifactName))
			{
				Write-Host "Processing artifact: '$artifactName. Downloading from: $($_.resource.downloadUrl)"

				try
				{
					Invoke-RestMethod $_.resource.downloadUrl -OutFile "$(Agent.TempDirectory)/$artifactName.zip" -Headers @{
						Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
					} -MaximumRetryCount 5 -RetryIntervalSec 1
				} catch
				{
					Write-Warning $_
					$set.Remove($artifactName)
					continue
				}

				try
				{
					Expand-Archive -Path "$(Agent.TempDirectory)/$artifactName.zip" -DestinationPath "$(Agent.TempDirectory)"
				} catch
				{
					Write-Warning $_
					$set.Remove($artifactName)
					continue
				}

				Write-Host "Expanding variables:"
				$null,$product,$os,$arch,$type = $artifactName -split '_'
				$asset = Get-ChildItem -rec "$(Agent.TempDirectory)/$artifactName"
				# turning in into an object just to log nicely
				@{
					product = $product
					os = $os
					arch = $arch
					type = $type
					asset = $asset.Name
				}

				$ErrorActionPreference = "Stop"
				$env:VSCODE_MIXIN_PASSWORD="$(github-distro-mixin-password)"
				$env:AZURE_DOCUMENTDB_MASTERKEY="$(builds-docdb-key-readwrite)"
				$env:AZURE_STORAGE_ACCESS_KEY="$(ticino-storage-key)"
				$env:AZURE_STORAGE_ACCESS_KEY_2="$(vscode-storage-key)"

				if ($os -eq 'darwin' -and $product -eq 'client') {
					exec { node build/azure-pipelines/common/createAsset.js $product $os $arch $type $asset.Name $asset.FullName }
				}
			}
		}
	}

	# Get the timeline and see if it says the other stage completed
	try
	{
		$timeline = Invoke-RestMethod "$(BUILDS_API_URL)timeline?api-version=6.0" -Headers @{
			Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
		}  -MaximumRetryCount 5 -RetryIntervalSec 1
	} catch
	{
		Write-Warning $_
		continue
	}

	foreach ($stage in $stages)
	{
		$otherStageFinished = $timeline.records | Where-Object { $_.name -eq $stage -and $_.type -eq 'stage' -and $_.state -eq 'completed' }
		if (!$otherStageFinished)
		{
			break
		}
	}
} while (!$otherStageFinished)

Write-Host "DONE WITH NUMBER OF ARTIFACTS: $($set.Count)"
