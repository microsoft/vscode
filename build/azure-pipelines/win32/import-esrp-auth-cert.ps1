$ErrorActionPreference = "Stop"

az keyvault certificate download --vault-name vscode -n ESRP-SSL-AADAuth -f cert.pem
$AuthCertificate = Import-Certificate -FilePath cert.pem -CertStoreLocation Cert:\LocalMachine\My
rm cert.pem

$ESRPAuthCertificateSubjectName = $AuthCertificate.Subject
Write-Output ("##vso[task.setvariable variable=ESRPAuthCertificateSubjectName;]$ESRPAuthCertificateSubjectName")
