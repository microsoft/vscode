param ($CertBase64)
$ErrorActionPreference = "Stop"

$CertBytes = [System.Convert]::FromBase64String($CertBase64)
$CertCollection = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
$CertCollection.Import($CertBytes, $null, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable -bxor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet)

$CertStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("My","LocalMachine")
$CertStore.Open("ReadWrite")
$CertStore.AddRange($CertCollection)
$CertStore.Close()

$ESRPAuthCertificateSubjectName = $CertCollection[0].Subject
Write-Output ("##vso[task.setvariable variable=ESRPAuthCertificateSubjectName;]$ESRPAuthCertificateSubjectName")
