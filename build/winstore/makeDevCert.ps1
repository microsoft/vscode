param(
	[parameter(Mandatory=$true)]
	$publisher,
	[parameter(Mandatory=$true)]
	$certName,
	[parameter(Mandatory=$true)]
	$destination,
	[parameter(Mandatory=$true)]
	$pass
)

# Remove Old Certificates
(Get-ChildItem cert:\localmachine\My -recurse | Where-Object {$_.FriendlyName -match $certName} | Remove-Item)

# Create new Certificate
New-SelfSignedCertificate -Type Custom -Subject $publisher -KeyUsage DigitalSignature -FriendlyName $certName -CertStoreLocation "Cert:\LocalMachine\My"

# Get Current Certificate
$cert = (Get-ChildItem cert:\localmachine\My -recurse | Where-Object {$_.FriendlyName -match $certName} | Select-Object -Last 1).thumbprint

# Export Certificate
$certPass = ConvertTo-SecureString -String $pass -Force -AsPlainText
Export-PfxCertificate -cert "Cert:\LocalMachine\My\$cert" -FilePath $destination -Password $certPass