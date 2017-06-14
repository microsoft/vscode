#!/bin/bash -e
# This is a VERY basic script for Create/Delete operations on repos and packages
# 
cmd=$1
urls=urls.txt
defaultPackageFile=new_package.json
defaultRepoFile=new_repo.json

function Bail
{
    echo "ERROR: $@"
    exit 1
}

function BailIfFileMissing {
    file="$1"
    if [ ! -f "$file" ]; then
        Bail "File $file does not exist"
    fi
}

function Usage {
    echo "USAGE: Manage repos and packages in an apt repository"
    echo "$0 -config FILENAME -listrepos | -listpkgs | -addrepo FILENAME | -addpkg FILENAME |"
    echo "-addpkgs FILENAME | -check ID | -delrepo REPOID | -delpkg PKGID"
    echo -e "\t-config FILENAME    :   JSON file containing API server name and creds"
    echo -e "\t-listrepos          :   List repositories"
    echo -e "\t-listpkgs [REGEX]   :   List packages, optionally filter by REGEX"
    echo -e "\t-addrepo FILENAME   :   Create a new repo using the specified JSON file"
    echo -e "\t-addpkg FILENAME    :   Add package to repo using the specified JSON file"
    echo -e "\t-addpkgs FILENAME   :   Add packages to repo using urls contained in FILENAME"
    echo -e "\t-check ID           :   Check upload operation by ID"
    echo -e "\t-delrepo REPOID     :   Delete the specified repo by ID"
    echo -e "\t-delpkg PKGID       :   Delete the specified package by ID"
    exit 1
}

function ParseFromJson {
    if [ -z "$secretContents" ]; then
        Bail "Unable to parse value because no JSON contents were specified"
    elif [ -z "$1" ]; then
        Bail "Unable to parse value from JSON because no key was specified"
    fi
    # Write value directly to stdout to be used by caller
    echo $secretContents | jq "$1" | tr -d '"'
}

function ParseConfigFile {
    configFile="$1"
    if [ -z "$configFile" ]; then
        echo "Must specify -config option"
        Usage
    fi
    BailIfFileMissing "$configFile"
    secretContents=$(cat "$configFile")
    
    server=$(ParseFromJson .server)
    protocol=$(ParseFromJson .protocol)
    port=$(ParseFromJson .port)
    repositoryId=$(ParseFromJson .repositoryId)
    user=$(ParseFromJson .username)
    pass=$(ParseFromJson .password)
    baseurl="$protocol://$user:$pass@$server:$port"
}

# List Repositories
function ListRepositories
{
    echo "Fetching repo list from $server..."
    curl -k "$baseurl/v1/repositories" | sed 's/,/,\n/g' | sed 's/^"/\t"/g'
    echo ""
}

# List packages, using $1 as a regex to filter results
function ListPackages
{
    echo "Fetching package list from $server"
    curl -k "$baseurl/v1/packages" | sed 's/{/\n{/g' | egrep "$1" | sed 's/,/,\n/g' | sed 's/^"/\t"/g'
    echo ""
}

# Create a new Repo using the specified JSON file
function AddRepo
{
    repoFile=$1
    if [ -z $repoFile ]; then
        Bail "Error: Must specify a JSON-formatted file. Reference $defaultRepoFile.template"
    fi
    if [ ! -f $repoFile ]; then
        Bail "Error: Cannot create repo - $repoFile does not exist"
    fi
    packageUrl=$(grep "url" $repoFile  | head -n 1 | awk '{print $2}' | tr -d ',')
    echo "Creating new repo on $server [$packageUrl]"
    curl -i -k "$baseurl/v1/repositories" --data @./$repoFile -H "Content-Type: application/json"
    echo ""
}

# Upload a single package using the specified JSON file
function AddPackage
{
    packageFile=$1
    if [ -z $packageFile ]; then
        Bail "Error: Must specify a JSON-formatted file. Reference $defaultPackageFile.template"
    fi
    if [ ! -f $packageFile ]; then
        Bail "Error: Cannot add package - $packageFile does not exist"
    fi
    packageUrl=$(grep "sourceUrl" $packageFile  | head -n 1 | awk '{print $2}')
    echo "Adding package to $server [$packageUrl]"
    curl -i -k "$baseurl/v1/packages" --data @./$packageFile -H "Content-Type: application/json"
    echo ""
}

# Upload a single package by dynamically creating a JSON file using a provided URL
function AddPackageByUrl
{
    url=$(echo "$1")
    if [ -z "$url" ]; then
        Bail "Unable to publish package because no URL was specified"
    fi
    tmpFile=$(mktemp)
    tmpOut=$(mktemp)
    if ! wget -q "$url" -O $tmpFile; then
        rm -f $tmpFile $tmpFile
        Bail "Unable to download URL $url"
    elif dpkg -I $tmpFile > $tmpOut 2> /dev/null; then
        echo "File is deb format"
        pkgName=$(grep "^\s*Package:" $tmpOut | awk '{print $2}')
        pkgVer=$(grep "^\s*Version:" $tmpOut | awk '{print $2}')
    elif rpm -qpi $tmpFile > $tmpOut 2> /dev/null; then
        echo "File is rpm format"
        pkgName=$(egrep "^Name" $tmpOut | tr -d ':' | awk '{print $2}')
        pkgVer=$(egrep "^Version" $tmpOut | tr -d ':' | awk '{print $2}')
    else
        rm -f $tmpFile $tmpOut
        Bail "File is not a valid deb/rpm package $url"
    fi
    
    rm -f $tmpFile $tmpOut
    if [ -z "$pkgName" ]; then
        Bail "Unable to parse package name for $url"
    elif [ -z "$pkgVer" ]; then
        Bail "Unable to parse package version number for $url"
    fi
    
    # Create Package .json file
    escapedUrl=$(echo "$url" | sed 's/\//\\\//g' | sed 's/\&/\\\&/g')
    cp $defaultPackageFile.template $defaultPackageFile
    sed -i "s/PACKAGENAME/$pkgName/g" $defaultPackageFile
    sed -i "s/PACKAGEVERSION/$pkgVer/g" $defaultPackageFile
    sed -i "s/PACKAGEURL/$escapedUrl/g" $defaultPackageFile
    sed -i "s/REPOSITORYID/$repositoryId/g" $defaultPackageFile
    # Perform Upload
    AddPackage $defaultPackageFile
    # Cleanup
    rm -f $defaultPackageFile 
}

# Upload multiple packages by reading urls line-by-line from the specified file
function AddPackages
{
    urlFile=$1
    if [ -z $urlFile ]; then
        Bail "Must specify a flat text file containing one or more URLs"
    fi
    if [ ! -f $urlFile ]; then
        Bail "Cannot add packages. File $urlFile does not exist"
    fi
    for url in $(cat $urlFile); do
        if [ -n "$url" ]; then
            AddPackageByUrl "$url"
        fi
        sleep 5
    done
}

# Check upload by ID
function CheckUpload {
    id=$1
    if [ -z "$id" ]; then
        Bail "Must specify an ID"
    fi
    curl -k $baseurl/v1/packages/queue/$id
    echo ""
}

# Delete the specified repo
function DeleteRepo
{
    repoId=$1
    if [ -z $repoId ]; then
        Bail "Please specify repository ID. Run -listrepos for a list of IDs"
    fi
    curl -I -k -X DELETE "$baseurl/v1/repositories/$repoId"
}

# Delete the specified package
function DeletePackage
{
    packageId=$1
    if [ -z $packageId ]; then
        Bail "Please specify package ID. Run -listpkgs for a list of IDs"
    fi
    echo Removing pkgId $packageId from repo $repositoryId
    curl -I -k -X DELETE "$baseurl/v1/packages/$packageId"
}

# Parse params
# Not using getopts because this uses multi-char flags
operation=
while (( "$#" )); do
    if [[ "$1" == "-config" ]]; then
        shift
        configFile="$1"
    elif [[ "$1" == "-listrepos" ]]; then
        operation=ListRepositories
    elif [[ "$1" == "-listpkgs" ]]; then
        operation=ListPackages
        if [ -n "$2" ]; then
            shift
            operand="$1"
        fi
    elif [[ "$1" == "-addrepo" ]]; then
        operation=AddRepo
        shift
        operand="$1"
    elif [[ "$1" == "-addpkg" ]]; then
        operation=AddPackage
        shift
        operand="$1"
    elif [[ "$1" == "-addpkgs" ]]; then
        operation=AddPackages
        shift
        operand="$1"
    elif [[ "$1" == "-check" ]]; then
        operation=CheckUpload
        shift
        operand="$1"
    elif [[ "$1" == "-delrepo" ]]; then
        operation=DeleteRepo
        shift
        operand="$1"
    elif [[ "$1" == "-delpkg" ]]; then
        operation=DeletePackage
        shift
        operand="$1"
    else
        Usage
    fi
    shift
done

echo "Performing $operation $operand"
# Parse config file
ParseConfigFile "$configFile"

# Exit if no operation was specified
if [ -z "operation" ]; then
    Usage
fi

$operation "$operand"
