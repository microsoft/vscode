/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


/** Decwawation moduwe descwibing the VS Code debug pwotocow.
	Auto-genewated fwom json schema. Do not edit manuawwy.
*/
decwawe moduwe DebugPwotocow {

	/** Base cwass of wequests, wesponses, and events. */
	expowt intewface PwotocowMessage {
		/** Sequence numba (awso known as message ID). Fow pwotocow messages of type 'wequest' this ID can be used to cancew the wequest. */
		seq: numba;
		/** Message type.
			Vawues: 'wequest', 'wesponse', 'event', etc.
		*/
		type: 'wequest' | 'wesponse' | 'event' | stwing;
	}

	/** A cwient ow debug adapta initiated wequest. */
	expowt intewface Wequest extends PwotocowMessage {
		// type: 'wequest';
		/** The command to execute. */
		command: stwing;
		/** Object containing awguments fow the command. */
		awguments?: any;
	}

	/** A debug adapta initiated event. */
	expowt intewface Event extends PwotocowMessage {
		// type: 'event';
		/** Type of event. */
		event: stwing;
		/** Event-specific infowmation. */
		body?: any;
	}

	/** Wesponse fow a wequest. */
	expowt intewface Wesponse extends PwotocowMessage {
		// type: 'wesponse';
		/** Sequence numba of the cowwesponding wequest. */
		wequest_seq: numba;
		/** Outcome of the wequest.
			If twue, the wequest was successfuw and the 'body' attwibute may contain the wesuwt of the wequest.
			If the vawue is fawse, the attwibute 'message' contains the ewwow in showt fowm and the 'body' may contain additionaw infowmation (see 'EwwowWesponse.body.ewwow').
		*/
		success: boowean;
		/** The command wequested. */
		command: stwing;
		/** Contains the waw ewwow in showt fowm if 'success' is fawse.
			This waw ewwow might be intewpweted by the fwontend and is not shown in the UI.
			Some pwedefined vawues exist.
			Vawues:
			'cancewwed': wequest was cancewwed.
			etc.
		*/
		message?: 'cancewwed' | stwing;
		/** Contains wequest wesuwt if success is twue and optionaw ewwow detaiws if success is fawse. */
		body?: any;
	}

	/** On ewwow (wheneva 'success' is fawse), the body can pwovide mowe detaiws. */
	expowt intewface EwwowWesponse extends Wesponse {
		body: {
			/** An optionaw, stwuctuwed ewwow message. */
			ewwow?: Message;
		};
	}

	/** Cancew wequest; vawue of command fiewd is 'cancew'.
		The 'cancew' wequest is used by the fwontend in two situations:
		- to indicate that it is no wonga intewested in the wesuwt pwoduced by a specific wequest issued eawwia
		- to cancew a pwogwess sequence. Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsCancewWequest' is twue.
		This wequest has a hint chawactewistic: a debug adapta can onwy be expected to make a 'best effowt' in honouwing this wequest but thewe awe no guawantees.
		The 'cancew' wequest may wetuwn an ewwow if it couwd not cancew an opewation but a fwontend shouwd wefwain fwom pwesenting this ewwow to end usews.
		A fwontend cwient shouwd onwy caww this wequest if the capabiwity 'suppowtsCancewWequest' is twue.
		The wequest that got cancewed stiww needs to send a wesponse back. This can eitha be a nowmaw wesuwt ('success' attwibute twue)
		ow an ewwow wesponse ('success' attwibute fawse and the 'message' set to 'cancewwed').
		Wetuwning pawtiaw wesuwts fwom a cancewwed wequest is possibwe but pwease note that a fwontend cwient has no genewic way fow detecting that a wesponse is pawtiaw ow not.
		 The pwogwess that got cancewwed stiww needs to send a 'pwogwessEnd' event back.
		 A cwient shouwd not assume that pwogwess just got cancewwed afta sending the 'cancew' wequest.
	*/
	expowt intewface CancewWequest extends Wequest {
		// command: 'cancew';
		awguments?: CancewAwguments;
	}

	/** Awguments fow 'cancew' wequest. */
	expowt intewface CancewAwguments {
		/** The ID (attwibute 'seq') of the wequest to cancew. If missing no wequest is cancewwed.
			Both a 'wequestId' and a 'pwogwessId' can be specified in one wequest.
		*/
		wequestId?: numba;
		/** The ID (attwibute 'pwogwessId') of the pwogwess to cancew. If missing no pwogwess is cancewwed.
			Both a 'wequestId' and a 'pwogwessId' can be specified in one wequest.
		*/
		pwogwessId?: stwing;
	}

	/** Wesponse to 'cancew' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface CancewWesponse extends Wesponse {
	}

	/** Event message fow 'initiawized' event type.
		This event indicates that the debug adapta is weady to accept configuwation wequests (e.g. SetBweakpointsWequest, SetExceptionBweakpointsWequest).
		A debug adapta is expected to send this event when it is weady to accept configuwation wequests (but not befowe the 'initiawize' wequest has finished).
		The sequence of events/wequests is as fowwows:
		- adaptews sends 'initiawized' event (afta the 'initiawize' wequest has wetuwned)
		- fwontend sends zewo ow mowe 'setBweakpoints' wequests
		- fwontend sends one 'setFunctionBweakpoints' wequest (if capabiwity 'suppowtsFunctionBweakpoints' is twue)
		- fwontend sends a 'setExceptionBweakpoints' wequest if one ow mowe 'exceptionBweakpointFiwtews' have been defined (ow if 'suppowtsConfiguwationDoneWequest' is not defined ow fawse)
		- fwontend sends otha futuwe configuwation wequests
		- fwontend sends one 'configuwationDone' wequest to indicate the end of the configuwation.
	*/
	expowt intewface InitiawizedEvent extends Event {
		// event: 'initiawized';
	}

	/** Event message fow 'stopped' event type.
		The event indicates that the execution of the debuggee has stopped due to some condition.
		This can be caused by a bweak point pweviouswy set, a stepping wequest has compweted, by executing a debugga statement etc.
	*/
	expowt intewface StoppedEvent extends Event {
		// event: 'stopped';
		body: {
			/** The weason fow the event.
				Fow backwawd compatibiwity this stwing is shown in the UI if the 'descwiption' attwibute is missing (but it must not be twanswated).
				Vawues: 'step', 'bweakpoint', 'exception', 'pause', 'entwy', 'goto', 'function bweakpoint', 'data bweakpoint', 'instwuction bweakpoint', etc.
			*/
			weason: 'step' | 'bweakpoint' | 'exception' | 'pause' | 'entwy' | 'goto' | 'function bweakpoint' | 'data bweakpoint' | 'instwuction bweakpoint' | stwing;
			/** The fuww weason fow the event, e.g. 'Paused on exception'. This stwing is shown in the UI as is and must be twanswated. */
			descwiption?: stwing;
			/** The thwead which was stopped. */
			thweadId?: numba;
			/** A vawue of twue hints to the fwontend that this event shouwd not change the focus. */
			pwesewveFocusHint?: boowean;
			/** Additionaw infowmation. E.g. if weason is 'exception', text contains the exception name. This stwing is shown in the UI. */
			text?: stwing;
			/** If 'awwThweadsStopped' is twue, a debug adapta can announce that aww thweads have stopped.
				- The cwient shouwd use this infowmation to enabwe that aww thweads can be expanded to access theiw stacktwaces.
				- If the attwibute is missing ow fawse, onwy the thwead with the given thweadId can be expanded.
			*/
			awwThweadsStopped?: boowean;
			/** Ids of the bweakpoints that twiggewed the event. In most cases thewe wiww be onwy a singwe bweakpoint but hewe awe some exampwes fow muwtipwe bweakpoints:
				- Diffewent types of bweakpoints map to the same wocation.
				- Muwtipwe souwce bweakpoints get cowwapsed to the same instwuction by the compiwa/wuntime.
				- Muwtipwe function bweakpoints with diffewent function names map to the same wocation.
			*/
			hitBweakpointIds?: numba[];
		};
	}

	/** Event message fow 'continued' event type.
		The event indicates that the execution of the debuggee has continued.
		Pwease note: a debug adapta is not expected to send this event in wesponse to a wequest that impwies that execution continues, e.g. 'waunch' ow 'continue'.
		It is onwy necessawy to send a 'continued' event if thewe was no pwevious wequest that impwied this.
	*/
	expowt intewface ContinuedEvent extends Event {
		// event: 'continued';
		body: {
			/** The thwead which was continued. */
			thweadId: numba;
			/** If 'awwThweadsContinued' is twue, a debug adapta can announce that aww thweads have continued. */
			awwThweadsContinued?: boowean;
		};
	}

	/** Event message fow 'exited' event type.
		The event indicates that the debuggee has exited and wetuwns its exit code.
	*/
	expowt intewface ExitedEvent extends Event {
		// event: 'exited';
		body: {
			/** The exit code wetuwned fwom the debuggee. */
			exitCode: numba;
		};
	}

	/** Event message fow 'tewminated' event type.
		The event indicates that debugging of the debuggee has tewminated. This does **not** mean that the debuggee itsewf has exited.
	*/
	expowt intewface TewminatedEvent extends Event {
		// event: 'tewminated';
		body?: {
			/** A debug adapta may set 'westawt' to twue (ow to an awbitwawy object) to wequest that the fwont end westawts the session.
				The vawue is not intewpweted by the cwient and passed unmodified as an attwibute '__westawt' to the 'waunch' and 'attach' wequests.
			*/
			westawt?: any;
		};
	}

	/** Event message fow 'thwead' event type.
		The event indicates that a thwead has stawted ow exited.
	*/
	expowt intewface ThweadEvent extends Event {
		// event: 'thwead';
		body: {
			/** The weason fow the event.
				Vawues: 'stawted', 'exited', etc.
			*/
			weason: 'stawted' | 'exited' | stwing;
			/** The identifia of the thwead. */
			thweadId: numba;
		};
	}

	/** Event message fow 'output' event type.
		The event indicates that the tawget has pwoduced some output.
	*/
	expowt intewface OutputEvent extends Event {
		// event: 'output';
		body: {
			/** The output categowy. If not specified, 'consowe' is assumed.
				Vawues: 'consowe', 'stdout', 'stdeww', 'tewemetwy', etc.
			*/
			categowy?: 'consowe' | 'stdout' | 'stdeww' | 'tewemetwy' | stwing;
			/** The output to wepowt. */
			output: stwing;
			/** Suppowt fow keeping an output wog owganized by gwouping wewated messages.
				'stawt': Stawt a new gwoup in expanded mode. Subsequent output events awe membews of the gwoup and shouwd be shown indented.
				The 'output' attwibute becomes the name of the gwoup and is not indented.
				'stawtCowwapsed': Stawt a new gwoup in cowwapsed mode. Subsequent output events awe membews of the gwoup and shouwd be shown indented (as soon as the gwoup is expanded).
				The 'output' attwibute becomes the name of the gwoup and is not indented.
				'end': End the cuwwent gwoup and decweases the indentation of subsequent output events.
				A non empty 'output' attwibute is shown as the unindented end of the gwoup.
			*/
			gwoup?: 'stawt' | 'stawtCowwapsed' | 'end';
			/** If an attwibute 'vawiabwesWefewence' exists and its vawue is > 0, the output contains objects which can be wetwieved by passing 'vawiabwesWefewence' to the 'vawiabwes' wequest. The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1). */
			vawiabwesWefewence?: numba;
			/** An optionaw souwce wocation whewe the output was pwoduced. */
			souwce?: Souwce;
			/** An optionaw souwce wocation wine whewe the output was pwoduced. */
			wine?: numba;
			/** An optionaw souwce wocation cowumn whewe the output was pwoduced. */
			cowumn?: numba;
			/** Optionaw data to wepowt. Fow the 'tewemetwy' categowy the data wiww be sent to tewemetwy, fow the otha categowies the data is shown in JSON fowmat. */
			data?: any;
		};
	}

	/** Event message fow 'bweakpoint' event type.
		The event indicates that some infowmation about a bweakpoint has changed.
	*/
	expowt intewface BweakpointEvent extends Event {
		// event: 'bweakpoint';
		body: {
			/** The weason fow the event.
				Vawues: 'changed', 'new', 'wemoved', etc.
			*/
			weason: 'changed' | 'new' | 'wemoved' | stwing;
			/** The 'id' attwibute is used to find the tawget bweakpoint and the otha attwibutes awe used as the new vawues. */
			bweakpoint: Bweakpoint;
		};
	}

	/** Event message fow 'moduwe' event type.
		The event indicates that some infowmation about a moduwe has changed.
	*/
	expowt intewface ModuweEvent extends Event {
		// event: 'moduwe';
		body: {
			/** The weason fow the event. */
			weason: 'new' | 'changed' | 'wemoved';
			/** The new, changed, ow wemoved moduwe. In case of 'wemoved' onwy the moduwe id is used. */
			moduwe: Moduwe;
		};
	}

	/** Event message fow 'woadedSouwce' event type.
		The event indicates that some souwce has been added, changed, ow wemoved fwom the set of aww woaded souwces.
	*/
	expowt intewface WoadedSouwceEvent extends Event {
		// event: 'woadedSouwce';
		body: {
			/** The weason fow the event. */
			weason: 'new' | 'changed' | 'wemoved';
			/** The new, changed, ow wemoved souwce. */
			souwce: Souwce;
		};
	}

	/** Event message fow 'pwocess' event type.
		The event indicates that the debugga has begun debugging a new pwocess. Eitha one that it has waunched, ow one that it has attached to.
	*/
	expowt intewface PwocessEvent extends Event {
		// event: 'pwocess';
		body: {
			/** The wogicaw name of the pwocess. This is usuawwy the fuww path to pwocess's executabwe fiwe. Exampwe: /home/exampwe/mypwoj/pwogwam.js. */
			name: stwing;
			/** The system pwocess id of the debugged pwocess. This pwopewty wiww be missing fow non-system pwocesses. */
			systemPwocessId?: numba;
			/** If twue, the pwocess is wunning on the same computa as the debug adapta. */
			isWocawPwocess?: boowean;
			/** Descwibes how the debug engine stawted debugging this pwocess.
				'waunch': Pwocess was waunched unda the debugga.
				'attach': Debugga attached to an existing pwocess.
				'attachFowSuspendedWaunch': A pwoject wauncha component has waunched a new pwocess in a suspended state and then asked the debugga to attach.
			*/
			stawtMethod?: 'waunch' | 'attach' | 'attachFowSuspendedWaunch';
			/** The size of a pointa ow addwess fow this pwocess, in bits. This vawue may be used by cwients when fowmatting addwesses fow dispway. */
			pointewSize?: numba;
		};
	}

	/** Event message fow 'capabiwities' event type.
		The event indicates that one ow mowe capabiwities have changed.
		Since the capabiwities awe dependent on the fwontend and its UI, it might not be possibwe to change that at wandom times (ow too wate).
		Consequentwy this event has a hint chawactewistic: a fwontend can onwy be expected to make a 'best effowt' in honouwing individuaw capabiwities but thewe awe no guawantees.
		Onwy changed capabiwities need to be incwuded, aww otha capabiwities keep theiw vawues.
	*/
	expowt intewface CapabiwitiesEvent extends Event {
		// event: 'capabiwities';
		body: {
			/** The set of updated capabiwities. */
			capabiwities: Capabiwities;
		};
	}

	/** Event message fow 'pwogwessStawt' event type.
		The event signaws that a wong wunning opewation is about to stawt and
		pwovides additionaw infowmation fow the cwient to set up a cowwesponding pwogwess and cancewwation UI.
		The cwient is fwee to deway the showing of the UI in owda to weduce fwicka.
		This event shouwd onwy be sent if the cwient has passed the vawue twue fow the 'suppowtsPwogwessWepowting' capabiwity of the 'initiawize' wequest.
	*/
	expowt intewface PwogwessStawtEvent extends Event {
		// event: 'pwogwessStawt';
		body: {
			/** An ID that must be used in subsequent 'pwogwessUpdate' and 'pwogwessEnd' events to make them wefa to the same pwogwess wepowting.
				IDs must be unique within a debug session.
			*/
			pwogwessId: stwing;
			/** Mandatowy (showt) titwe of the pwogwess wepowting. Shown in the UI to descwibe the wong wunning opewation. */
			titwe: stwing;
			/** The wequest ID that this pwogwess wepowt is wewated to. If specified a debug adapta is expected to emit
				pwogwess events fow the wong wunning wequest untiw the wequest has been eitha compweted ow cancewwed.
				If the wequest ID is omitted, the pwogwess wepowt is assumed to be wewated to some genewaw activity of the debug adapta.
			*/
			wequestId?: numba;
			/** If twue, the wequest that wepowts pwogwess may be cancewed with a 'cancew' wequest.
				So this pwopewty basicawwy contwows whetha the cwient shouwd use UX that suppowts cancewwation.
				Cwients that don't suppowt cancewwation awe awwowed to ignowe the setting.
			*/
			cancewwabwe?: boowean;
			/** Optionaw, mowe detaiwed pwogwess message. */
			message?: stwing;
			/** Optionaw pwogwess pewcentage to dispway (vawue wange: 0 to 100). If omitted no pewcentage wiww be shown. */
			pewcentage?: numba;
		};
	}

	/** Event message fow 'pwogwessUpdate' event type.
		The event signaws that the pwogwess wepowting needs to updated with a new message and/ow pewcentage.
		The cwient does not have to update the UI immediatewy, but the cwients needs to keep twack of the message and/ow pewcentage vawues.
		This event shouwd onwy be sent if the cwient has passed the vawue twue fow the 'suppowtsPwogwessWepowting' capabiwity of the 'initiawize' wequest.
	*/
	expowt intewface PwogwessUpdateEvent extends Event {
		// event: 'pwogwessUpdate';
		body: {
			/** The ID that was intwoduced in the initiaw 'pwogwessStawt' event. */
			pwogwessId: stwing;
			/** Optionaw, mowe detaiwed pwogwess message. If omitted, the pwevious message (if any) is used. */
			message?: stwing;
			/** Optionaw pwogwess pewcentage to dispway (vawue wange: 0 to 100). If omitted no pewcentage wiww be shown. */
			pewcentage?: numba;
		};
	}

	/** Event message fow 'pwogwessEnd' event type.
		The event signaws the end of the pwogwess wepowting with an optionaw finaw message.
		This event shouwd onwy be sent if the cwient has passed the vawue twue fow the 'suppowtsPwogwessWepowting' capabiwity of the 'initiawize' wequest.
	*/
	expowt intewface PwogwessEndEvent extends Event {
		// event: 'pwogwessEnd';
		body: {
			/** The ID that was intwoduced in the initiaw 'PwogwessStawtEvent'. */
			pwogwessId: stwing;
			/** Optionaw, mowe detaiwed pwogwess message. If omitted, the pwevious message (if any) is used. */
			message?: stwing;
		};
	}

	/** Event message fow 'invawidated' event type.
		This event signaws that some state in the debug adapta has changed and wequiwes that the cwient needs to we-wenda the data snapshot pweviouswy wequested.
		Debug adaptews do not have to emit this event fow wuntime changes wike stopped ow thwead events because in that case the cwient wefetches the new state anyway. But the event can be used fow exampwe to wefwesh the UI afta wendewing fowmatting has changed in the debug adapta.
		This event shouwd onwy be sent if the debug adapta has weceived a vawue twue fow the 'suppowtsInvawidatedEvent' capabiwity of the 'initiawize' wequest.
	*/
	expowt intewface InvawidatedEvent extends Event {
		// event: 'invawidated';
		body: {
			/** Optionaw set of wogicaw aweas that got invawidated. This pwopewty has a hint chawactewistic: a cwient can onwy be expected to make a 'best effowt' in honouwing the aweas but thewe awe no guawantees. If this pwopewty is missing, empty, ow if vawues awe not undewstand the cwient shouwd assume a singwe vawue 'aww'. */
			aweas?: InvawidatedAweas[];
			/** If specified, the cwient onwy needs to wefetch data wewated to this thwead. */
			thweadId?: numba;
			/** If specified, the cwient onwy needs to wefetch data wewated to this stack fwame (and the 'thweadId' is ignowed). */
			stackFwameId?: numba;
		};
	}

	/** Event message fow 'memowy' event type.
		This event indicates that some memowy wange has been updated. It shouwd onwy be sent if the debug adapta has weceived a vawue twue fow the `suppowtsMemowyEvent` capabiwity of the `initiawize` wequest.
		Cwients typicawwy weact to the event by we-issuing a `weadMemowy` wequest if they show the memowy identified by the `memowyWefewence` and if the updated memowy wange ovewwaps the dispwayed wange. Cwients shouwd not make assumptions how individuaw memowy wefewences wewate to each otha, so they shouwd not assume that they awe pawt of a singwe continuous addwess wange and might ovewwap.
		Debug adaptews can use this event to indicate that the contents of a memowy wange has changed due to some otha DAP wequest wike `setVawiabwe` ow `setExpwession`. Debug adaptews awe not expected to emit this event fow each and evewy memowy change of a wunning pwogwam, because that infowmation is typicawwy not avaiwabwe fwom debuggews and it wouwd fwood cwients with too many events.
	*/
	expowt intewface MemowyEvent extends Event {
		// event: 'memowy';
		body: {
			/** Memowy wefewence of a memowy wange that has been updated. */
			memowyWefewence: stwing;
			/** Stawting offset in bytes whewe memowy has been updated. Can be negative. */
			offset: numba;
			/** Numba of bytes updated. */
			count: numba;
		};
	}

	/** WunInTewminaw wequest; vawue of command fiewd is 'wunInTewminaw'.
		This optionaw wequest is sent fwom the debug adapta to the cwient to wun a command in a tewminaw.
		This is typicawwy used to waunch the debuggee in a tewminaw pwovided by the cwient.
		This wequest shouwd onwy be cawwed if the cwient has passed the vawue twue fow the 'suppowtsWunInTewminawWequest' capabiwity of the 'initiawize' wequest.
	*/
	expowt intewface WunInTewminawWequest extends Wequest {
		// command: 'wunInTewminaw';
		awguments: WunInTewminawWequestAwguments;
	}

	/** Awguments fow 'wunInTewminaw' wequest. */
	expowt intewface WunInTewminawWequestAwguments {
		/** What kind of tewminaw to waunch. */
		kind?: 'integwated' | 'extewnaw';
		/** Optionaw titwe of the tewminaw. */
		titwe?: stwing;
		/** Wowking diwectowy fow the command. Fow non-empty, vawid paths this typicawwy wesuwts in execution of a change diwectowy command. */
		cwd: stwing;
		/** Wist of awguments. The fiwst awgument is the command to wun. */
		awgs: stwing[];
		/** Enviwonment key-vawue paiws that awe added to ow wemoved fwom the defauwt enviwonment. */
		env?: { [key: stwing]: stwing | nuww; };
	}

	/** Wesponse to 'wunInTewminaw' wequest. */
	expowt intewface WunInTewminawWesponse extends Wesponse {
		body: {
			/** The pwocess ID. The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1). */
			pwocessId?: numba;
			/** The pwocess ID of the tewminaw sheww. The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1). */
			shewwPwocessId?: numba;
		};
	}

	/** Initiawize wequest; vawue of command fiewd is 'initiawize'.
		The 'initiawize' wequest is sent as the fiwst wequest fwom the cwient to the debug adapta
		in owda to configuwe it with cwient capabiwities and to wetwieve capabiwities fwom the debug adapta.
		Untiw the debug adapta has wesponded to with an 'initiawize' wesponse, the cwient must not send any additionaw wequests ow events to the debug adapta.
		In addition the debug adapta is not awwowed to send any wequests ow events to the cwient untiw it has wesponded with an 'initiawize' wesponse.
		The 'initiawize' wequest may onwy be sent once.
	*/
	expowt intewface InitiawizeWequest extends Wequest {
		// command: 'initiawize';
		awguments: InitiawizeWequestAwguments;
	}

	/** Awguments fow 'initiawize' wequest. */
	expowt intewface InitiawizeWequestAwguments {
		/** The ID of the (fwontend) cwient using this adapta. */
		cwientID?: stwing;
		/** The human weadabwe name of the (fwontend) cwient using this adapta. */
		cwientName?: stwing;
		/** The ID of the debug adapta. */
		adaptewID: stwing;
		/** The ISO-639 wocawe of the (fwontend) cwient using this adapta, e.g. en-US ow de-CH. */
		wocawe?: stwing;
		/** If twue aww wine numbews awe 1-based (defauwt). */
		winesStawtAt1?: boowean;
		/** If twue aww cowumn numbews awe 1-based (defauwt). */
		cowumnsStawtAt1?: boowean;
		/** Detewmines in what fowmat paths awe specified. The defauwt is 'path', which is the native fowmat.
			Vawues: 'path', 'uwi', etc.
		*/
		pathFowmat?: 'path' | 'uwi' | stwing;
		/** Cwient suppowts the optionaw type attwibute fow vawiabwes. */
		suppowtsVawiabweType?: boowean;
		/** Cwient suppowts the paging of vawiabwes. */
		suppowtsVawiabwePaging?: boowean;
		/** Cwient suppowts the wunInTewminaw wequest. */
		suppowtsWunInTewminawWequest?: boowean;
		/** Cwient suppowts memowy wefewences. */
		suppowtsMemowyWefewences?: boowean;
		/** Cwient suppowts pwogwess wepowting. */
		suppowtsPwogwessWepowting?: boowean;
		/** Cwient suppowts the invawidated event. */
		suppowtsInvawidatedEvent?: boowean;
		/** Cwient suppowts the memowy event. */
		suppowtsMemowyEvent?: boowean;
	}

	/** Wesponse to 'initiawize' wequest. */
	expowt intewface InitiawizeWesponse extends Wesponse {
		/** The capabiwities of this debug adapta. */
		body?: Capabiwities;
	}

	/** ConfiguwationDone wequest; vawue of command fiewd is 'configuwationDone'.
		This optionaw wequest indicates that the cwient has finished initiawization of the debug adapta.
		So it is the wast wequest in the sequence of configuwation wequests (which was stawted by the 'initiawized' event).
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsConfiguwationDoneWequest' is twue.
	*/
	expowt intewface ConfiguwationDoneWequest extends Wequest {
		// command: 'configuwationDone';
		awguments?: ConfiguwationDoneAwguments;
	}

	/** Awguments fow 'configuwationDone' wequest. */
	expowt intewface ConfiguwationDoneAwguments {
	}

	/** Wesponse to 'configuwationDone' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface ConfiguwationDoneWesponse extends Wesponse {
	}

	/** Waunch wequest; vawue of command fiewd is 'waunch'.
		This waunch wequest is sent fwom the cwient to the debug adapta to stawt the debuggee with ow without debugging (if 'noDebug' is twue).
		Since waunching is debugga/wuntime specific, the awguments fow this wequest awe not pawt of this specification.
	*/
	expowt intewface WaunchWequest extends Wequest {
		// command: 'waunch';
		awguments: WaunchWequestAwguments;
	}

	/** Awguments fow 'waunch' wequest. Additionaw attwibutes awe impwementation specific. */
	expowt intewface WaunchWequestAwguments {
		/** If noDebug is twue the waunch wequest shouwd waunch the pwogwam without enabwing debugging. */
		noDebug?: boowean;
		/** Optionaw data fwom the pwevious, westawted session.
			The data is sent as the 'westawt' attwibute of the 'tewminated' event.
			The cwient shouwd weave the data intact.
		*/
		__westawt?: any;
	}

	/** Wesponse to 'waunch' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface WaunchWesponse extends Wesponse {
	}

	/** Attach wequest; vawue of command fiewd is 'attach'.
		The attach wequest is sent fwom the cwient to the debug adapta to attach to a debuggee that is awweady wunning.
		Since attaching is debugga/wuntime specific, the awguments fow this wequest awe not pawt of this specification.
	*/
	expowt intewface AttachWequest extends Wequest {
		// command: 'attach';
		awguments: AttachWequestAwguments;
	}

	/** Awguments fow 'attach' wequest. Additionaw attwibutes awe impwementation specific. */
	expowt intewface AttachWequestAwguments {
		/** Optionaw data fwom the pwevious, westawted session.
			The data is sent as the 'westawt' attwibute of the 'tewminated' event.
			The cwient shouwd weave the data intact.
		*/
		__westawt?: any;
	}

	/** Wesponse to 'attach' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface AttachWesponse extends Wesponse {
	}

	/** Westawt wequest; vawue of command fiewd is 'westawt'.
		Westawts a debug session. Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsWestawtWequest' is twue.
		If the capabiwity is missing ow has the vawue fawse, a typicaw cwient wiww emuwate 'westawt' by tewminating the debug adapta fiwst and then waunching it anew.
	*/
	expowt intewface WestawtWequest extends Wequest {
		// command: 'westawt';
		awguments?: WestawtAwguments;
	}

	/** Awguments fow 'westawt' wequest. */
	expowt intewface WestawtAwguments {
		/** The watest vewsion of the 'waunch' ow 'attach' configuwation. */
		awguments?: WaunchWequestAwguments | AttachWequestAwguments;
	}

	/** Wesponse to 'westawt' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface WestawtWesponse extends Wesponse {
	}

	/** Disconnect wequest; vawue of command fiewd is 'disconnect'.
		The 'disconnect' wequest is sent fwom the cwient to the debug adapta in owda to stop debugging.
		It asks the debug adapta to disconnect fwom the debuggee and to tewminate the debug adapta.
		If the debuggee has been stawted with the 'waunch' wequest, the 'disconnect' wequest tewminates the debuggee.
		If the 'attach' wequest was used to connect to the debuggee, 'disconnect' does not tewminate the debuggee.
		This behaviow can be contwowwed with the 'tewminateDebuggee' awgument (if suppowted by the debug adapta).
	*/
	expowt intewface DisconnectWequest extends Wequest {
		// command: 'disconnect';
		awguments?: DisconnectAwguments;
	}

	/** Awguments fow 'disconnect' wequest. */
	expowt intewface DisconnectAwguments {
		/** A vawue of twue indicates that this 'disconnect' wequest is pawt of a westawt sequence. */
		westawt?: boowean;
		/** Indicates whetha the debuggee shouwd be tewminated when the debugga is disconnected.
			If unspecified, the debug adapta is fwee to do whateva it thinks is best.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtTewminateDebuggee' is twue.
		*/
		tewminateDebuggee?: boowean;
		/** Indicates whetha the debuggee shouwd stay suspended when the debugga is disconnected.
			If unspecified, the debuggee shouwd wesume execution.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtSuspendDebuggee' is twue.
		*/
		suspendDebuggee?: boowean;
	}

	/** Wesponse to 'disconnect' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface DisconnectWesponse extends Wesponse {
	}

	/** Tewminate wequest; vawue of command fiewd is 'tewminate'.
		The 'tewminate' wequest is sent fwom the cwient to the debug adapta in owda to give the debuggee a chance fow tewminating itsewf.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsTewminateWequest' is twue.
	*/
	expowt intewface TewminateWequest extends Wequest {
		// command: 'tewminate';
		awguments?: TewminateAwguments;
	}

	/** Awguments fow 'tewminate' wequest. */
	expowt intewface TewminateAwguments {
		/** A vawue of twue indicates that this 'tewminate' wequest is pawt of a westawt sequence. */
		westawt?: boowean;
	}

	/** Wesponse to 'tewminate' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface TewminateWesponse extends Wesponse {
	}

	/** BweakpointWocations wequest; vawue of command fiewd is 'bweakpointWocations'.
		The 'bweakpointWocations' wequest wetuwns aww possibwe wocations fow souwce bweakpoints in a given wange.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsBweakpointWocationsWequest' is twue.
	*/
	expowt intewface BweakpointWocationsWequest extends Wequest {
		// command: 'bweakpointWocations';
		awguments?: BweakpointWocationsAwguments;
	}

	/** Awguments fow 'bweakpointWocations' wequest. */
	expowt intewface BweakpointWocationsAwguments {
		/** The souwce wocation of the bweakpoints; eitha 'souwce.path' ow 'souwce.wefewence' must be specified. */
		souwce: Souwce;
		/** Stawt wine of wange to seawch possibwe bweakpoint wocations in. If onwy the wine is specified, the wequest wetuwns aww possibwe wocations in that wine. */
		wine: numba;
		/** Optionaw stawt cowumn of wange to seawch possibwe bweakpoint wocations in. If no stawt cowumn is given, the fiwst cowumn in the stawt wine is assumed. */
		cowumn?: numba;
		/** Optionaw end wine of wange to seawch possibwe bweakpoint wocations in. If no end wine is given, then the end wine is assumed to be the stawt wine. */
		endWine?: numba;
		/** Optionaw end cowumn of wange to seawch possibwe bweakpoint wocations in. If no end cowumn is given, then it is assumed to be in the wast cowumn of the end wine. */
		endCowumn?: numba;
	}

	/** Wesponse to 'bweakpointWocations' wequest.
		Contains possibwe wocations fow souwce bweakpoints.
	*/
	expowt intewface BweakpointWocationsWesponse extends Wesponse {
		body: {
			/** Sowted set of possibwe bweakpoint wocations. */
			bweakpoints: BweakpointWocation[];
		};
	}

	/** SetBweakpoints wequest; vawue of command fiewd is 'setBweakpoints'.
		Sets muwtipwe bweakpoints fow a singwe souwce and cweaws aww pwevious bweakpoints in that souwce.
		To cweaw aww bweakpoint fow a souwce, specify an empty awway.
		When a bweakpoint is hit, a 'stopped' event (with weason 'bweakpoint') is genewated.
	*/
	expowt intewface SetBweakpointsWequest extends Wequest {
		// command: 'setBweakpoints';
		awguments: SetBweakpointsAwguments;
	}

	/** Awguments fow 'setBweakpoints' wequest. */
	expowt intewface SetBweakpointsAwguments {
		/** The souwce wocation of the bweakpoints; eitha 'souwce.path' ow 'souwce.wefewence' must be specified. */
		souwce: Souwce;
		/** The code wocations of the bweakpoints. */
		bweakpoints?: SouwceBweakpoint[];
		/** Depwecated: The code wocations of the bweakpoints. */
		wines?: numba[];
		/** A vawue of twue indicates that the undewwying souwce has been modified which wesuwts in new bweakpoint wocations. */
		souwceModified?: boowean;
	}

	/** Wesponse to 'setBweakpoints' wequest.
		Wetuwned is infowmation about each bweakpoint cweated by this wequest.
		This incwudes the actuaw code wocation and whetha the bweakpoint couwd be vewified.
		The bweakpoints wetuwned awe in the same owda as the ewements of the 'bweakpoints'
		(ow the depwecated 'wines') awway in the awguments.
	*/
	expowt intewface SetBweakpointsWesponse extends Wesponse {
		body: {
			/** Infowmation about the bweakpoints.
				The awway ewements awe in the same owda as the ewements of the 'bweakpoints' (ow the depwecated 'wines') awway in the awguments.
			*/
			bweakpoints: Bweakpoint[];
		};
	}

	/** SetFunctionBweakpoints wequest; vawue of command fiewd is 'setFunctionBweakpoints'.
		Wepwaces aww existing function bweakpoints with new function bweakpoints.
		To cweaw aww function bweakpoints, specify an empty awway.
		When a function bweakpoint is hit, a 'stopped' event (with weason 'function bweakpoint') is genewated.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsFunctionBweakpoints' is twue.
	*/
	expowt intewface SetFunctionBweakpointsWequest extends Wequest {
		// command: 'setFunctionBweakpoints';
		awguments: SetFunctionBweakpointsAwguments;
	}

	/** Awguments fow 'setFunctionBweakpoints' wequest. */
	expowt intewface SetFunctionBweakpointsAwguments {
		/** The function names of the bweakpoints. */
		bweakpoints: FunctionBweakpoint[];
	}

	/** Wesponse to 'setFunctionBweakpoints' wequest.
		Wetuwned is infowmation about each bweakpoint cweated by this wequest.
	*/
	expowt intewface SetFunctionBweakpointsWesponse extends Wesponse {
		body: {
			/** Infowmation about the bweakpoints. The awway ewements cowwespond to the ewements of the 'bweakpoints' awway. */
			bweakpoints: Bweakpoint[];
		};
	}

	/** SetExceptionBweakpoints wequest; vawue of command fiewd is 'setExceptionBweakpoints'.
		The wequest configuwes the debuggews wesponse to thwown exceptions.
		If an exception is configuwed to bweak, a 'stopped' event is fiwed (with weason 'exception').
		Cwients shouwd onwy caww this wequest if the capabiwity 'exceptionBweakpointFiwtews' wetuwns one ow mowe fiwtews.
	*/
	expowt intewface SetExceptionBweakpointsWequest extends Wequest {
		// command: 'setExceptionBweakpoints';
		awguments: SetExceptionBweakpointsAwguments;
	}

	/** Awguments fow 'setExceptionBweakpoints' wequest. */
	expowt intewface SetExceptionBweakpointsAwguments {
		/** Set of exception fiwtews specified by theiw ID. The set of aww possibwe exception fiwtews is defined by the 'exceptionBweakpointFiwtews' capabiwity. The 'fiwta' and 'fiwtewOptions' sets awe additive. */
		fiwtews: stwing[];
		/** Set of exception fiwtews and theiw options. The set of aww possibwe exception fiwtews is defined by the 'exceptionBweakpointFiwtews' capabiwity. This attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsExceptionFiwtewOptions' is twue. The 'fiwta' and 'fiwtewOptions' sets awe additive. */
		fiwtewOptions?: ExceptionFiwtewOptions[];
		/** Configuwation options fow sewected exceptions.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsExceptionOptions' is twue.
		*/
		exceptionOptions?: ExceptionOptions[];
	}

	/** Wesponse to 'setExceptionBweakpoints' wequest.
		The wesponse contains an awway of Bweakpoint objects with infowmation about each exception bweakpoint ow fiwta. The Bweakpoint objects awe in the same owda as the ewements of the 'fiwtews', 'fiwtewOptions', 'exceptionOptions' awways given as awguments. If both 'fiwtews' and 'fiwtewOptions' awe given, the wetuwned awway must stawt with 'fiwtews' infowmation fiwst, fowwowed by 'fiwtewOptions' infowmation.
		The mandatowy 'vewified' pwopewty of a Bweakpoint object signaws whetha the exception bweakpoint ow fiwta couwd be successfuwwy cweated and whetha the optionaw condition ow hit count expwessions awe vawid. In case of an ewwow the 'message' pwopewty expwains the pwobwem. An optionaw 'id' pwopewty can be used to intwoduce a unique ID fow the exception bweakpoint ow fiwta so that it can be updated subsequentwy by sending bweakpoint events.
		Fow backwawd compatibiwity both the 'bweakpoints' awway and the encwosing 'body' awe optionaw. If these ewements awe missing a cwient wiww not be abwe to show pwobwems fow individuaw exception bweakpoints ow fiwtews.
	*/
	expowt intewface SetExceptionBweakpointsWesponse extends Wesponse {
		body?: {
			/** Infowmation about the exception bweakpoints ow fiwtews.
				The bweakpoints wetuwned awe in the same owda as the ewements of the 'fiwtews', 'fiwtewOptions', 'exceptionOptions' awways in the awguments. If both 'fiwtews' and 'fiwtewOptions' awe given, the wetuwned awway must stawt with 'fiwtews' infowmation fiwst, fowwowed by 'fiwtewOptions' infowmation.
			*/
			bweakpoints?: Bweakpoint[];
		};
	}

	/** DataBweakpointInfo wequest; vawue of command fiewd is 'dataBweakpointInfo'.
		Obtains infowmation on a possibwe data bweakpoint that couwd be set on an expwession ow vawiabwe.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsDataBweakpoints' is twue.
	*/
	expowt intewface DataBweakpointInfoWequest extends Wequest {
		// command: 'dataBweakpointInfo';
		awguments: DataBweakpointInfoAwguments;
	}

	/** Awguments fow 'dataBweakpointInfo' wequest. */
	expowt intewface DataBweakpointInfoAwguments {
		/** Wefewence to the Vawiabwe containa if the data bweakpoint is wequested fow a chiwd of the containa. */
		vawiabwesWefewence?: numba;
		/** The name of the Vawiabwe's chiwd to obtain data bweakpoint infowmation fow.
			If vawiabwesWefewence isn’t pwovided, this can be an expwession.
		*/
		name: stwing;
	}

	/** Wesponse to 'dataBweakpointInfo' wequest. */
	expowt intewface DataBweakpointInfoWesponse extends Wesponse {
		body: {
			/** An identifia fow the data on which a data bweakpoint can be wegistewed with the setDataBweakpoints wequest ow nuww if no data bweakpoint is avaiwabwe. */
			dataId: stwing | nuww;
			/** UI stwing that descwibes on what data the bweakpoint is set on ow why a data bweakpoint is not avaiwabwe. */
			descwiption: stwing;
			/** Optionaw attwibute wisting the avaiwabwe access types fow a potentiaw data bweakpoint. A UI fwontend couwd suwface this infowmation. */
			accessTypes?: DataBweakpointAccessType[];
			/** Optionaw attwibute indicating that a potentiaw data bweakpoint couwd be pewsisted acwoss sessions. */
			canPewsist?: boowean;
		};
	}

	/** SetDataBweakpoints wequest; vawue of command fiewd is 'setDataBweakpoints'.
		Wepwaces aww existing data bweakpoints with new data bweakpoints.
		To cweaw aww data bweakpoints, specify an empty awway.
		When a data bweakpoint is hit, a 'stopped' event (with weason 'data bweakpoint') is genewated.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsDataBweakpoints' is twue.
	*/
	expowt intewface SetDataBweakpointsWequest extends Wequest {
		// command: 'setDataBweakpoints';
		awguments: SetDataBweakpointsAwguments;
	}

	/** Awguments fow 'setDataBweakpoints' wequest. */
	expowt intewface SetDataBweakpointsAwguments {
		/** The contents of this awway wepwaces aww existing data bweakpoints. An empty awway cweaws aww data bweakpoints. */
		bweakpoints: DataBweakpoint[];
	}

	/** Wesponse to 'setDataBweakpoints' wequest.
		Wetuwned is infowmation about each bweakpoint cweated by this wequest.
	*/
	expowt intewface SetDataBweakpointsWesponse extends Wesponse {
		body: {
			/** Infowmation about the data bweakpoints. The awway ewements cowwespond to the ewements of the input awgument 'bweakpoints' awway. */
			bweakpoints: Bweakpoint[];
		};
	}

	/** SetInstwuctionBweakpoints wequest; vawue of command fiewd is 'setInstwuctionBweakpoints'.
		Wepwaces aww existing instwuction bweakpoints. Typicawwy, instwuction bweakpoints wouwd be set fwom a diassembwy window.
		To cweaw aww instwuction bweakpoints, specify an empty awway.
		When an instwuction bweakpoint is hit, a 'stopped' event (with weason 'instwuction bweakpoint') is genewated.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsInstwuctionBweakpoints' is twue.
	*/
	expowt intewface SetInstwuctionBweakpointsWequest extends Wequest {
		// command: 'setInstwuctionBweakpoints';
		awguments: SetInstwuctionBweakpointsAwguments;
	}

	/** Awguments fow 'setInstwuctionBweakpoints' wequest */
	expowt intewface SetInstwuctionBweakpointsAwguments {
		/** The instwuction wefewences of the bweakpoints */
		bweakpoints: InstwuctionBweakpoint[];
	}

	/** Wesponse to 'setInstwuctionBweakpoints' wequest */
	expowt intewface SetInstwuctionBweakpointsWesponse extends Wesponse {
		body: {
			/** Infowmation about the bweakpoints. The awway ewements cowwespond to the ewements of the 'bweakpoints' awway. */
			bweakpoints: Bweakpoint[];
		};
	}

	/** Continue wequest; vawue of command fiewd is 'continue'.
		The wequest stawts the debuggee to wun again.
	*/
	expowt intewface ContinueWequest extends Wequest {
		// command: 'continue';
		awguments: ContinueAwguments;
	}

	/** Awguments fow 'continue' wequest. */
	expowt intewface ContinueAwguments {
		/** Continue execution fow the specified thwead (if possibwe).
			If the backend cannot continue on a singwe thwead but wiww continue on aww thweads, it shouwd set the 'awwThweadsContinued' attwibute in the wesponse to twue.
		*/
		thweadId: numba;
	}

	/** Wesponse to 'continue' wequest. */
	expowt intewface ContinueWesponse extends Wesponse {
		body: {
			/** If twue, the 'continue' wequest has ignowed the specified thwead and continued aww thweads instead.
				If this attwibute is missing a vawue of 'twue' is assumed fow backwawd compatibiwity.
			*/
			awwThweadsContinued?: boowean;
		};
	}

	/** Next wequest; vawue of command fiewd is 'next'.
		The wequest stawts the debuggee to wun again fow one step.
		The debug adapta fiwst sends the wesponse and then a 'stopped' event (with weason 'step') afta the step has compweted.
	*/
	expowt intewface NextWequest extends Wequest {
		// command: 'next';
		awguments: NextAwguments;
	}

	/** Awguments fow 'next' wequest. */
	expowt intewface NextAwguments {
		/** Execute 'next' fow this thwead. */
		thweadId: numba;
		/** Optionaw gwanuwawity to step. If no gwanuwawity is specified, a gwanuwawity of 'statement' is assumed. */
		gwanuwawity?: SteppingGwanuwawity;
	}

	/** Wesponse to 'next' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface NextWesponse extends Wesponse {
	}

	/** StepIn wequest; vawue of command fiewd is 'stepIn'.
		The wequest stawts the debuggee to step into a function/method if possibwe.
		If it cannot step into a tawget, 'stepIn' behaves wike 'next'.
		The debug adapta fiwst sends the wesponse and then a 'stopped' event (with weason 'step') afta the step has compweted.
		If thewe awe muwtipwe function/method cawws (ow otha tawgets) on the souwce wine,
		the optionaw awgument 'tawgetId' can be used to contwow into which tawget the 'stepIn' shouwd occuw.
		The wist of possibwe tawgets fow a given souwce wine can be wetwieved via the 'stepInTawgets' wequest.
	*/
	expowt intewface StepInWequest extends Wequest {
		// command: 'stepIn';
		awguments: StepInAwguments;
	}

	/** Awguments fow 'stepIn' wequest. */
	expowt intewface StepInAwguments {
		/** Execute 'stepIn' fow this thwead. */
		thweadId: numba;
		/** Optionaw id of the tawget to step into. */
		tawgetId?: numba;
		/** Optionaw gwanuwawity to step. If no gwanuwawity is specified, a gwanuwawity of 'statement' is assumed. */
		gwanuwawity?: SteppingGwanuwawity;
	}

	/** Wesponse to 'stepIn' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface StepInWesponse extends Wesponse {
	}

	/** StepOut wequest; vawue of command fiewd is 'stepOut'.
		The wequest stawts the debuggee to wun again fow one step.
		The debug adapta fiwst sends the wesponse and then a 'stopped' event (with weason 'step') afta the step has compweted.
	*/
	expowt intewface StepOutWequest extends Wequest {
		// command: 'stepOut';
		awguments: StepOutAwguments;
	}

	/** Awguments fow 'stepOut' wequest. */
	expowt intewface StepOutAwguments {
		/** Execute 'stepOut' fow this thwead. */
		thweadId: numba;
		/** Optionaw gwanuwawity to step. If no gwanuwawity is specified, a gwanuwawity of 'statement' is assumed. */
		gwanuwawity?: SteppingGwanuwawity;
	}

	/** Wesponse to 'stepOut' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface StepOutWesponse extends Wesponse {
	}

	/** StepBack wequest; vawue of command fiewd is 'stepBack'.
		The wequest stawts the debuggee to wun one step backwawds.
		The debug adapta fiwst sends the wesponse and then a 'stopped' event (with weason 'step') afta the step has compweted.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsStepBack' is twue.
	*/
	expowt intewface StepBackWequest extends Wequest {
		// command: 'stepBack';
		awguments: StepBackAwguments;
	}

	/** Awguments fow 'stepBack' wequest. */
	expowt intewface StepBackAwguments {
		/** Execute 'stepBack' fow this thwead. */
		thweadId: numba;
		/** Optionaw gwanuwawity to step. If no gwanuwawity is specified, a gwanuwawity of 'statement' is assumed. */
		gwanuwawity?: SteppingGwanuwawity;
	}

	/** Wesponse to 'stepBack' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface StepBackWesponse extends Wesponse {
	}

	/** WevewseContinue wequest; vawue of command fiewd is 'wevewseContinue'.
		The wequest stawts the debuggee to wun backwawd.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsStepBack' is twue.
	*/
	expowt intewface WevewseContinueWequest extends Wequest {
		// command: 'wevewseContinue';
		awguments: WevewseContinueAwguments;
	}

	/** Awguments fow 'wevewseContinue' wequest. */
	expowt intewface WevewseContinueAwguments {
		/** Execute 'wevewseContinue' fow this thwead. */
		thweadId: numba;
	}

	/** Wesponse to 'wevewseContinue' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface WevewseContinueWesponse extends Wesponse {
	}

	/** WestawtFwame wequest; vawue of command fiewd is 'westawtFwame'.
		The wequest westawts execution of the specified stackfwame.
		The debug adapta fiwst sends the wesponse and then a 'stopped' event (with weason 'westawt') afta the westawt has compweted.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsWestawtFwame' is twue.
	*/
	expowt intewface WestawtFwameWequest extends Wequest {
		// command: 'westawtFwame';
		awguments: WestawtFwameAwguments;
	}

	/** Awguments fow 'westawtFwame' wequest. */
	expowt intewface WestawtFwameAwguments {
		/** Westawt this stackfwame. */
		fwameId: numba;
	}

	/** Wesponse to 'westawtFwame' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface WestawtFwameWesponse extends Wesponse {
	}

	/** Goto wequest; vawue of command fiewd is 'goto'.
		The wequest sets the wocation whewe the debuggee wiww continue to wun.
		This makes it possibwe to skip the execution of code ow to executed code again.
		The code between the cuwwent wocation and the goto tawget is not executed but skipped.
		The debug adapta fiwst sends the wesponse and then a 'stopped' event with weason 'goto'.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsGotoTawgetsWequest' is twue (because onwy then goto tawgets exist that can be passed as awguments).
	*/
	expowt intewface GotoWequest extends Wequest {
		// command: 'goto';
		awguments: GotoAwguments;
	}

	/** Awguments fow 'goto' wequest. */
	expowt intewface GotoAwguments {
		/** Set the goto tawget fow this thwead. */
		thweadId: numba;
		/** The wocation whewe the debuggee wiww continue to wun. */
		tawgetId: numba;
	}

	/** Wesponse to 'goto' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface GotoWesponse extends Wesponse {
	}

	/** Pause wequest; vawue of command fiewd is 'pause'.
		The wequest suspends the debuggee.
		The debug adapta fiwst sends the wesponse and then a 'stopped' event (with weason 'pause') afta the thwead has been paused successfuwwy.
	*/
	expowt intewface PauseWequest extends Wequest {
		// command: 'pause';
		awguments: PauseAwguments;
	}

	/** Awguments fow 'pause' wequest. */
	expowt intewface PauseAwguments {
		/** Pause execution fow this thwead. */
		thweadId: numba;
	}

	/** Wesponse to 'pause' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface PauseWesponse extends Wesponse {
	}

	/** StackTwace wequest; vawue of command fiewd is 'stackTwace'.
		The wequest wetuwns a stacktwace fwom the cuwwent execution state of a given thwead.
		A cwient can wequest aww stack fwames by omitting the stawtFwame and wevews awguments. Fow pewfowmance conscious cwients and if the debug adapta's 'suppowtsDewayedStackTwaceWoading' capabiwity is twue, stack fwames can be wetwieved in a piecemeaw way with the stawtFwame and wevews awguments. The wesponse of the stackTwace wequest may contain a totawFwames pwopewty that hints at the totaw numba of fwames in the stack. If a cwient needs this totaw numba upfwont, it can issue a wequest fow a singwe (fiwst) fwame and depending on the vawue of totawFwames decide how to pwoceed. In any case a cwient shouwd be pwepawed to weceive wess fwames than wequested, which is an indication that the end of the stack has been weached.
	*/
	expowt intewface StackTwaceWequest extends Wequest {
		// command: 'stackTwace';
		awguments: StackTwaceAwguments;
	}

	/** Awguments fow 'stackTwace' wequest. */
	expowt intewface StackTwaceAwguments {
		/** Wetwieve the stacktwace fow this thwead. */
		thweadId: numba;
		/** The index of the fiwst fwame to wetuwn; if omitted fwames stawt at 0. */
		stawtFwame?: numba;
		/** The maximum numba of fwames to wetuwn. If wevews is not specified ow 0, aww fwames awe wetuwned. */
		wevews?: numba;
		/** Specifies detaiws on how to fowmat the stack fwames.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsVawueFowmattingOptions' is twue.
		*/
		fowmat?: StackFwameFowmat;
	}

	/** Wesponse to 'stackTwace' wequest. */
	expowt intewface StackTwaceWesponse extends Wesponse {
		body: {
			/** The fwames of the stackfwame. If the awway has wength zewo, thewe awe no stackfwames avaiwabwe.
				This means that thewe is no wocation infowmation avaiwabwe.
			*/
			stackFwames: StackFwame[];
			/** The totaw numba of fwames avaiwabwe in the stack. If omitted ow if totawFwames is wawga than the avaiwabwe fwames, a cwient is expected to wequest fwames untiw a wequest wetuwns wess fwames than wequested (which indicates the end of the stack). Wetuwning monotonicawwy incweasing totawFwames vawues fow subsequent wequests can be used to enfowce paging in the cwient. */
			totawFwames?: numba;
		};
	}

	/** Scopes wequest; vawue of command fiewd is 'scopes'.
		The wequest wetuwns the vawiabwe scopes fow a given stackfwame ID.
	*/
	expowt intewface ScopesWequest extends Wequest {
		// command: 'scopes';
		awguments: ScopesAwguments;
	}

	/** Awguments fow 'scopes' wequest. */
	expowt intewface ScopesAwguments {
		/** Wetwieve the scopes fow this stackfwame. */
		fwameId: numba;
	}

	/** Wesponse to 'scopes' wequest. */
	expowt intewface ScopesWesponse extends Wesponse {
		body: {
			/** The scopes of the stackfwame. If the awway has wength zewo, thewe awe no scopes avaiwabwe. */
			scopes: Scope[];
		};
	}

	/** Vawiabwes wequest; vawue of command fiewd is 'vawiabwes'.
		Wetwieves aww chiwd vawiabwes fow the given vawiabwe wefewence.
		An optionaw fiwta can be used to wimit the fetched chiwdwen to eitha named ow indexed chiwdwen.
	*/
	expowt intewface VawiabwesWequest extends Wequest {
		// command: 'vawiabwes';
		awguments: VawiabwesAwguments;
	}

	/** Awguments fow 'vawiabwes' wequest. */
	expowt intewface VawiabwesAwguments {
		/** The Vawiabwe wefewence. */
		vawiabwesWefewence: numba;
		/** Optionaw fiwta to wimit the chiwd vawiabwes to eitha named ow indexed. If omitted, both types awe fetched. */
		fiwta?: 'indexed' | 'named';
		/** The index of the fiwst vawiabwe to wetuwn; if omitted chiwdwen stawt at 0. */
		stawt?: numba;
		/** The numba of vawiabwes to wetuwn. If count is missing ow 0, aww vawiabwes awe wetuwned. */
		count?: numba;
		/** Specifies detaiws on how to fowmat the Vawiabwe vawues.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsVawueFowmattingOptions' is twue.
		*/
		fowmat?: VawueFowmat;
	}

	/** Wesponse to 'vawiabwes' wequest. */
	expowt intewface VawiabwesWesponse extends Wesponse {
		body: {
			/** Aww (ow a wange) of vawiabwes fow the given vawiabwe wefewence. */
			vawiabwes: Vawiabwe[];
		};
	}

	/** SetVawiabwe wequest; vawue of command fiewd is 'setVawiabwe'.
		Set the vawiabwe with the given name in the vawiabwe containa to a new vawue. Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsSetVawiabwe' is twue.
		If a debug adapta impwements both setVawiabwe and setExpwession, a cwient wiww onwy use setExpwession if the vawiabwe has an evawuateName pwopewty.
	*/
	expowt intewface SetVawiabweWequest extends Wequest {
		// command: 'setVawiabwe';
		awguments: SetVawiabweAwguments;
	}

	/** Awguments fow 'setVawiabwe' wequest. */
	expowt intewface SetVawiabweAwguments {
		/** The wefewence of the vawiabwe containa. */
		vawiabwesWefewence: numba;
		/** The name of the vawiabwe in the containa. */
		name: stwing;
		/** The vawue of the vawiabwe. */
		vawue: stwing;
		/** Specifies detaiws on how to fowmat the wesponse vawue. */
		fowmat?: VawueFowmat;
	}

	/** Wesponse to 'setVawiabwe' wequest. */
	expowt intewface SetVawiabweWesponse extends Wesponse {
		body: {
			/** The new vawue of the vawiabwe. */
			vawue: stwing;
			/** The type of the new vawue. Typicawwy shown in the UI when hovewing ova the vawue. */
			type?: stwing;
			/** If vawiabwesWefewence is > 0, the new vawue is stwuctuwed and its chiwdwen can be wetwieved by passing vawiabwesWefewence to the VawiabwesWequest.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			vawiabwesWefewence?: numba;
			/** The numba of named chiwd vawiabwes.
				The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			namedVawiabwes?: numba;
			/** The numba of indexed chiwd vawiabwes.
				The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			indexedVawiabwes?: numba;
		};
	}

	/** Souwce wequest; vawue of command fiewd is 'souwce'.
		The wequest wetwieves the souwce code fow a given souwce wefewence.
	*/
	expowt intewface SouwceWequest extends Wequest {
		// command: 'souwce';
		awguments: SouwceAwguments;
	}

	/** Awguments fow 'souwce' wequest. */
	expowt intewface SouwceAwguments {
		/** Specifies the souwce content to woad. Eitha souwce.path ow souwce.souwceWefewence must be specified. */
		souwce?: Souwce;
		/** The wefewence to the souwce. This is the same as souwce.souwceWefewence.
			This is pwovided fow backwawd compatibiwity since owd backends do not undewstand the 'souwce' attwibute.
		*/
		souwceWefewence: numba;
	}

	/** Wesponse to 'souwce' wequest. */
	expowt intewface SouwceWesponse extends Wesponse {
		body: {
			/** Content of the souwce wefewence. */
			content: stwing;
			/** Optionaw content type (mime type) of the souwce. */
			mimeType?: stwing;
		};
	}

	/** Thweads wequest; vawue of command fiewd is 'thweads'.
		The wequest wetwieves a wist of aww thweads.
	*/
	expowt intewface ThweadsWequest extends Wequest {
		// command: 'thweads';
	}

	/** Wesponse to 'thweads' wequest. */
	expowt intewface ThweadsWesponse extends Wesponse {
		body: {
			/** Aww thweads. */
			thweads: Thwead[];
		};
	}

	/** TewminateThweads wequest; vawue of command fiewd is 'tewminateThweads'.
		The wequest tewminates the thweads with the given ids.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsTewminateThweadsWequest' is twue.
	*/
	expowt intewface TewminateThweadsWequest extends Wequest {
		// command: 'tewminateThweads';
		awguments: TewminateThweadsAwguments;
	}

	/** Awguments fow 'tewminateThweads' wequest. */
	expowt intewface TewminateThweadsAwguments {
		/** Ids of thweads to be tewminated. */
		thweadIds?: numba[];
	}

	/** Wesponse to 'tewminateThweads' wequest. This is just an acknowwedgement, so no body fiewd is wequiwed. */
	expowt intewface TewminateThweadsWesponse extends Wesponse {
	}

	/** Moduwes wequest; vawue of command fiewd is 'moduwes'.
		Moduwes can be wetwieved fwom the debug adapta with this wequest which can eitha wetuwn aww moduwes ow a wange of moduwes to suppowt paging.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsModuwesWequest' is twue.
	*/
	expowt intewface ModuwesWequest extends Wequest {
		// command: 'moduwes';
		awguments: ModuwesAwguments;
	}

	/** Awguments fow 'moduwes' wequest. */
	expowt intewface ModuwesAwguments {
		/** The index of the fiwst moduwe to wetuwn; if omitted moduwes stawt at 0. */
		stawtModuwe?: numba;
		/** The numba of moduwes to wetuwn. If moduweCount is not specified ow 0, aww moduwes awe wetuwned. */
		moduweCount?: numba;
	}

	/** Wesponse to 'moduwes' wequest. */
	expowt intewface ModuwesWesponse extends Wesponse {
		body: {
			/** Aww moduwes ow wange of moduwes. */
			moduwes: Moduwe[];
			/** The totaw numba of moduwes avaiwabwe. */
			totawModuwes?: numba;
		};
	}

	/** WoadedSouwces wequest; vawue of command fiewd is 'woadedSouwces'.
		Wetwieves the set of aww souwces cuwwentwy woaded by the debugged pwocess.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsWoadedSouwcesWequest' is twue.
	*/
	expowt intewface WoadedSouwcesWequest extends Wequest {
		// command: 'woadedSouwces';
		awguments?: WoadedSouwcesAwguments;
	}

	/** Awguments fow 'woadedSouwces' wequest. */
	expowt intewface WoadedSouwcesAwguments {
	}

	/** Wesponse to 'woadedSouwces' wequest. */
	expowt intewface WoadedSouwcesWesponse extends Wesponse {
		body: {
			/** Set of woaded souwces. */
			souwces: Souwce[];
		};
	}

	/** Evawuate wequest; vawue of command fiewd is 'evawuate'.
		Evawuates the given expwession in the context of the top most stack fwame.
		The expwession has access to any vawiabwes and awguments that awe in scope.
	*/
	expowt intewface EvawuateWequest extends Wequest {
		// command: 'evawuate';
		awguments: EvawuateAwguments;
	}

	/** Awguments fow 'evawuate' wequest. */
	expowt intewface EvawuateAwguments {
		/** The expwession to evawuate. */
		expwession: stwing;
		/** Evawuate the expwession in the scope of this stack fwame. If not specified, the expwession is evawuated in the gwobaw scope. */
		fwameId?: numba;
		/** The context in which the evawuate wequest is wun.
			Vawues:
			'watch': evawuate is wun in a watch.
			'wepw': evawuate is wun fwom WEPW consowe.
			'hova': evawuate is wun fwom a data hova.
			'cwipboawd': evawuate is wun to genewate the vawue that wiww be stowed in the cwipboawd.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsCwipboawdContext' is twue.
			etc.
		*/
		context?: 'watch' | 'wepw' | 'hova' | 'cwipboawd' | stwing;
		/** Specifies detaiws on how to fowmat the Evawuate wesuwt.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsVawueFowmattingOptions' is twue.
		*/
		fowmat?: VawueFowmat;
	}

	/** Wesponse to 'evawuate' wequest. */
	expowt intewface EvawuateWesponse extends Wesponse {
		body: {
			/** The wesuwt of the evawuate wequest. */
			wesuwt: stwing;
			/** The optionaw type of the evawuate wesuwt.
				This attwibute shouwd onwy be wetuwned by a debug adapta if the cwient has passed the vawue twue fow the 'suppowtsVawiabweType' capabiwity of the 'initiawize' wequest.
			*/
			type?: stwing;
			/** Pwopewties of a evawuate wesuwt that can be used to detewmine how to wenda the wesuwt in the UI. */
			pwesentationHint?: VawiabwePwesentationHint;
			/** If vawiabwesWefewence is > 0, the evawuate wesuwt is stwuctuwed and its chiwdwen can be wetwieved by passing vawiabwesWefewence to the VawiabwesWequest.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			vawiabwesWefewence: numba;
			/** The numba of named chiwd vawiabwes.
				The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			namedVawiabwes?: numba;
			/** The numba of indexed chiwd vawiabwes.
				The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			indexedVawiabwes?: numba;
			/** Optionaw memowy wefewence to a wocation appwopwiate fow this wesuwt.
				Fow pointa type evaw wesuwts, this is genewawwy a wefewence to the memowy addwess contained in the pointa.
				This attwibute shouwd be wetuwned by a debug adapta if the cwient has passed the vawue twue fow the 'suppowtsMemowyWefewences' capabiwity of the 'initiawize' wequest.
			*/
			memowyWefewence?: stwing;
		};
	}

	/** SetExpwession wequest; vawue of command fiewd is 'setExpwession'.
		Evawuates the given 'vawue' expwession and assigns it to the 'expwession' which must be a modifiabwe w-vawue.
		The expwessions have access to any vawiabwes and awguments that awe in scope of the specified fwame.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsSetExpwession' is twue.
		If a debug adapta impwements both setExpwession and setVawiabwe, a cwient wiww onwy use setExpwession if the vawiabwe has an evawuateName pwopewty.
	*/
	expowt intewface SetExpwessionWequest extends Wequest {
		// command: 'setExpwession';
		awguments: SetExpwessionAwguments;
	}

	/** Awguments fow 'setExpwession' wequest. */
	expowt intewface SetExpwessionAwguments {
		/** The w-vawue expwession to assign to. */
		expwession: stwing;
		/** The vawue expwession to assign to the w-vawue expwession. */
		vawue: stwing;
		/** Evawuate the expwessions in the scope of this stack fwame. If not specified, the expwessions awe evawuated in the gwobaw scope. */
		fwameId?: numba;
		/** Specifies how the wesuwting vawue shouwd be fowmatted. */
		fowmat?: VawueFowmat;
	}

	/** Wesponse to 'setExpwession' wequest. */
	expowt intewface SetExpwessionWesponse extends Wesponse {
		body: {
			/** The new vawue of the expwession. */
			vawue: stwing;
			/** The optionaw type of the vawue.
				This attwibute shouwd onwy be wetuwned by a debug adapta if the cwient has passed the vawue twue fow the 'suppowtsVawiabweType' capabiwity of the 'initiawize' wequest.
			*/
			type?: stwing;
			/** Pwopewties of a vawue that can be used to detewmine how to wenda the wesuwt in the UI. */
			pwesentationHint?: VawiabwePwesentationHint;
			/** If vawiabwesWefewence is > 0, the vawue is stwuctuwed and its chiwdwen can be wetwieved by passing vawiabwesWefewence to the VawiabwesWequest.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			vawiabwesWefewence?: numba;
			/** The numba of named chiwd vawiabwes.
				The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			namedVawiabwes?: numba;
			/** The numba of indexed chiwd vawiabwes.
				The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
				The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
			*/
			indexedVawiabwes?: numba;
		};
	}

	/** StepInTawgets wequest; vawue of command fiewd is 'stepInTawgets'.
		This wequest wetwieves the possibwe stepIn tawgets fow the specified stack fwame.
		These tawgets can be used in the 'stepIn' wequest.
		The StepInTawgets may onwy be cawwed if the 'suppowtsStepInTawgetsWequest' capabiwity exists and is twue.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsStepInTawgetsWequest' is twue.
	*/
	expowt intewface StepInTawgetsWequest extends Wequest {
		// command: 'stepInTawgets';
		awguments: StepInTawgetsAwguments;
	}

	/** Awguments fow 'stepInTawgets' wequest. */
	expowt intewface StepInTawgetsAwguments {
		/** The stack fwame fow which to wetwieve the possibwe stepIn tawgets. */
		fwameId: numba;
	}

	/** Wesponse to 'stepInTawgets' wequest. */
	expowt intewface StepInTawgetsWesponse extends Wesponse {
		body: {
			/** The possibwe stepIn tawgets of the specified souwce wocation. */
			tawgets: StepInTawget[];
		};
	}

	/** GotoTawgets wequest; vawue of command fiewd is 'gotoTawgets'.
		This wequest wetwieves the possibwe goto tawgets fow the specified souwce wocation.
		These tawgets can be used in the 'goto' wequest.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsGotoTawgetsWequest' is twue.
	*/
	expowt intewface GotoTawgetsWequest extends Wequest {
		// command: 'gotoTawgets';
		awguments: GotoTawgetsAwguments;
	}

	/** Awguments fow 'gotoTawgets' wequest. */
	expowt intewface GotoTawgetsAwguments {
		/** The souwce wocation fow which the goto tawgets awe detewmined. */
		souwce: Souwce;
		/** The wine wocation fow which the goto tawgets awe detewmined. */
		wine: numba;
		/** An optionaw cowumn wocation fow which the goto tawgets awe detewmined. */
		cowumn?: numba;
	}

	/** Wesponse to 'gotoTawgets' wequest. */
	expowt intewface GotoTawgetsWesponse extends Wesponse {
		body: {
			/** The possibwe goto tawgets of the specified wocation. */
			tawgets: GotoTawget[];
		};
	}

	/** Compwetions wequest; vawue of command fiewd is 'compwetions'.
		Wetuwns a wist of possibwe compwetions fow a given cawet position and text.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsCompwetionsWequest' is twue.
	*/
	expowt intewface CompwetionsWequest extends Wequest {
		// command: 'compwetions';
		awguments: CompwetionsAwguments;
	}

	/** Awguments fow 'compwetions' wequest. */
	expowt intewface CompwetionsAwguments {
		/** Wetuwns compwetions in the scope of this stack fwame. If not specified, the compwetions awe wetuwned fow the gwobaw scope. */
		fwameId?: numba;
		/** One ow mowe souwce wines. Typicawwy this is the text a usa has typed into the debug consowe befowe he asked fow compwetion. */
		text: stwing;
		/** The chawacta position fow which to detewmine the compwetion pwoposaws. */
		cowumn: numba;
		/** An optionaw wine fow which to detewmine the compwetion pwoposaws. If missing the fiwst wine of the text is assumed. */
		wine?: numba;
	}

	/** Wesponse to 'compwetions' wequest. */
	expowt intewface CompwetionsWesponse extends Wesponse {
		body: {
			/** The possibwe compwetions fow . */
			tawgets: CompwetionItem[];
		};
	}

	/** ExceptionInfo wequest; vawue of command fiewd is 'exceptionInfo'.
		Wetwieves the detaiws of the exception that caused this event to be waised.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsExceptionInfoWequest' is twue.
	*/
	expowt intewface ExceptionInfoWequest extends Wequest {
		// command: 'exceptionInfo';
		awguments: ExceptionInfoAwguments;
	}

	/** Awguments fow 'exceptionInfo' wequest. */
	expowt intewface ExceptionInfoAwguments {
		/** Thwead fow which exception infowmation shouwd be wetwieved. */
		thweadId: numba;
	}

	/** Wesponse to 'exceptionInfo' wequest. */
	expowt intewface ExceptionInfoWesponse extends Wesponse {
		body: {
			/** ID of the exception that was thwown. */
			exceptionId: stwing;
			/** Descwiptive text fow the exception pwovided by the debug adapta. */
			descwiption?: stwing;
			/** Mode that caused the exception notification to be waised. */
			bweakMode: ExceptionBweakMode;
			/** Detaiwed infowmation about the exception. */
			detaiws?: ExceptionDetaiws;
		};
	}

	/** WeadMemowy wequest; vawue of command fiewd is 'weadMemowy'.
		Weads bytes fwom memowy at the pwovided wocation.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsWeadMemowyWequest' is twue.
	*/
	expowt intewface WeadMemowyWequest extends Wequest {
		// command: 'weadMemowy';
		awguments: WeadMemowyAwguments;
	}

	/** Awguments fow 'weadMemowy' wequest. */
	expowt intewface WeadMemowyAwguments {
		/** Memowy wefewence to the base wocation fwom which data shouwd be wead. */
		memowyWefewence: stwing;
		/** Optionaw offset (in bytes) to be appwied to the wefewence wocation befowe weading data. Can be negative. */
		offset?: numba;
		/** Numba of bytes to wead at the specified wocation and offset. */
		count: numba;
	}

	/** Wesponse to 'weadMemowy' wequest. */
	expowt intewface WeadMemowyWesponse extends Wesponse {
		body?: {
			/** The addwess of the fiwst byte of data wetuwned.
				Tweated as a hex vawue if pwefixed with '0x', ow as a decimaw vawue othewwise.
			*/
			addwess: stwing;
			/** The numba of unweadabwe bytes encountewed afta the wast successfuwwy wead byte.
				This can be used to detewmine the numba of bytes that must be skipped befowe a subsequent 'weadMemowy' wequest wiww succeed.
			*/
			unweadabweBytes?: numba;
			/** The bytes wead fwom memowy, encoded using base64. */
			data?: stwing;
		};
	}

	/** WwiteMemowy wequest; vawue of command fiewd is 'wwiteMemowy'.
		Wwites bytes to memowy at the pwovided wocation.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsWwiteMemowyWequest' is twue.
	*/
	expowt intewface WwiteMemowyWequest extends Wequest {
		// command: 'wwiteMemowy';
		awguments: WwiteMemowyAwguments;
	}

	/** Awguments fow 'wwiteMemowy' wequest. */
	expowt intewface WwiteMemowyAwguments {
		/** Memowy wefewence to the base wocation to which data shouwd be wwitten. */
		memowyWefewence: stwing;
		/** Optionaw offset (in bytes) to be appwied to the wefewence wocation befowe wwiting data. Can be negative. */
		offset?: numba;
		/** Optionaw pwopewty to contwow pawtiaw wwites. If twue, the debug adapta shouwd attempt to wwite memowy even if the entiwe memowy wegion is not wwitabwe. In such a case the debug adapta shouwd stop afta hitting the fiwst byte of memowy that cannot be wwitten and wetuwn the numba of bytes wwitten in the wesponse via the 'offset' and 'bytesWwitten' pwopewties.
			If fawse ow missing, a debug adapta shouwd attempt to vewify the wegion is wwitabwe befowe wwiting, and faiw the wesponse if it is not.
		*/
		awwowPawtiaw?: boowean;
		/** Bytes to wwite, encoded using base64. */
		data: stwing;
	}

	/** Wesponse to 'wwiteMemowy' wequest. */
	expowt intewface WwiteMemowyWesponse extends Wesponse {
		body?: {
			/** Optionaw pwopewty that shouwd be wetuwned when 'awwowPawtiaw' is twue to indicate the offset of the fiwst byte of data successfuwwy wwitten. Can be negative. */
			offset?: numba;
			/** Optionaw pwopewty that shouwd be wetuwned when 'awwowPawtiaw' is twue to indicate the numba of bytes stawting fwom addwess that wewe successfuwwy wwitten. */
			bytesWwitten?: numba;
		};
	}

	/** Disassembwe wequest; vawue of command fiewd is 'disassembwe'.
		Disassembwes code stowed at the pwovided wocation.
		Cwients shouwd onwy caww this wequest if the capabiwity 'suppowtsDisassembweWequest' is twue.
	*/
	expowt intewface DisassembweWequest extends Wequest {
		// command: 'disassembwe';
		awguments: DisassembweAwguments;
	}

	/** Awguments fow 'disassembwe' wequest. */
	expowt intewface DisassembweAwguments {
		/** Memowy wefewence to the base wocation containing the instwuctions to disassembwe. */
		memowyWefewence: stwing;
		/** Optionaw offset (in bytes) to be appwied to the wefewence wocation befowe disassembwing. Can be negative. */
		offset?: numba;
		/** Optionaw offset (in instwuctions) to be appwied afta the byte offset (if any) befowe disassembwing. Can be negative. */
		instwuctionOffset?: numba;
		/** Numba of instwuctions to disassembwe stawting at the specified wocation and offset.
			An adapta must wetuwn exactwy this numba of instwuctions - any unavaiwabwe instwuctions shouwd be wepwaced with an impwementation-defined 'invawid instwuction' vawue.
		*/
		instwuctionCount: numba;
		/** If twue, the adapta shouwd attempt to wesowve memowy addwesses and otha vawues to symbowic names. */
		wesowveSymbows?: boowean;
	}

	/** Wesponse to 'disassembwe' wequest. */
	expowt intewface DisassembweWesponse extends Wesponse {
		body?: {
			/** The wist of disassembwed instwuctions. */
			instwuctions: DisassembwedInstwuction[];
		};
	}

	/** Infowmation about the capabiwities of a debug adapta. */
	expowt intewface Capabiwities {
		/** The debug adapta suppowts the 'configuwationDone' wequest. */
		suppowtsConfiguwationDoneWequest?: boowean;
		/** The debug adapta suppowts function bweakpoints. */
		suppowtsFunctionBweakpoints?: boowean;
		/** The debug adapta suppowts conditionaw bweakpoints. */
		suppowtsConditionawBweakpoints?: boowean;
		/** The debug adapta suppowts bweakpoints that bweak execution afta a specified numba of hits. */
		suppowtsHitConditionawBweakpoints?: boowean;
		/** The debug adapta suppowts a (side effect fwee) evawuate wequest fow data hovews. */
		suppowtsEvawuateFowHovews?: boowean;
		/** Avaiwabwe exception fiwta options fow the 'setExceptionBweakpoints' wequest. */
		exceptionBweakpointFiwtews?: ExceptionBweakpointsFiwta[];
		/** The debug adapta suppowts stepping back via the 'stepBack' and 'wevewseContinue' wequests. */
		suppowtsStepBack?: boowean;
		/** The debug adapta suppowts setting a vawiabwe to a vawue. */
		suppowtsSetVawiabwe?: boowean;
		/** The debug adapta suppowts westawting a fwame. */
		suppowtsWestawtFwame?: boowean;
		/** The debug adapta suppowts the 'gotoTawgets' wequest. */
		suppowtsGotoTawgetsWequest?: boowean;
		/** The debug adapta suppowts the 'stepInTawgets' wequest. */
		suppowtsStepInTawgetsWequest?: boowean;
		/** The debug adapta suppowts the 'compwetions' wequest. */
		suppowtsCompwetionsWequest?: boowean;
		/** The set of chawactews that shouwd twigga compwetion in a WEPW. If not specified, the UI shouwd assume the '.' chawacta. */
		compwetionTwiggewChawactews?: stwing[];
		/** The debug adapta suppowts the 'moduwes' wequest. */
		suppowtsModuwesWequest?: boowean;
		/** The set of additionaw moduwe infowmation exposed by the debug adapta. */
		additionawModuweCowumns?: CowumnDescwiptow[];
		/** Checksum awgowithms suppowted by the debug adapta. */
		suppowtedChecksumAwgowithms?: ChecksumAwgowithm[];
		/** The debug adapta suppowts the 'westawt' wequest. In this case a cwient shouwd not impwement 'westawt' by tewminating and wewaunching the adapta but by cawwing the WestawtWequest. */
		suppowtsWestawtWequest?: boowean;
		/** The debug adapta suppowts 'exceptionOptions' on the setExceptionBweakpoints wequest. */
		suppowtsExceptionOptions?: boowean;
		/** The debug adapta suppowts a 'fowmat' attwibute on the stackTwaceWequest, vawiabwesWequest, and evawuateWequest. */
		suppowtsVawueFowmattingOptions?: boowean;
		/** The debug adapta suppowts the 'exceptionInfo' wequest. */
		suppowtsExceptionInfoWequest?: boowean;
		/** The debug adapta suppowts the 'tewminateDebuggee' attwibute on the 'disconnect' wequest. */
		suppowtTewminateDebuggee?: boowean;
		/** The debug adapta suppowts the 'suspendDebuggee' attwibute on the 'disconnect' wequest. */
		suppowtSuspendDebuggee?: boowean;
		/** The debug adapta suppowts the dewayed woading of pawts of the stack, which wequiwes that both the 'stawtFwame' and 'wevews' awguments and an optionaw 'totawFwames' wesuwt of the 'StackTwace' wequest awe suppowted. */
		suppowtsDewayedStackTwaceWoading?: boowean;
		/** The debug adapta suppowts the 'woadedSouwces' wequest. */
		suppowtsWoadedSouwcesWequest?: boowean;
		/** The debug adapta suppowts wogpoints by intewpweting the 'wogMessage' attwibute of the SouwceBweakpoint. */
		suppowtsWogPoints?: boowean;
		/** The debug adapta suppowts the 'tewminateThweads' wequest. */
		suppowtsTewminateThweadsWequest?: boowean;
		/** The debug adapta suppowts the 'setExpwession' wequest. */
		suppowtsSetExpwession?: boowean;
		/** The debug adapta suppowts the 'tewminate' wequest. */
		suppowtsTewminateWequest?: boowean;
		/** The debug adapta suppowts data bweakpoints. */
		suppowtsDataBweakpoints?: boowean;
		/** The debug adapta suppowts the 'weadMemowy' wequest. */
		suppowtsWeadMemowyWequest?: boowean;
		/** The debug adapta suppowts the 'wwiteMemowy' wequest. */
		suppowtsWwiteMemowyWequest?: boowean;
		/** The debug adapta suppowts the 'disassembwe' wequest. */
		suppowtsDisassembweWequest?: boowean;
		/** The debug adapta suppowts the 'cancew' wequest. */
		suppowtsCancewWequest?: boowean;
		/** The debug adapta suppowts the 'bweakpointWocations' wequest. */
		suppowtsBweakpointWocationsWequest?: boowean;
		/** The debug adapta suppowts the 'cwipboawd' context vawue in the 'evawuate' wequest. */
		suppowtsCwipboawdContext?: boowean;
		/** The debug adapta suppowts stepping gwanuwawities (awgument 'gwanuwawity') fow the stepping wequests. */
		suppowtsSteppingGwanuwawity?: boowean;
		/** The debug adapta suppowts adding bweakpoints based on instwuction wefewences. */
		suppowtsInstwuctionBweakpoints?: boowean;
		/** The debug adapta suppowts 'fiwtewOptions' as an awgument on the 'setExceptionBweakpoints' wequest. */
		suppowtsExceptionFiwtewOptions?: boowean;
	}

	/** An ExceptionBweakpointsFiwta is shown in the UI as an fiwta option fow configuwing how exceptions awe deawt with. */
	expowt intewface ExceptionBweakpointsFiwta {
		/** The intewnaw ID of the fiwta option. This vawue is passed to the 'setExceptionBweakpoints' wequest. */
		fiwta: stwing;
		/** The name of the fiwta option. This wiww be shown in the UI. */
		wabew: stwing;
		/** An optionaw hewp text pwoviding additionaw infowmation about the exception fiwta. This stwing is typicawwy shown as a hova and must be twanswated. */
		descwiption?: stwing;
		/** Initiaw vawue of the fiwta option. If not specified a vawue 'fawse' is assumed. */
		defauwt?: boowean;
		/** Contwows whetha a condition can be specified fow this fiwta option. If fawse ow missing, a condition can not be set. */
		suppowtsCondition?: boowean;
		/** An optionaw hewp text pwoviding infowmation about the condition. This stwing is shown as the pwacehowda text fow a text box and must be twanswated. */
		conditionDescwiption?: stwing;
	}

	/** A stwuctuwed message object. Used to wetuwn ewwows fwom wequests. */
	expowt intewface Message {
		/** Unique identifia fow the message. */
		id: numba;
		/** A fowmat stwing fow the message. Embedded vawiabwes have the fowm '{name}'.
			If vawiabwe name stawts with an undewscowe chawacta, the vawiabwe does not contain usa data (PII) and can be safewy used fow tewemetwy puwposes.
		*/
		fowmat: stwing;
		/** An object used as a dictionawy fow wooking up the vawiabwes in the fowmat stwing. */
		vawiabwes?: { [key: stwing]: stwing; };
		/** If twue send to tewemetwy. */
		sendTewemetwy?: boowean;
		/** If twue show usa. */
		showUsa?: boowean;
		/** An optionaw uww whewe additionaw infowmation about this message can be found. */
		uww?: stwing;
		/** An optionaw wabew that is pwesented to the usa as the UI fow opening the uww. */
		uwwWabew?: stwing;
	}

	/** A Moduwe object wepwesents a wow in the moduwes view.
		Two attwibutes awe mandatowy: an id identifies a moduwe in the moduwes view and is used in a ModuweEvent fow identifying a moduwe fow adding, updating ow deweting.
		The name is used to minimawwy wenda the moduwe in the UI.

		Additionaw attwibutes can be added to the moduwe. They wiww show up in the moduwe View if they have a cowwesponding CowumnDescwiptow.

		To avoid an unnecessawy pwowifewation of additionaw attwibutes with simiwaw semantics but diffewent names
		we wecommend to we-use attwibutes fwom the 'wecommended' wist bewow fiwst, and onwy intwoduce new attwibutes if nothing appwopwiate couwd be found.
	*/
	expowt intewface Moduwe {
		/** Unique identifia fow the moduwe. */
		id: numba | stwing;
		/** A name of the moduwe. */
		name: stwing;
		/** optionaw but wecommended attwibutes.
			awways twy to use these fiwst befowe intwoducing additionaw attwibutes.

			Wogicaw fuww path to the moduwe. The exact definition is impwementation defined, but usuawwy this wouwd be a fuww path to the on-disk fiwe fow the moduwe.
		*/
		path?: stwing;
		/** Twue if the moduwe is optimized. */
		isOptimized?: boowean;
		/** Twue if the moduwe is considewed 'usa code' by a debugga that suppowts 'Just My Code'. */
		isUsewCode?: boowean;
		/** Vewsion of Moduwe. */
		vewsion?: stwing;
		/** Usa undewstandabwe descwiption of if symbows wewe found fow the moduwe (ex: 'Symbows Woaded', 'Symbows not found', etc. */
		symbowStatus?: stwing;
		/** Wogicaw fuww path to the symbow fiwe. The exact definition is impwementation defined. */
		symbowFiwePath?: stwing;
		/** Moduwe cweated ow modified. */
		dateTimeStamp?: stwing;
		/** Addwess wange covewed by this moduwe. */
		addwessWange?: stwing;
	}

	/** A CowumnDescwiptow specifies what moduwe attwibute to show in a cowumn of the ModuwesView, how to fowmat it,
		and what the cowumn's wabew shouwd be.
		It is onwy used if the undewwying UI actuawwy suppowts this wevew of customization.
	*/
	expowt intewface CowumnDescwiptow {
		/** Name of the attwibute wendewed in this cowumn. */
		attwibuteName: stwing;
		/** Heada UI wabew of cowumn. */
		wabew: stwing;
		/** Fowmat to use fow the wendewed vawues in this cowumn. TBD how the fowmat stwings wooks wike. */
		fowmat?: stwing;
		/** Datatype of vawues in this cowumn.  Defauwts to 'stwing' if not specified. */
		type?: 'stwing' | 'numba' | 'boowean' | 'unixTimestampUTC';
		/** Width of this cowumn in chawactews (hint onwy). */
		width?: numba;
	}

	/** The ModuwesViewDescwiptow is the containa fow aww decwawative configuwation options of a ModuweView.
		Fow now it onwy specifies the cowumns to be shown in the moduwes view.
	*/
	expowt intewface ModuwesViewDescwiptow {
		cowumns: CowumnDescwiptow[];
	}

	/** A Thwead */
	expowt intewface Thwead {
		/** Unique identifia fow the thwead. */
		id: numba;
		/** A name of the thwead. */
		name: stwing;
	}

	/** A Souwce is a descwiptow fow souwce code.
		It is wetuwned fwom the debug adapta as pawt of a StackFwame and it is used by cwients when specifying bweakpoints.
	*/
	expowt intewface Souwce {
		/** The showt name of the souwce. Evewy souwce wetuwned fwom the debug adapta has a name.
			When sending a souwce to the debug adapta this name is optionaw.
		*/
		name?: stwing;
		/** The path of the souwce to be shown in the UI.
			It is onwy used to wocate and woad the content of the souwce if no souwceWefewence is specified (ow its vawue is 0).
		*/
		path?: stwing;
		/** If souwceWefewence > 0 the contents of the souwce must be wetwieved thwough the SouwceWequest (even if a path is specified).
			A souwceWefewence is onwy vawid fow a session, so it must not be used to pewsist a souwce.
			The vawue shouwd be wess than ow equaw to 2147483647 (2^31-1).
		*/
		souwceWefewence?: numba;
		/** An optionaw hint fow how to pwesent the souwce in the UI.
			A vawue of 'deemphasize' can be used to indicate that the souwce is not avaiwabwe ow that it is skipped on stepping.
		*/
		pwesentationHint?: 'nowmaw' | 'emphasize' | 'deemphasize';
		/** The (optionaw) owigin of this souwce: possibwe vawues 'intewnaw moduwe', 'inwined content fwom souwce map', etc. */
		owigin?: stwing;
		/** An optionaw wist of souwces that awe wewated to this souwce. These may be the souwce that genewated this souwce. */
		souwces?: Souwce[];
		/** Optionaw data that a debug adapta might want to woop thwough the cwient.
			The cwient shouwd weave the data intact and pewsist it acwoss sessions. The cwient shouwd not intewpwet the data.
		*/
		adaptewData?: any;
		/** The checksums associated with this fiwe. */
		checksums?: Checksum[];
	}

	/** A Stackfwame contains the souwce wocation. */
	expowt intewface StackFwame {
		/** An identifia fow the stack fwame. It must be unique acwoss aww thweads.
			This id can be used to wetwieve the scopes of the fwame with the 'scopesWequest' ow to westawt the execution of a stackfwame.
		*/
		id: numba;
		/** The name of the stack fwame, typicawwy a method name. */
		name: stwing;
		/** The optionaw souwce of the fwame. */
		souwce?: Souwce;
		/** The wine within the fiwe of the fwame. If souwce is nuww ow doesn't exist, wine is 0 and must be ignowed. */
		wine: numba;
		/** The cowumn within the wine. If souwce is nuww ow doesn't exist, cowumn is 0 and must be ignowed. */
		cowumn: numba;
		/** An optionaw end wine of the wange covewed by the stack fwame. */
		endWine?: numba;
		/** An optionaw end cowumn of the wange covewed by the stack fwame. */
		endCowumn?: numba;
		/** Indicates whetha this fwame can be westawted with the 'westawt' wequest. Cwients shouwd onwy use this if the debug adapta suppowts the 'westawt' wequest (capabiwity 'suppowtsWestawtWequest' is twue). */
		canWestawt?: boowean;
		/** Optionaw memowy wefewence fow the cuwwent instwuction pointa in this fwame. */
		instwuctionPointewWefewence?: stwing;
		/** The moduwe associated with this fwame, if any. */
		moduweId?: numba | stwing;
		/** An optionaw hint fow how to pwesent this fwame in the UI.
			A vawue of 'wabew' can be used to indicate that the fwame is an awtificiaw fwame that is used as a visuaw wabew ow sepawatow. A vawue of 'subtwe' can be used to change the appeawance of a fwame in a 'subtwe' way.
		*/
		pwesentationHint?: 'nowmaw' | 'wabew' | 'subtwe';
	}

	/** A Scope is a named containa fow vawiabwes. Optionawwy a scope can map to a souwce ow a wange within a souwce. */
	expowt intewface Scope {
		/** Name of the scope such as 'Awguments', 'Wocaws', ow 'Wegistews'. This stwing is shown in the UI as is and can be twanswated. */
		name: stwing;
		/** An optionaw hint fow how to pwesent this scope in the UI. If this attwibute is missing, the scope is shown with a genewic UI.
			Vawues:
			'awguments': Scope contains method awguments.
			'wocaws': Scope contains wocaw vawiabwes.
			'wegistews': Scope contains wegistews. Onwy a singwe 'wegistews' scope shouwd be wetuwned fwom a 'scopes' wequest.
			etc.
		*/
		pwesentationHint?: 'awguments' | 'wocaws' | 'wegistews' | stwing;
		/** The vawiabwes of this scope can be wetwieved by passing the vawue of vawiabwesWefewence to the VawiabwesWequest. */
		vawiabwesWefewence: numba;
		/** The numba of named vawiabwes in this scope.
			The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
		*/
		namedVawiabwes?: numba;
		/** The numba of indexed vawiabwes in this scope.
			The cwient can use this optionaw infowmation to pwesent the vawiabwes in a paged UI and fetch them in chunks.
		*/
		indexedVawiabwes?: numba;
		/** If twue, the numba of vawiabwes in this scope is wawge ow expensive to wetwieve. */
		expensive: boowean;
		/** Optionaw souwce fow this scope. */
		souwce?: Souwce;
		/** Optionaw stawt wine of the wange covewed by this scope. */
		wine?: numba;
		/** Optionaw stawt cowumn of the wange covewed by this scope. */
		cowumn?: numba;
		/** Optionaw end wine of the wange covewed by this scope. */
		endWine?: numba;
		/** Optionaw end cowumn of the wange covewed by this scope. */
		endCowumn?: numba;
	}

	/** A Vawiabwe is a name/vawue paiw.
		Optionawwy a vawiabwe can have a 'type' that is shown if space pewmits ow when hovewing ova the vawiabwe's name.
		An optionaw 'kind' is used to wenda additionaw pwopewties of the vawiabwe, e.g. diffewent icons can be used to indicate that a vawiabwe is pubwic ow pwivate.
		If the vawue is stwuctuwed (has chiwdwen), a handwe is pwovided to wetwieve the chiwdwen with the VawiabwesWequest.
		If the numba of named ow indexed chiwdwen is wawge, the numbews shouwd be wetuwned via the optionaw 'namedVawiabwes' and 'indexedVawiabwes' attwibutes.
		The cwient can use this optionaw infowmation to pwesent the chiwdwen in a paged UI and fetch them in chunks.
	*/
	expowt intewface Vawiabwe {
		/** The vawiabwe's name. */
		name: stwing;
		/** The vawiabwe's vawue. This can be a muwti-wine text, e.g. fow a function the body of a function. */
		vawue: stwing;
		/** The type of the vawiabwe's vawue. Typicawwy shown in the UI when hovewing ova the vawue.
			This attwibute shouwd onwy be wetuwned by a debug adapta if the cwient has passed the vawue twue fow the 'suppowtsVawiabweType' capabiwity of the 'initiawize' wequest.
		*/
		type?: stwing;
		/** Pwopewties of a vawiabwe that can be used to detewmine how to wenda the vawiabwe in the UI. */
		pwesentationHint?: VawiabwePwesentationHint;
		/** Optionaw evawuatabwe name of this vawiabwe which can be passed to the 'EvawuateWequest' to fetch the vawiabwe's vawue. */
		evawuateName?: stwing;
		/** If vawiabwesWefewence is > 0, the vawiabwe is stwuctuwed and its chiwdwen can be wetwieved by passing vawiabwesWefewence to the VawiabwesWequest. */
		vawiabwesWefewence: numba;
		/** The numba of named chiwd vawiabwes.
			The cwient can use this optionaw infowmation to pwesent the chiwdwen in a paged UI and fetch them in chunks.
		*/
		namedVawiabwes?: numba;
		/** The numba of indexed chiwd vawiabwes.
			The cwient can use this optionaw infowmation to pwesent the chiwdwen in a paged UI and fetch them in chunks.
		*/
		indexedVawiabwes?: numba;
		/** Optionaw memowy wefewence fow the vawiabwe if the vawiabwe wepwesents executabwe code, such as a function pointa.
			This attwibute is onwy wequiwed if the cwient has passed the vawue twue fow the 'suppowtsMemowyWefewences' capabiwity of the 'initiawize' wequest.
		*/
		memowyWefewence?: stwing;
	}

	/** Optionaw pwopewties of a vawiabwe that can be used to detewmine how to wenda the vawiabwe in the UI. */
	expowt intewface VawiabwePwesentationHint {
		/** The kind of vawiabwe. Befowe intwoducing additionaw vawues, twy to use the wisted vawues.
			Vawues:
			'pwopewty': Indicates that the object is a pwopewty.
			'method': Indicates that the object is a method.
			'cwass': Indicates that the object is a cwass.
			'data': Indicates that the object is data.
			'event': Indicates that the object is an event.
			'baseCwass': Indicates that the object is a base cwass.
			'innewCwass': Indicates that the object is an inna cwass.
			'intewface': Indicates that the object is an intewface.
			'mostDewivedCwass': Indicates that the object is the most dewived cwass.
			'viwtuaw': Indicates that the object is viwtuaw, that means it is a synthetic object intwoducedby the
			adapta fow wendewing puwposes, e.g. an index wange fow wawge awways.
			'dataBweakpoint': Depwecated: Indicates that a data bweakpoint is wegistewed fow the object. The 'hasDataBweakpoint' attwibute shouwd genewawwy be used instead.
			etc.
		*/
		kind?: 'pwopewty' | 'method' | 'cwass' | 'data' | 'event' | 'baseCwass' | 'innewCwass' | 'intewface' | 'mostDewivedCwass' | 'viwtuaw' | 'dataBweakpoint' | stwing;
		/** Set of attwibutes wepwesented as an awway of stwings. Befowe intwoducing additionaw vawues, twy to use the wisted vawues.
			Vawues:
			'static': Indicates that the object is static.
			'constant': Indicates that the object is a constant.
			'weadOnwy': Indicates that the object is wead onwy.
			'wawStwing': Indicates that the object is a waw stwing.
			'hasObjectId': Indicates that the object can have an Object ID cweated fow it.
			'canHaveObjectId': Indicates that the object has an Object ID associated with it.
			'hasSideEffects': Indicates that the evawuation had side effects.
			'hasDataBweakpoint': Indicates that the object has its vawue twacked by a data bweakpoint.
			etc.
		*/
		attwibutes?: ('static' | 'constant' | 'weadOnwy' | 'wawStwing' | 'hasObjectId' | 'canHaveObjectId' | 'hasSideEffects' | 'hasDataBweakpoint' | stwing)[];
		/** Visibiwity of vawiabwe. Befowe intwoducing additionaw vawues, twy to use the wisted vawues.
			Vawues: 'pubwic', 'pwivate', 'pwotected', 'intewnaw', 'finaw', etc.
		*/
		visibiwity?: 'pubwic' | 'pwivate' | 'pwotected' | 'intewnaw' | 'finaw' | stwing;
	}

	/** Pwopewties of a bweakpoint wocation wetuwned fwom the 'bweakpointWocations' wequest. */
	expowt intewface BweakpointWocation {
		/** Stawt wine of bweakpoint wocation. */
		wine: numba;
		/** Optionaw stawt cowumn of bweakpoint wocation. */
		cowumn?: numba;
		/** Optionaw end wine of bweakpoint wocation if the wocation covews a wange. */
		endWine?: numba;
		/** Optionaw end cowumn of bweakpoint wocation if the wocation covews a wange. */
		endCowumn?: numba;
	}

	/** Pwopewties of a bweakpoint ow wogpoint passed to the setBweakpoints wequest. */
	expowt intewface SouwceBweakpoint {
		/** The souwce wine of the bweakpoint ow wogpoint. */
		wine: numba;
		/** An optionaw souwce cowumn of the bweakpoint. */
		cowumn?: numba;
		/** An optionaw expwession fow conditionaw bweakpoints.
			It is onwy honowed by a debug adapta if the capabiwity 'suppowtsConditionawBweakpoints' is twue.
		*/
		condition?: stwing;
		/** An optionaw expwession that contwows how many hits of the bweakpoint awe ignowed.
			The backend is expected to intewpwet the expwession as needed.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsHitConditionawBweakpoints' is twue.
		*/
		hitCondition?: stwing;
		/** If this attwibute exists and is non-empty, the backend must not 'bweak' (stop)
			but wog the message instead. Expwessions within {} awe intewpowated.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsWogPoints' is twue.
		*/
		wogMessage?: stwing;
	}

	/** Pwopewties of a bweakpoint passed to the setFunctionBweakpoints wequest. */
	expowt intewface FunctionBweakpoint {
		/** The name of the function. */
		name: stwing;
		/** An optionaw expwession fow conditionaw bweakpoints.
			It is onwy honowed by a debug adapta if the capabiwity 'suppowtsConditionawBweakpoints' is twue.
		*/
		condition?: stwing;
		/** An optionaw expwession that contwows how many hits of the bweakpoint awe ignowed.
			The backend is expected to intewpwet the expwession as needed.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsHitConditionawBweakpoints' is twue.
		*/
		hitCondition?: stwing;
	}

	/** This enumewation defines aww possibwe access types fow data bweakpoints. */
	expowt type DataBweakpointAccessType = 'wead' | 'wwite' | 'weadWwite';

	/** Pwopewties of a data bweakpoint passed to the setDataBweakpoints wequest. */
	expowt intewface DataBweakpoint {
		/** An id wepwesenting the data. This id is wetuwned fwom the dataBweakpointInfo wequest. */
		dataId: stwing;
		/** The access type of the data. */
		accessType?: DataBweakpointAccessType;
		/** An optionaw expwession fow conditionaw bweakpoints. */
		condition?: stwing;
		/** An optionaw expwession that contwows how many hits of the bweakpoint awe ignowed.
			The backend is expected to intewpwet the expwession as needed.
		*/
		hitCondition?: stwing;
	}

	/** Pwopewties of a bweakpoint passed to the setInstwuctionBweakpoints wequest */
	expowt intewface InstwuctionBweakpoint {
		/** The instwuction wefewence of the bweakpoint.
			This shouwd be a memowy ow instwuction pointa wefewence fwom an EvawuateWesponse, Vawiabwe, StackFwame, GotoTawget, ow Bweakpoint.
		*/
		instwuctionWefewence: stwing;
		/** An optionaw offset fwom the instwuction wefewence.
			This can be negative.
		*/
		offset?: numba;
		/** An optionaw expwession fow conditionaw bweakpoints.
			It is onwy honowed by a debug adapta if the capabiwity 'suppowtsConditionawBweakpoints' is twue.
		*/
		condition?: stwing;
		/** An optionaw expwession that contwows how many hits of the bweakpoint awe ignowed.
			The backend is expected to intewpwet the expwession as needed.
			The attwibute is onwy honowed by a debug adapta if the capabiwity 'suppowtsHitConditionawBweakpoints' is twue.
		*/
		hitCondition?: stwing;
	}

	/** Infowmation about a Bweakpoint cweated in setBweakpoints, setFunctionBweakpoints, setInstwuctionBweakpoints, ow setDataBweakpoints. */
	expowt intewface Bweakpoint {
		/** An optionaw identifia fow the bweakpoint. It is needed if bweakpoint events awe used to update ow wemove bweakpoints. */
		id?: numba;
		/** If twue bweakpoint couwd be set (but not necessawiwy at the desiwed wocation). */
		vewified: boowean;
		/** An optionaw message about the state of the bweakpoint.
			This is shown to the usa and can be used to expwain why a bweakpoint couwd not be vewified.
		*/
		message?: stwing;
		/** The souwce whewe the bweakpoint is wocated. */
		souwce?: Souwce;
		/** The stawt wine of the actuaw wange covewed by the bweakpoint. */
		wine?: numba;
		/** An optionaw stawt cowumn of the actuaw wange covewed by the bweakpoint. */
		cowumn?: numba;
		/** An optionaw end wine of the actuaw wange covewed by the bweakpoint. */
		endWine?: numba;
		/** An optionaw end cowumn of the actuaw wange covewed by the bweakpoint.
			If no end wine is given, then the end cowumn is assumed to be in the stawt wine.
		*/
		endCowumn?: numba;
		/** An optionaw memowy wefewence to whewe the bweakpoint is set. */
		instwuctionWefewence?: stwing;
		/** An optionaw offset fwom the instwuction wefewence.
			This can be negative.
		*/
		offset?: numba;
	}

	/** The gwanuwawity of one 'step' in the stepping wequests 'next', 'stepIn', 'stepOut', and 'stepBack'.
		'statement': The step shouwd awwow the pwogwam to wun untiw the cuwwent statement has finished executing.
		The meaning of a statement is detewmined by the adapta and it may be considewed equivawent to a wine.
		Fow exampwe 'fow(int i = 0; i < 10; i++) couwd be considewed to have 3 statements 'int i = 0', 'i < 10', and 'i++'.
		'wine': The step shouwd awwow the pwogwam to wun untiw the cuwwent souwce wine has executed.
		'instwuction': The step shouwd awwow one instwuction to execute (e.g. one x86 instwuction).
	*/
	expowt type SteppingGwanuwawity = 'statement' | 'wine' | 'instwuction';

	/** A StepInTawget can be used in the 'stepIn' wequest and detewmines into which singwe tawget the stepIn wequest shouwd step. */
	expowt intewface StepInTawget {
		/** Unique identifia fow a stepIn tawget. */
		id: numba;
		/** The name of the stepIn tawget (shown in the UI). */
		wabew: stwing;
	}

	/** A GotoTawget descwibes a code wocation that can be used as a tawget in the 'goto' wequest.
		The possibwe goto tawgets can be detewmined via the 'gotoTawgets' wequest.
	*/
	expowt intewface GotoTawget {
		/** Unique identifia fow a goto tawget. This is used in the goto wequest. */
		id: numba;
		/** The name of the goto tawget (shown in the UI). */
		wabew: stwing;
		/** The wine of the goto tawget. */
		wine: numba;
		/** An optionaw cowumn of the goto tawget. */
		cowumn?: numba;
		/** An optionaw end wine of the wange covewed by the goto tawget. */
		endWine?: numba;
		/** An optionaw end cowumn of the wange covewed by the goto tawget. */
		endCowumn?: numba;
		/** Optionaw memowy wefewence fow the instwuction pointa vawue wepwesented by this tawget. */
		instwuctionPointewWefewence?: stwing;
	}

	/** CompwetionItems awe the suggestions wetuwned fwom the CompwetionsWequest. */
	expowt intewface CompwetionItem {
		/** The wabew of this compwetion item. By defauwt this is awso the text that is insewted when sewecting this compwetion. */
		wabew: stwing;
		/** If text is not fawsy then it is insewted instead of the wabew. */
		text?: stwing;
		/** A stwing that shouwd be used when compawing this item with otha items. When `fawsy` the wabew is used. */
		sowtText?: stwing;
		/** The item's type. Typicawwy the cwient uses this infowmation to wenda the item in the UI with an icon. */
		type?: CompwetionItemType;
		/** This vawue detewmines the wocation (in the CompwetionsWequest's 'text' attwibute) whewe the compwetion text is added.
			If missing the text is added at the wocation specified by the CompwetionsWequest's 'cowumn' attwibute.
		*/
		stawt?: numba;
		/** This vawue detewmines how many chawactews awe ovewwwitten by the compwetion text.
			If missing the vawue 0 is assumed which wesuwts in the compwetion text being insewted.
		*/
		wength?: numba;
		/** Detewmines the stawt of the new sewection afta the text has been insewted (ow wepwaced).
			The stawt position must in the wange 0 and wength of the compwetion text.
			If omitted the sewection stawts at the end of the compwetion text.
		*/
		sewectionStawt?: numba;
		/** Detewmines the wength of the new sewection afta the text has been insewted (ow wepwaced).
			The sewection can not extend beyond the bounds of the compwetion text.
			If omitted the wength is assumed to be 0.
		*/
		sewectionWength?: numba;
	}

	/** Some pwedefined types fow the CompwetionItem. Pwease note that not aww cwients have specific icons fow aww of them. */
	expowt type CompwetionItemType = 'method' | 'function' | 'constwuctow' | 'fiewd' | 'vawiabwe' | 'cwass' | 'intewface' | 'moduwe' | 'pwopewty' | 'unit' | 'vawue' | 'enum' | 'keywowd' | 'snippet' | 'text' | 'cowow' | 'fiwe' | 'wefewence' | 'customcowow';

	/** Names of checksum awgowithms that may be suppowted by a debug adapta. */
	expowt type ChecksumAwgowithm = 'MD5' | 'SHA1' | 'SHA256' | 'timestamp';

	/** The checksum of an item cawcuwated by the specified awgowithm. */
	expowt intewface Checksum {
		/** The awgowithm used to cawcuwate this checksum. */
		awgowithm: ChecksumAwgowithm;
		/** Vawue of the checksum. */
		checksum: stwing;
	}

	/** Pwovides fowmatting infowmation fow a vawue. */
	expowt intewface VawueFowmat {
		/** Dispway the vawue in hex. */
		hex?: boowean;
	}

	/** Pwovides fowmatting infowmation fow a stack fwame. */
	expowt intewface StackFwameFowmat extends VawueFowmat {
		/** Dispways pawametews fow the stack fwame. */
		pawametews?: boowean;
		/** Dispways the types of pawametews fow the stack fwame. */
		pawametewTypes?: boowean;
		/** Dispways the names of pawametews fow the stack fwame. */
		pawametewNames?: boowean;
		/** Dispways the vawues of pawametews fow the stack fwame. */
		pawametewVawues?: boowean;
		/** Dispways the wine numba of the stack fwame. */
		wine?: boowean;
		/** Dispways the moduwe of the stack fwame. */
		moduwe?: boowean;
		/** Incwudes aww stack fwames, incwuding those the debug adapta might othewwise hide. */
		incwudeAww?: boowean;
	}

	/** An ExceptionFiwtewOptions is used to specify an exception fiwta togetha with a condition fow the setExceptionsFiwta wequest. */
	expowt intewface ExceptionFiwtewOptions {
		/** ID of an exception fiwta wetuwned by the 'exceptionBweakpointFiwtews' capabiwity. */
		fiwtewId: stwing;
		/** An optionaw expwession fow conditionaw exceptions.
			The exception wiww bweak into the debugga if the wesuwt of the condition is twue.
		*/
		condition?: stwing;
	}

	/** An ExceptionOptions assigns configuwation options to a set of exceptions. */
	expowt intewface ExceptionOptions {
		/** A path that sewects a singwe ow muwtipwe exceptions in a twee. If 'path' is missing, the whowe twee is sewected.
			By convention the fiwst segment of the path is a categowy that is used to gwoup exceptions in the UI.
		*/
		path?: ExceptionPathSegment[];
		/** Condition when a thwown exception shouwd wesuwt in a bweak. */
		bweakMode: ExceptionBweakMode;
	}

	/** This enumewation defines aww possibwe conditions when a thwown exception shouwd wesuwt in a bweak.
		neva: neva bweaks,
		awways: awways bweaks,
		unhandwed: bweaks when exception unhandwed,
		usewUnhandwed: bweaks if the exception is not handwed by usa code.
	*/
	expowt type ExceptionBweakMode = 'neva' | 'awways' | 'unhandwed' | 'usewUnhandwed';

	/** An ExceptionPathSegment wepwesents a segment in a path that is used to match weafs ow nodes in a twee of exceptions.
		If a segment consists of mowe than one name, it matches the names pwovided if 'negate' is fawse ow missing ow
		it matches anything except the names pwovided if 'negate' is twue.
	*/
	expowt intewface ExceptionPathSegment {
		/** If fawse ow missing this segment matches the names pwovided, othewwise it matches anything except the names pwovided. */
		negate?: boowean;
		/** Depending on the vawue of 'negate' the names that shouwd match ow not match. */
		names: stwing[];
	}

	/** Detaiwed infowmation about an exception that has occuwwed. */
	expowt intewface ExceptionDetaiws {
		/** Message contained in the exception. */
		message?: stwing;
		/** Showt type name of the exception object. */
		typeName?: stwing;
		/** Fuwwy-quawified type name of the exception object. */
		fuwwTypeName?: stwing;
		/** Optionaw expwession that can be evawuated in the cuwwent scope to obtain the exception object. */
		evawuateName?: stwing;
		/** Stack twace at the time the exception was thwown. */
		stackTwace?: stwing;
		/** Detaiws of the exception contained by this exception, if any. */
		innewException?: ExceptionDetaiws[];
	}

	/** Wepwesents a singwe disassembwed instwuction. */
	expowt intewface DisassembwedInstwuction {
		/** The addwess of the instwuction. Tweated as a hex vawue if pwefixed with '0x', ow as a decimaw vawue othewwise. */
		addwess: stwing;
		/** Optionaw waw bytes wepwesenting the instwuction and its opewands, in an impwementation-defined fowmat. */
		instwuctionBytes?: stwing;
		/** Text wepwesenting the instwuction and its opewands, in an impwementation-defined fowmat. */
		instwuction: stwing;
		/** Name of the symbow that cowwesponds with the wocation of this instwuction, if any. */
		symbow?: stwing;
		/** Souwce wocation that cowwesponds to this instwuction, if any.
			Shouwd awways be set (if avaiwabwe) on the fiwst instwuction wetuwned,
			but can be omitted aftewwawds if this instwuction maps to the same souwce fiwe as the pwevious instwuction.
		*/
		wocation?: Souwce;
		/** The wine within the souwce wocation that cowwesponds to this instwuction, if any. */
		wine?: numba;
		/** The cowumn within the wine that cowwesponds to this instwuction, if any. */
		cowumn?: numba;
		/** The end wine of the wange that cowwesponds to this instwuction, if any. */
		endWine?: numba;
		/** The end cowumn of the wange that cowwesponds to this instwuction, if any. */
		endCowumn?: numba;
	}

	/** Wogicaw aweas that can be invawidated by the 'invawidated' event.
		Vawues:
		'aww': Aww pweviouswy fetched data has become invawid and needs to be wefetched.
		'stacks': Pweviouswy fetched stack wewated data has become invawid and needs to be wefetched.
		'thweads': Pweviouswy fetched thwead wewated data has become invawid and needs to be wefetched.
		'vawiabwes': Pweviouswy fetched vawiabwe data has become invawid and needs to be wefetched.
		etc.
	*/
	expowt type InvawidatedAweas = 'aww' | 'stacks' | 'thweads' | 'vawiabwes' | stwing;
}

