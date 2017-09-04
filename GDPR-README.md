Snippets defined for GDPR classification:

```json
{
	"gdprCommonProperty": {
		"prefix": "gdprcommon",
		"body": [
			"// __GDPR__COMMON__ \"common.${1:propertyName}\" : { \"endPoint\": \"${2|none,SqmUserId,SqmMachineId|}\", \"classification\": \"${3|SystemMetaData,CustomerContent,EndUserPseudonymizedInformation|}\", \"purpose\": \"${4|FeatureInsight,PerformanceAndHealth,BusinessInsight,SecurityAndAuditing|}\" }\n"
		],
		"description": "GDPR - declare a common property"
	},
	"gdprProperty": {
		"prefix": "gdprproperty",
		"body": [
			"\"${1:propertyName}\": { \"endPoint\": \"${3|none,SqmUserId,SqmMachineId|}\", \"classification\": \"${4|SystemMetaData,CustomerContent,EndUserPseudonymizedInformation,PublicPersonalData,PublicNonPersonalData|}\", \"purpose\": \"${5|FeatureInsight,PerformanceAndHealth,BusinessInsight,SecurityAndAuditing|}\" }$2$0"
		],
		"description": "GDPR - declare a property"
	},
	"gdprInclude": {
		"prefix": "gdprinclude",
		"body": [
			"\"\\${include}\": [",
			"   \"\\${${1:FragmentName}}\"$0",
			"]"
		],
		"description": "GDPR - include fragments"
	},
	"gdprIncludeFragment": {
		"prefix": "gdprincludefragment",
		"body": [
			"\"\\${${1:FragmentName}}\"$0"
		],
		"description": "GDPR - include a fragment"
	},
	"gdprEvent": {
		"prefix": "gdprevent",
		"body": [
			"/* __GDPR__",
			"   \"${1:eventName}\" : {",
			"      \"${2:propertyName}\" : { \"endPoint\": \"${4|none,SqmUserId,SqmMachineId|}\", \"classification\": \"${5|SystemMetaData,CustomerContent,EndUserPseudonymizedInformation|}\", \"purpose\": \"${6|FeatureInsight,PerformanceAndHealth,BusinessInsight,SecurityAndAuditing|}\" }$3$0",
			"   }",
			" */\n"
		],
		"description": "GDPR - declare an event"
	},
	"gdprFragment": {
		"prefix": "gdprinclude",
		"body": [
			"/* __GDPR__FRAGMENT__",
			"   \"${1:fragmentName}\" : {",
			"      \"${2:propertyName}\" : { \"endPoint\": \"${4|none,SqmUserId,SqmMachineId|}\", \"classification\": \"${5|SystemMetaData,CustomerContent,EndUserPseudonymizedInformation|}\", \"purpose\": \"${6|FeatureInsight,PerformanceAndHealth,BusinessInsight,SecurityAndAuditing|}\" }$3$0",
			"   }",
			" */\n"
		],
		"description": "GDPR - declare a fragment"
	}
}
```


Keybindings defined for GDPR snippets:

```json
[
    {
        "key": "ctrl+9",
        "command": "editor.action.insertSnippet",
        "when": "editorTextFocus",
        "args": {
            "langId": "typescript",
            "name": "gdprCommonProperty"
        }
    },
    {
        "key": "ctrl+8 ctrl+8",
        "command": "editor.action.insertSnippet",
        "when": "editorTextFocus",
        "args": {
            "langId": "typescript",
            "name": "gdprFragment"
        }
    },
    {
        "key": "ctrl+0 ctrl+8",
        "command": "editor.action.insertSnippet",
        "when": "editorTextFocus",
        "args": {
            "langId": "typescript",
            "name": "gdprInclude"
        }
    },
    {
        "key": "ctrl+0 ctrl+7",
        "command": "editor.action.insertSnippet",
        "when": "editorTextFocus",
        "args": {
            "langId": "typescript",
            "name": "gdprIncludeFragment"
        }
    },
    {
        "key": "ctrl+0 ctrl+0",
        "command": "editor.action.insertSnippet",
        "when": "editorTextFocus",
        "args": {
            "langId": "typescript",
            "name": "gdprEvent"
        }
    },
    {
        "key": "ctrl+0 ctrl+9",
        "command": "editor.action.insertSnippet",
        "when": "editorTextFocus",
        "args": {
            "langId": "typescript",
            "name": "gdprProperty"
        }
    },
    {
        "key": "ctrl+8 ctrl+9",
        "command": "editor.action.insertSnippet",
        "when": "editorTextFocus",
        "args": {
            "langId": "typescript",
            "name": "gdprProperty"
        }
    }
]

```