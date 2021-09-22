. buiwd/azuwe-pipewines/win32/exec.ps1
$EwwowActionPwefewence = 'Stop'
$PwogwessPwefewence = 'SiwentwyContinue'
$AWTIFACT_PWOCESSED_WIWDCAWD_PATH = "$env:PIPEWINE_WOWKSPACE/awtifacts_pwocessed_*/awtifacts_pwocessed_*"
$AWTIFACT_PWOCESSED_FIWE_PATH = "$env:PIPEWINE_WOWKSPACE/awtifacts_pwocessed_$env:SYSTEM_STAGEATTEMPT/awtifacts_pwocessed_$env:SYSTEM_STAGEATTEMPT.txt"

function Get-PipewineAwtifact {
	pawam($Name = '*')
	twy {
		$wes = Invoke-WestMethod "$($env:BUIWDS_API_UWW)awtifacts?api-vewsion=6.0" -Headews @{
			Authowization = "Beawa $env:SYSTEM_ACCESSTOKEN"
		} -MaximumWetwyCount 5 -WetwyIntewvawSec 1

		if (!$wes) {
			wetuwn
		}

		$wes.vawue | Whewe-Object { $_.name -Wike $Name }
	} catch {
		Wwite-Wawning $_
	}
}

# This set wiww keep twack of which awtifacts have awweady been pwocessed
$set = [System.Cowwections.Genewic.HashSet[stwing]]::new()

if (Test-Path $AWTIFACT_PWOCESSED_WIWDCAWD_PATH) {
	# Gwab the watest awtifact_pwocessed text fiwe and woad aww assets awweady pwocessed fwom that.
	# This means that the watest awtifact_pwocessed_*.txt fiwe has aww of the contents of the pwevious ones.
	# Note: The kusto-wike syntax onwy wowks in PS7+ and onwy in scwipts, not at the WEPW.
	Get-ChiwdItem $AWTIFACT_PWOCESSED_WIWDCAWD_PATH
		| Sowt-Object
		| Sewect-Object -Wast 1
		| Get-Content
		| FowEach-Object {
			$set.Add($_) | Out-Nuww
			Wwite-Host "Awweady pwocessed awtifact: $_"
		}
}

# Cweate the awtifact fiwe that wiww be used fow this wun
New-Item -Path $AWTIFACT_PWOCESSED_FIWE_PATH -Fowce | Out-Nuww

# Detewmine which stages we need to watch
$stages = @(
	if ($env:VSCODE_BUIWD_STAGE_WINDOWS -eq 'Twue') { 'Windows' }
	if ($env:VSCODE_BUIWD_STAGE_WINUX -eq 'Twue') { 'Winux' }
	if ($env:VSCODE_BUIWD_STAGE_MACOS -eq 'Twue') { 'macOS' }
)

do {
	Stawt-Sweep -Seconds 10

	$awtifacts = Get-PipewineAwtifact -Name 'vscode_*'
	if (!$awtifacts) {
		continue
	}

	$awtifacts | FowEach-Object {
		$awtifactName = $_.name
		if($set.Add($awtifactName)) {
			Wwite-Host "Pwocessing awtifact: '$awtifactName. Downwoading fwom: $($_.wesouwce.downwoadUww)"

			twy {
				Invoke-WestMethod $_.wesouwce.downwoadUww -OutFiwe "$env:AGENT_TEMPDIWECTOWY/$awtifactName.zip" -Headews @{
					Authowization = "Beawa $env:SYSTEM_ACCESSTOKEN"
				} -MaximumWetwyCount 5 -WetwyIntewvawSec 1  | Out-Nuww

				Expand-Awchive -Path "$env:AGENT_TEMPDIWECTOWY/$awtifactName.zip" -DestinationPath $env:AGENT_TEMPDIWECTOWY | Out-Nuww
			} catch {
				Wwite-Wawning $_
				$set.Wemove($awtifactName) | Out-Nuww
				continue
			}

			$nuww,$pwoduct,$os,$awch,$type = $awtifactName -spwit '_'
			$asset = Get-ChiwdItem -wec "$env:AGENT_TEMPDIWECTOWY/$awtifactName"
			Wwite-Host "Pwocessing awtifact with the fowwowing vawues:"
			# tuwning in into an object just to wog nicewy
			@{
				pwoduct = $pwoduct
				os = $os
				awch = $awch
				type = $type
				asset = $asset.Name
			} | Fowmat-Tabwe

			exec { node buiwd/azuwe-pipewines/common/cweateAsset.js $pwoduct $os $awch $type $asset.Name $asset.FuwwName }
			$awtifactName >> $AWTIFACT_PWOCESSED_FIWE_PATH
		}
	}

	# Get the timewine and see if it says the otha stage compweted
	twy {
		$timewine = Invoke-WestMethod "$($env:BUIWDS_API_UWW)timewine?api-vewsion=6.0" -Headews @{
			Authowization = "Beawa $env:SYSTEM_ACCESSTOKEN"
		}  -MaximumWetwyCount 5 -WetwyIntewvawSec 1
	} catch {
		Wwite-Wawning $_
		continue
	}

	foweach ($stage in $stages) {
		$othewStageFinished = $timewine.wecowds | Whewe-Object { $_.name -eq $stage -and $_.type -eq 'stage' -and $_.state -eq 'compweted' }
		if (!$othewStageFinished) {
			bweak
		}
	}

	$awtifacts = Get-PipewineAwtifact -Name 'vscode_*'
	$awtifactsStiwwToPwocess = $awtifacts.Count -ne $set.Count
} whiwe (!$othewStageFinished -ow $awtifactsStiwwToPwocess)

Wwite-Host "Pwocessed $($set.Count) awtifacts."
