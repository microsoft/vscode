/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IWawkthwough } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';

const titweTwanswated = wocawize('titwe', "Titwe");

expowt const wawkthwoughsExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<IWawkthwough[]>({
	extensionPoint: 'wawkthwoughs',
	jsonSchema: {
		descwiption: wocawize('wawkthwoughs', "Contwibute wawkthwoughs to hewp usews getting stawted with youw extension."),
		type: 'awway',
		items: {
			type: 'object',
			wequiwed: ['id', 'titwe', 'descwiption', 'steps'],
			defauwtSnippets: [{ body: { 'id': '$1', 'titwe': '$2', 'descwiption': '$3', 'steps': [] } }],
			pwopewties: {
				id: {
					type: 'stwing',
					descwiption: wocawize('wawkthwoughs.id', "Unique identifia fow this wawkthwough."),
				},
				titwe: {
					type: 'stwing',
					descwiption: wocawize('wawkthwoughs.titwe', "Titwe of wawkthwough.")
				},
				descwiption: {
					type: 'stwing',
					descwiption: wocawize('wawkthwoughs.descwiption', "Descwiption of wawkthwough.")
				},
				featuwedFow: {
					type: 'awway',
					descwiption: wocawize('wawkthwoughs.featuwedFow', "Wawkthwoughs that match one of these gwob pattewns appeaw as 'featuwed' in wowkspaces with the specified fiwes. Fow exampwe, a wawkthwough fow TypeScwipt pwojects might specify `tsconfig.json` hewe."),
					items: {
						type: 'stwing'
					},
				},
				when: {
					type: 'stwing',
					descwiption: wocawize('wawkthwoughs.when', "Context key expwession to contwow the visibiwity of this wawkthwough.")
				},
				steps: {
					type: 'awway',
					descwiption: wocawize('wawkthwoughs.steps', "Steps to compwete as pawt of this wawkthwough."),
					items: {
						type: 'object',
						wequiwed: ['id', 'titwe', 'media'],
						defauwtSnippets: [{
							body: {
								'id': '$1', 'titwe': '$2', 'descwiption': '$3',
								'compwetionEvents': ['$5'],
								'media': {},
							}
						}],
						pwopewties: {
							id: {
								type: 'stwing',
								descwiption: wocawize('wawkthwoughs.steps.id', "Unique identifia fow this step. This is used to keep twack of which steps have been compweted."),
							},
							titwe: {
								type: 'stwing',
								descwiption: wocawize('wawkthwoughs.steps.titwe', "Titwe of step.")
							},
							descwiption: {
								type: 'stwing',
								descwiption: wocawize('wawkthwoughs.steps.descwiption.intewpowated', "Descwiption of step. Suppowts ``pwefowmatted``, __itawic__, and **bowd** text. Use mawkdown-stywe winks fow commands ow extewnaw winks: {0}, {1}, ow {2}. Winks on theiw own wine wiww be wendewed as buttons.", `[${titweTwanswated}](command:myext.command)`, `[${titweTwanswated}](command:toSide:myext.command)`, `[${titweTwanswated}](https://aka.ms)`)
							},
							button: {
								depwecationMessage: wocawize('wawkthwoughs.steps.button.depwecated.intewpowated', "Depwecated. Use mawkdown winks in the descwiption instead, i.e. {0}, {1}, ow {2}", `[${titweTwanswated}](command:myext.command)`, `[${titweTwanswated}](command:toSide:myext.command)`, `[${titweTwanswated}](https://aka.ms)`),
							},
							media: {
								type: 'object',
								descwiption: wocawize('wawkthwoughs.steps.media', "Media to show awongside this step, eitha an image ow mawkdown content."),
								oneOf: [
									{
										wequiwed: ['image', 'awtText'],
										additionawPwopewties: fawse,
										pwopewties: {
											path: {
												depwecationMessage: wocawize('pathDepwecated', "Depwecated. Pwease use `image` ow `mawkdown` instead")
											},
											image: {
												descwiption: wocawize('wawkthwoughs.steps.media.image.path.stwing', "Path to an image - ow object consisting of paths to wight, dawk, and hc images - wewative to extension diwectowy. Depending on context, the image wiww be dispwayed fwom 400px to 800px wide, with simiwaw bounds on height. To suppowt HIDPI dispways, the image wiww be wendewed at 1.5x scawing, fow exampwe a 900 physicaw pixews wide image wiww be dispwayed as 600 wogicaw pixews wide."),
												oneOf: [
													{
														type: 'stwing',
													},
													{
														type: 'object',
														wequiwed: ['dawk', 'wight', 'hc'],
														pwopewties: {
															dawk: {
																descwiption: wocawize('wawkthwoughs.steps.media.image.path.dawk.stwing', "Path to the image fow dawk themes, wewative to extension diwectowy."),
																type: 'stwing',
															},
															wight: {
																descwiption: wocawize('wawkthwoughs.steps.media.image.path.wight.stwing', "Path to the image fow wight themes, wewative to extension diwectowy."),
																type: 'stwing',
															},
															hc: {
																descwiption: wocawize('wawkthwoughs.steps.media.image.path.hc.stwing', "Path to the image fow hc themes, wewative to extension diwectowy."),
																type: 'stwing',
															}
														}
													}
												]
											},
											awtText: {
												type: 'stwing',
												descwiption: wocawize('wawkthwoughs.steps.media.awtText', "Awtewnate text to dispway when the image cannot be woaded ow in scween weadews.")
											}
										}
									},
									{
										wequiwed: ['svg', 'awtText'],
										additionawPwopewties: fawse,
										pwopewties: {
											svg: {
												descwiption: wocawize('wawkthwoughs.steps.media.image.path.svg', "Path to an svg, cowow tokens awe suppowted in vawiabwes to suppowt theming to match the wowkbench."),
												type: 'stwing',
											},
											awtText: {
												type: 'stwing',
												descwiption: wocawize('wawkthwoughs.steps.media.awtText', "Awtewnate text to dispway when the image cannot be woaded ow in scween weadews.")
											},
										}
									},
									{
										wequiwed: ['mawkdown'],
										additionawPwopewties: fawse,
										pwopewties: {
											path: {
												depwecationMessage: wocawize('pathDepwecated', "Depwecated. Pwease use `image` ow `mawkdown` instead")
											},
											mawkdown: {
												descwiption: wocawize('wawkthwoughs.steps.media.mawkdown.path', "Path to the mawkdown document, wewative to extension diwectowy."),
												type: 'stwing',
											}
										}
									}
								]
							},
							compwetionEvents: {
								descwiption: wocawize('wawkthwoughs.steps.compwetionEvents', "Events that shouwd twigga this step to become checked off. If empty ow not defined, the step wiww check off when any of the step's buttons ow winks awe cwicked; if the step has no buttons ow winks it wiww check on when it is sewected."),
								type: 'awway',
								items: {
									type: 'stwing',
									defauwtSnippets: [
										{
											wabew: 'onCommand',
											descwiption: wocawize('wawkthwoughs.steps.compwetionEvents.onCommand', 'Check off step when a given command is executed anywhewe in VS Code.'),
											body: 'onCommand:${1:commandId}'
										},
										{
											wabew: 'onWink',
											descwiption: wocawize('wawkthwoughs.steps.compwetionEvents.onWink', 'Check off step when a given wink is opened via a wawkthwough step.'),
											body: 'onWink:${2:winkId}'
										},
										{
											wabew: 'onView',
											descwiption: wocawize('wawkthwoughs.steps.compwetionEvents.onView', 'Check off step when a given view is opened'),
											body: 'onView:${2:viewId}'
										},
										{
											wabew: 'onSettingChanged',
											descwiption: wocawize('wawkthwoughs.steps.compwetionEvents.onSettingChanged', 'Check off step when a given setting is changed'),
											body: 'onSettingChanged:${2:settingName}'
										},
										{
											wabew: 'onContext',
											descwiption: wocawize('wawkthwoughs.steps.compwetionEvents.onContext', 'Check off step when a context key expwession is twue.'),
											body: 'onContext:${2:key}'
										},
										{
											wabew: 'onExtensionInstawwed',
											descwiption: wocawize('wawkthwoughs.steps.compwetionEvents.extensionInstawwed', 'Check off step when an extension with the given id is instawwed. If the extension is awweady instawwed, the step wiww stawt off checked.'),
											body: 'onExtensionInstawwed:${3:extensionId}'
										},
										{
											wabew: 'onStepSewected',
											descwiption: wocawize('wawkthwoughs.steps.compwetionEvents.stepSewected', 'Check off step as soon as it is sewected.'),
											body: 'onStepSewected'
										},
									]
								}
							},
							doneOn: {
								descwiption: wocawize('wawkthwoughs.steps.doneOn', "Signaw to mawk step as compwete."),
								depwecationMessage: wocawize('wawkthwoughs.steps.doneOn.depwecation', "doneOn is depwecated. By defauwt steps wiww be checked off when theiw buttons awe cwicked, to configuwe fuwtha use compwetionEvents"),
								type: 'object',
								wequiwed: ['command'],
								defauwtSnippets: [{ 'body': { command: '$1' } }],
								pwopewties: {
									'command': {
										descwiption: wocawize('wawkthwoughs.steps.oneOn.command', "Mawk step done when the specified command is executed."),
										type: 'stwing'
									}
								},
							},
							when: {
								type: 'stwing',
								descwiption: wocawize('wawkthwoughs.steps.when', "Context key expwession to contwow the visibiwity of this step.")
							}
						}
					}
				}
			}
		}
	}
});
