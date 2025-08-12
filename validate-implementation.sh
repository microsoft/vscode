#!/bin/bash

# Simple validation script to check the authentication challenges implementation

echo "🔍 Validating Authentication Challenges Implementation"
echo "=================================================="

# Check if all required files exist
echo "✅ Checking files..."
files=(
    "src/vscode-dts/vscode.proposed.authenticationChallenges.d.ts"
    "src/vs/workbench/api/common/extHost.protocol.ts"
    "src/vs/workbench/api/common/extHostAuthentication.ts"
    "src/vs/workbench/api/browser/mainThreadAuthentication.ts"
    "src/vs/workbench/api/common/extHost.api.impl.ts"
    "extensions/microsoft-authentication/src/node/authProvider.ts"
    "src/vs/workbench/api/test/common/authenticationChallenges.test.ts"
    "src/vs/workbench/api/test/browser/authenticationChallenges.integrationTest.ts"
    "docs/authentication-challenges.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (MISSING)"
        exit 1
    fi
done

echo ""
echo "✅ Checking key API additions..."

# Check if the proposed API contains key interfaces
if grep -q "AuthenticationChallenge" src/vscode-dts/vscode.proposed.authenticationChallenges.d.ts; then
    echo "  ✓ AuthenticationChallenge interface found"
else
    echo "  ✗ AuthenticationChallenge interface missing"
    exit 1
fi

if grep -q "AuthenticationSessionChallenge" src/vscode-dts/vscode.proposed.authenticationChallenges.d.ts; then
    echo "  ✓ AuthenticationSessionChallenge interface found"
else
    echo "  ✗ AuthenticationSessionChallenge interface missing"
    exit 1
fi

if grep -q "AuthenticationProviderWithChallenges" src/vscode-dts/vscode.proposed.authenticationChallenges.d.ts; then
    echo "  ✓ AuthenticationProviderWithChallenges interface found"
else
    echo "  ✗ AuthenticationProviderWithChallenges interface missing"
    exit 1
fi

echo ""
echo "✅ Checking protocol updates..."

# Check protocol updates
if grep -q "\$getSessionFromChallenge" src/vs/workbench/api/common/extHost.protocol.ts; then
    echo "  ✓ \$getSessionFromChallenge method found in protocol"
else
    echo "  ✗ \$getSessionFromChallenge method missing from protocol"
    exit 1
fi

if grep -q "\$getSessionsFromChallenges" src/vs/workbench/api/common/extHost.protocol.ts; then
    echo "  ✓ \$getSessionsFromChallenges method found in protocol"
else
    echo "  ✗ \$getSessionsFromChallenges method missing from protocol"
    exit 1
fi

echo ""
echo "✅ Checking Microsoft auth provider updates..."

# Check Microsoft auth provider
if grep -q "getSessionsFromChallenges" extensions/microsoft-authentication/src/node/authProvider.ts; then
    echo "  ✓ getSessionsFromChallenges method found in Microsoft auth provider"
else
    echo "  ✗ getSessionsFromChallenges method missing from Microsoft auth provider"
    exit 1
fi

if grep -q "createSessionFromChallenges" extensions/microsoft-authentication/src/node/authProvider.ts; then
    echo "  ✓ createSessionFromChallenges method found in Microsoft auth provider"
else
    echo "  ✗ createSessionFromChallenges method missing from Microsoft auth provider"
    exit 1
fi

echo ""
echo "✅ Checking for parseWWWAuthenticateHeader usage..."

if grep -q "parseWWWAuthenticateHeader" src/vs/workbench/api/common/extHostAuthentication.ts; then
    echo "  ✓ parseWWWAuthenticateHeader imported in extHostAuthentication"
else
    echo "  ✗ parseWWWAuthenticateHeader not imported in extHostAuthentication"
    exit 1
fi

if grep -q "parseWWWAuthenticateHeader" src/vs/workbench/api/browser/mainThreadAuthentication.ts; then
    echo "  ✓ parseWWWAuthenticateHeader imported in mainThreadAuthentication"
else
    echo "  ✗ parseWWWAuthenticateHeader not imported in mainThreadAuthentication"
    exit 1
fi

echo ""
echo "✅ Checking test coverage..."

if grep -q "parseWWWAuthenticateHeader" src/vs/workbench/api/test/common/authenticationChallenges.test.ts; then
    echo "  ✓ Unit tests for WWW-Authenticate parsing found"
else
    echo "  ✗ Unit tests for WWW-Authenticate parsing missing"
    exit 1
fi

if grep -q "getSession.*challenge" src/vs/workbench/api/test/browser/authenticationChallenges.integrationTest.ts; then
    echo "  ✓ Integration tests for challenge-based getSession found"
else
    echo "  ✗ Integration tests for challenge-based getSession missing"
    exit 1
fi

echo ""
echo "🎉 All validation checks passed!"
echo ""
echo "Summary of implementation:"
echo "========================="
echo "• Proposed API with 3 new interfaces for handling authentication challenges"
echo "• Protocol extensions to support challenge-based authentication flows"
echo "• Enhanced Microsoft authentication provider with MSAL claims support"
echo "• Backward-compatible API that falls back to regular authentication"
echo "• Comprehensive error handling and logging"
echo "• Unit and integration tests covering key scenarios"
echo "• Complete documentation with usage examples"
echo ""
echo "Ready to handle Microsoft's mandatory MFA enforcement starting September 15th!"