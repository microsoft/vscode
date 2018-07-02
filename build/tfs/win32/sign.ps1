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
						KeyCode = "CP-229803"
						OperationCode = "SigntoolSign"
						Parameters = @{
							OpusName = "VS Code"
							OpusInfo = "https://code.visualstudio.com/"
							PageHash = "/NPH"
							TimeStamp = "/t `"http://ts4096.gtm.microsoft.com/TSS/AuthenticodeTS`""
						}
						ToolName = "sign"
						ToolVersion = "1.0"
					},
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
build\tfs\win32\ESRPClient\packages\EsrpClient.1.0.27\tools\ESRPClient.exe Sign -a $Auth -p $Policy -i $Input -o $Output