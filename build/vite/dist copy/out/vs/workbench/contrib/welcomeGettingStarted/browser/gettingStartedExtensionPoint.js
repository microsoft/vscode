/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
const titleTranslated = localize('title', "Title");
export const walkthroughsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'walkthroughs',
    jsonSchema: {
        description: localize('walkthroughs', "Contribute walkthroughs to help users getting started with your extension."),
        type: 'array',
        items: {
            type: 'object',
            required: ['id', 'title', 'description', 'steps'],
            defaultSnippets: [{ body: { 'id': '$1', 'title': '$2', 'description': '$3', 'steps': [] } }],
            properties: {
                id: {
                    type: 'string',
                    description: localize('walkthroughs.id', "Unique identifier for this walkthrough."),
                },
                title: {
                    type: 'string',
                    description: localize('walkthroughs.title', "Title of walkthrough.")
                },
                icon: {
                    type: 'string',
                    description: localize('walkthroughs.icon', "Relative path to the icon of the walkthrough. The path is relative to the extension location. If not specified, the icon defaults to the extension icon if available."),
                },
                description: {
                    type: 'string',
                    description: localize('walkthroughs.description', "Description of walkthrough.")
                },
                featuredFor: {
                    type: 'array',
                    description: localize('walkthroughs.featuredFor', "Walkthroughs that match one of these glob patterns appear as 'featured' in workspaces with the specified files. For example, a walkthrough for TypeScript projects might specify `tsconfig.json` here."),
                    items: {
                        type: 'string'
                    },
                },
                when: {
                    type: 'string',
                    description: localize('walkthroughs.when', "Context key expression to control the visibility of this walkthrough.")
                },
                steps: {
                    type: 'array',
                    description: localize('walkthroughs.steps', "Steps to complete as part of this walkthrough."),
                    items: {
                        type: 'object',
                        required: ['id', 'title', 'media'],
                        defaultSnippets: [{
                                body: {
                                    'id': '$1', 'title': '$2', 'description': '$3',
                                    'completionEvents': ['$5'],
                                    'media': {},
                                }
                            }],
                        properties: {
                            id: {
                                type: 'string',
                                description: localize('walkthroughs.steps.id', "Unique identifier for this step. This is used to keep track of which steps have been completed."),
                            },
                            title: {
                                type: 'string',
                                description: localize('walkthroughs.steps.title', "Title of step.")
                            },
                            description: {
                                type: 'string',
                                description: localize('walkthroughs.steps.description.interpolated', "Description of step. Supports ``preformatted``, __italic__, and **bold** text. Use markdown-style links for commands or external links: {0}, {1}, or {2}. Links on their own line will be rendered as buttons.", `[${titleTranslated}](command:myext.command)`, `[${titleTranslated}](command:toSide:myext.command)`, `[${titleTranslated}](https://aka.ms)`)
                            },
                            button: {
                                deprecationMessage: localize('walkthroughs.steps.button.deprecated.interpolated', "Deprecated. Use markdown links in the description instead, i.e. {0}, {1}, or {2}", `[${titleTranslated}](command:myext.command)`, `[${titleTranslated}](command:toSide:myext.command)`, `[${titleTranslated}](https://aka.ms)`),
                            },
                            media: {
                                type: 'object',
                                description: localize('walkthroughs.steps.media', "Media to show alongside this step, either an image or markdown content."),
                                oneOf: [
                                    {
                                        required: ['image', 'altText'],
                                        additionalProperties: false,
                                        properties: {
                                            path: {
                                                deprecationMessage: localize('pathDeprecated', "Deprecated. Please use `image` or `markdown` instead")
                                            },
                                            image: {
                                                description: localize('walkthroughs.steps.media.image.path.string', "Path to an image - or object consisting of paths to light, dark, and hc images - relative to extension directory. Depending on context, the image will be displayed from 400px to 800px wide, with similar bounds on height. To support HIDPI displays, the image will be rendered at 1.5x scaling, for example a 900 physical pixels wide image will be displayed as 600 logical pixels wide."),
                                                oneOf: [
                                                    {
                                                        type: 'string',
                                                    },
                                                    {
                                                        type: 'object',
                                                        required: ['dark', 'light', 'hc', 'hcLight'],
                                                        properties: {
                                                            dark: {
                                                                description: localize('walkthroughs.steps.media.image.path.dark.string', "Path to the image for dark themes, relative to extension directory."),
                                                                type: 'string',
                                                            },
                                                            light: {
                                                                description: localize('walkthroughs.steps.media.image.path.light.string', "Path to the image for light themes, relative to extension directory."),
                                                                type: 'string',
                                                            },
                                                            hc: {
                                                                description: localize('walkthroughs.steps.media.image.path.hc.string', "Path to the image for hc themes, relative to extension directory."),
                                                                type: 'string',
                                                            },
                                                            hcLight: {
                                                                description: localize('walkthroughs.steps.media.image.path.hcLight.string', "Path to the image for hc light themes, relative to extension directory."),
                                                                type: 'string',
                                                            }
                                                        }
                                                    }
                                                ]
                                            },
                                            altText: {
                                                type: 'string',
                                                description: localize('walkthroughs.steps.media.altText', "Alternate text to display when the image cannot be loaded or in screen readers.")
                                            }
                                        }
                                    },
                                    {
                                        required: ['svg', 'altText'],
                                        additionalProperties: false,
                                        properties: {
                                            svg: {
                                                description: localize('walkthroughs.steps.media.image.path.svg', "Path to an svg, color tokens are supported in variables to support theming to match the workbench."),
                                                type: 'string',
                                            },
                                            altText: {
                                                type: 'string',
                                                description: localize('walkthroughs.steps.media.altText', "Alternate text to display when the image cannot be loaded or in screen readers.")
                                            },
                                        }
                                    },
                                    {
                                        required: ['markdown'],
                                        additionalProperties: false,
                                        properties: {
                                            path: {
                                                deprecationMessage: localize('pathDeprecated', "Deprecated. Please use `image` or `markdown` instead")
                                            },
                                            markdown: {
                                                description: localize('walkthroughs.steps.media.markdown.path', "Path to the markdown document, relative to extension directory."),
                                                type: 'string',
                                            }
                                        }
                                    }
                                ]
                            },
                            completionEvents: {
                                description: localize('walkthroughs.steps.completionEvents', "Events that should trigger this step to become checked off. If empty or not defined, the step will check off when any of the step's buttons or links are clicked; if the step has no buttons or links it will check on when it is selected."),
                                type: 'array',
                                items: {
                                    type: 'string',
                                    defaultSnippets: [
                                        {
                                            label: 'onCommand',
                                            description: localize('walkthroughs.steps.completionEvents.onCommand', 'Check off step when a given command is executed anywhere in VS Code.'),
                                            body: 'onCommand:${1:commandId}'
                                        },
                                        {
                                            label: 'onLink',
                                            description: localize('walkthroughs.steps.completionEvents.onLink', 'Check off step when a given link is opened via a walkthrough step.'),
                                            body: 'onLink:${2:linkId}'
                                        },
                                        {
                                            label: 'onView',
                                            description: localize('walkthroughs.steps.completionEvents.onView', 'Check off step when a given view is opened'),
                                            body: 'onView:${2:viewId}'
                                        },
                                        {
                                            label: 'onSettingChanged',
                                            description: localize('walkthroughs.steps.completionEvents.onSettingChanged', 'Check off step when a given setting is changed'),
                                            body: 'onSettingChanged:${2:settingName}'
                                        },
                                        {
                                            label: 'onContext',
                                            description: localize('walkthroughs.steps.completionEvents.onContext', 'Check off step when a context key expression is true.'),
                                            body: 'onContext:${2:key}'
                                        },
                                        {
                                            label: 'onExtensionInstalled',
                                            description: localize('walkthroughs.steps.completionEvents.extensionInstalled', 'Check off step when an extension with the given id is installed. If the extension is already installed, the step will start off checked.'),
                                            body: 'onExtensionInstalled:${3:extensionId}'
                                        },
                                        {
                                            label: 'onStepSelected',
                                            description: localize('walkthroughs.steps.completionEvents.stepSelected', 'Check off step as soon as it is selected.'),
                                            body: 'onStepSelected'
                                        },
                                    ]
                                }
                            },
                            doneOn: {
                                description: localize('walkthroughs.steps.doneOn', "Signal to mark step as complete."),
                                deprecationMessage: localize('walkthroughs.steps.doneOn.deprecation', "doneOn is deprecated. By default steps will be checked off when their buttons are clicked, to configure further use completionEvents"),
                                type: 'object',
                                required: ['command'],
                                defaultSnippets: [{ 'body': { command: '$1' } }],
                                properties: {
                                    'command': {
                                        description: localize('walkthroughs.steps.oneOn.command', "Mark step done when the specified command is executed."),
                                        type: 'string'
                                    }
                                },
                            },
                            when: {
                                type: 'string',
                                description: localize('walkthroughs.steps.when', "Context key expression to control the visibility of this step.")
                            }
                        }
                    }
                }
            }
        }
    },
    activationEventsGenerator: function* (walkthroughContributions) {
        for (const walkthroughContribution of walkthroughContributions) {
            if (walkthroughContribution.id) {
                yield `onWalkthrough:${walkthroughContribution.id}`;
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0dGluZ1N0YXJ0ZWRFeHRlbnNpb25Qb2ludC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkRXh0ZW5zaW9uUG9pbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRS9GLE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFbkQsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsa0JBQWtCLENBQUMsc0JBQXNCLENBQWlCO0lBQ25HLGNBQWMsRUFBRSxjQUFjO0lBQzlCLFVBQVUsRUFBRTtRQUNYLFdBQVcsRUFBRSxRQUFRLENBQUMsY0FBYyxFQUFFLDRFQUE0RSxDQUFDO1FBQ25ILElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7WUFDZCxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUM7WUFDakQsZUFBZSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUM1RixVQUFVLEVBQUU7Z0JBQ1gsRUFBRSxFQUFFO29CQUNILElBQUksRUFBRSxRQUFRO29CQUNkLFdBQVcsRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUseUNBQXlDLENBQUM7aUJBQ25GO2dCQUNELEtBQUssRUFB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