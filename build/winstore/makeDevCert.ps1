param(
	[parameter(Mandatory=$true)]
	$publisher,
	[parameter(Mandatory=$true)]
	$certName,
	[parameter(Mandatory=$true)]
	$destination
)

# Remove Old Certificates
(Get-ChildItem Cert:\LocalMachine\My -recurse | Where-Object {$_.FriendlyName -match $certName} | Remove-Item)

# Create new Certificate
New-SelfSignedCertificate -Type Custom -Subject $publisher -KeyUsage DigitalSignature -FriendlyName $certName -CertStoreLocation "Cert:\LocalMachine\My"

# Get Current Certificate
$cert = (Get-ChildItem Cert:\LocalMachine\My -recurse | Where-Object {$_.FriendlyName -match $certName} | Select-Object -Last 1).thumbprint

# Copy to Trusted
Copy-Item -Path Cert:\LocalMachine\My\$cert -Destination Cert:\LocalMachine\TrustedPeople

# Export Certificate
Export-Certificate -cert "Cert:\LocalMachine\My\$cert" -FilePath $destination -Type CERT