Param(
  [string]$AuthCertificateBase64,
  [string]$AuthCertificateKey
)

# Import auth certificate
$AuthCertificateFileName = [System.IO.Path]::GetTempFileName()
$AuthCertificateBytes = [Convert]::FromBase64String($AuthCertificateBase64)
[IO.File]::WriteAllBytes($AuthCertificateFileName, $AuthCertificateBytes)
$AuthCertificate = Import-PfxCertificate -FilePath $AuthCertificateFileName -CertStoreLocation Cert:\LocalMachine\My -Password (ConvertTo-SecureString $AuthCertificateKey -AsPlainText -Force)
rm $AuthCertificateFileName
$ESRPAuthCertificateSubjectName = $AuthCertificate.Subject

Write-Output ("##vso[task.setvariable variable=ESRPAuthCertificateSubjectName;]$ESRPAuthCertificateSubjectName")