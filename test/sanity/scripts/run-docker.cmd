@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0..
set CONTAINER=
set ARCH=amd64
set BASE_IMAGE=
set ARGS=

:parse_args
if "%~1"=="" goto :done_parsing
if "%~1"=="--container" (
	set CONTAINER=%~2
	shift & shift
	goto :parse_args
)
if "%~1"=="--arch" (
	set ARCH=%~2
	shift & shift
	goto :parse_args
)
if "%~1"=="--base-image" (
	set BASE_IMAGE=%~2
	shift & shift
	goto :parse_args
)
set "ARGS=!ARGS! %~1"
shift
goto :parse_args

:done_parsing
if "%CONTAINER%"=="" (
	echo Error: --container is required
	exit /b 1
)

set BASE_IMAGE_ARG=
if not "%BASE_IMAGE%"=="" set BASE_IMAGE_ARG=--build-arg "BASE_IMAGE=%BASE_IMAGE%"

echo Building container image: %CONTAINER%
docker buildx build ^
	--platform "linux/%ARCH%" ^
	%BASE_IMAGE_ARG% ^
	--tag "%CONTAINER%" ^
	--file "%ROOT%\containers\%CONTAINER%.dockerfile" ^
	"%ROOT%\containers"

echo Running sanity tests in container
docker run ^
	--rm ^
	--platform "linux/%ARCH%" ^
	--volume "%ROOT%:/root" ^
	"%CONTAINER%" ^
	%ARGS%
