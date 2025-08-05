#!/bin/bash

# This script will output laguages inside the TARGET_DIR
# LANGUAGE_TYPE should be 0 for non compiled languages and 1 for compiled languages
#
# Usage: ./detect-languages.sh <TARGET_DIR> <LANGUAGE_TYPE>

TARGET_DIR="$1"
LANGUAGE_TYPE="$2"

languages=""
languages_compiled=""
for file in $(find "$TARGET_DIR" -type f); do
  case "${file##*.}" in
    "js"|"ts") languages="$languages,javascript" ;;
    "py") languages="$languages,python" ;;
    "java") languages_compiled="$languages_compiled,java" ;;
    "cpp"|"c"|"h"|"hpp"|"c++"|"cxx"|"hh"|"h++"|"hxx"|"cc") languages_compiled="$languages_compiled,cpp" ;;
    "cs"|"sln"|"csproj"|"cshtml"|"xaml") languages_compiled="$languages_compiled,csharp" ;;
    "go") languages_compiled="$languages_compiled,go" ;;
    "rb") languages="$languages,ruby" ;;
    "swift") languages_compiled="$languages_compiled,swift" ;;
    "ts"|"tsx"|"mts"|"cts") languages="$languages,typescript" ;;
  esac
done

languages=$(echo "$languages" | tr ',' '\n' | sort -u | tr '\n' ',' | sed 's/,$//' | sed 's/^,//')
languages_compiled=$(echo "$languages_compiled" | tr ',' '\n' | sort -u | tr '\n' ',' | sed 's/,$//' | sed 's/^,//')

if [ "$LANGUAGE_TYPE" = "0" ]; then
  echo $languages
fi
if [ "$LANGUAGE_TYPE" = "1" ]; then
  echo $languages_compiled
fi
