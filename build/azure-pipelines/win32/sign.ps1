function Create-TmpJson($Obj) {
	$FileName = [System.IO.Path]::GetTempFileName()
	ConvertTo-Json -Depth 100 $Obj | Out-File -Encoding UTF8 $FileName
	return $FileName
}

$Auth = Create-TmpJson @{
	Version = "1.0.0"
	AuthenticationType = "AAD_CERT"
	ClientId = $env:ESRPClientId
	AuthCert = @{
		SubjectName = $env:ESRPAuthCertificateSubjectName
		StoreLocation = "LocalMachine"
		StoreName = "My"
	}
	RequestSigningCert = @{
		SubjectName = $env:ESRPCertificateSubjectName
		StoreLocation = "LocalMachine"
		StoreName = "My"
	}
}

$Policy = Create-TmpJson @{
	Version = "1.0.0"
}

$Input = Create-TmpJson @{
	Version = "1.0.0"
	SignBatches = @(
		@{
			SourceLocationType = "UNC"
			SignRequestFiles = @(
				@{
					SourceLocation = $args[0]
				}
			)
			SigningInfo = @{
				Operations = @(
					@{
						KeyCode = "CP-230012"
						OperationCode = "SigntoolSign"
						Parameters = @{
							OpusName = "VS Code"
							OpusInfo = "https://code.visualstudio.com/"
							Append = "/as"
							FileDigest = "/fd `"SHA256`""
							PageHash = "/NPH"
							TimeStamp = "/tr `"http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer`" /td sha256"
						}
						ToolName = "sign"
						ToolVersion = "1.0"
					},
					@{
						KeyCode = "CP-230012"
						OperationCode = "SigntoolVerify"
						Parameters = @{
							VerifyAll = "/all"
						}
						ToolName = "sign"
						ToolVersion = "1.0"
					}
				)
			}
		}
	)
}

$Output = [System.IO.Path]::GetTempFileName()
$ScriptPath = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
& "$ScriptPath\ESRPClient\packages\Microsoft.ESRPClient.1.2.25\tools\ESRPClient.exe" Sign -a $Auth -p $Policy -i $Input -o $Output
