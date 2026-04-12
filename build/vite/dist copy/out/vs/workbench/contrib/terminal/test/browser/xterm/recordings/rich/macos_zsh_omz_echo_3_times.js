/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable */
// macOS 15.5
// zsh 5.9
// oh-my-zsh fa396ad
// Steps:
// - Open terminal
// - Type echo a
// - Press enter
// - Type echo b
// - Press enter
// - Type echo c
// - Press enter
export const events = [
    {
        "type": "resize",
        "cols": 107,
        "rows": 24
    },
    {
        "type": "output",
        "data": "\u001b]633;P;ContinuationPrompt=%_> \u0007\u001b]633;P;PromptType=p10k\u0007\u001b]633;P;HasRichCommandDetection=True\u0007\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
    },
    {
        "type": "output",
        "data": "\u001b]633;D\u0007"
    },
    {
        "type": "output",
        "data": ""
    },
    {
        "type": "output",
        "data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
    },
    {
        "type": "promptInputChange",
        "data": "|"
    },
    {
        "type": "input",
        "data": "e"
    },
    {
        "type": "output",
        "data": "e"
    },
    {
        "type": "promptInputChange",
        "data": "e|"
    },
    {
        "type": "input",
        "data": "c"
    },
    {
        "type": "output",
        "data": "\bec"
    },
    {
        "type": "promptInputChange",
        "data": "ec|"
    },
    {
        "type": "input",
        "data": "h"
    },
    {
        "type": "output",
        "data": "h"
    },
    {
        "type": "promptInputChange",
        "data": "ech|"
    },
    {
        "type": "input",
        "data": "o"
    },
    {
        "type": "output",
        "data": "o"
    },
    {
        "type": "promptInputChange",
        "data": "echo|"
    },
    {
        "type": "input",
        "data": " "
    },
    {
        "type": "output",
        "data": " "
    },
    {
        "type": "promptInputChange",
        "data": "echo |"
    },
    {
        "type": "input",
        "data": "a"
    },
    {
        "type": "output",
        "data": "a"
    },
    {
        "type": "promptInputChange",
        "data": "echo a|"
    },
    {
        "type": "input",
        "data": "\r"
    },
    {
        "type": "output",
        "data": "\u001b[?2004l\r\r\n\u001b]633;E;echo a;448d50d0-70fe-4ab5-842e-132f3b1c159a\u0007"
    },
    {
        "type": "output",
        "data": "\u001b]633;C\u0007"
    },
    {
        "type": "output",
        "data": "a\r\n\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
    },
    {
        "type": "output",
        "data": "\u001b]633;D;0\u0007"
    },
    {
        "type": "output",
        "data": ""
    },
    {
        "type": "output",
        "data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
    },
    {
        "type": "promptInputChange",
        "data": "|"
    },
    {
        "type": "input",
        "data": "e"
    },
    {
        "type": "output",
        "data": "e"
    },
    {
        "type": "promptInputChange",
        "data": "e|"
    },
    {
        "type": "input",
        "data": "c"
    },
    {
        "type": "output",
        "data": "\bec"
    },
    {
        "type": "promptInputChange",
        "data": "ec|"
    },
    {
        "type": "input",
        "data": "h"
    },
    {
        "type": "output",
        "data": "h"
    },
    {
        "type": "promptInputChange",
        "data": "ech|"
    },
    {
        "type": "input",
        "data": "o"
    },
    {
        "type": "output",
        "data": "o"
    },
    {
        "type": "promptInputChange",
        "data": "echo|"
    },
    {
        "type": "input",
        "data": " "
    },
    {
        "type": "output",
        "data": " "
    },
    {
        "type": "promptInputChange",
        "data": "echo |"
    },
    {
        "type": "input",
        "data": "b"
    },
    {
        "type": "output",
        "data": "b"
    },
    {
        "type": "promptInputChange",
        "data": "echo b|"
    },
    {
        "type": "input",
        "data": "\r"
    },
    {
        "type": "output",
        "data": "\u001b[?2004l\r\r\n\u001b]633;E;echo b;448d50d0-70fe-4ab5-842e-132f3b1c159a\u0007"
    },
    {
        "type": "output",
        "data": "\u001b]633;C\u0007"
    },
    {
        "type": "output",
        "data": "b\r\n\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
    },
    {
        "type": "output",
        "data": "\u001b]633;D;0\u0007"
    },
    {
        "type": "output",
        "data": ""
    },
    {
        "type": "output",
        "data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
    },
    {
        "type": "promptInputChange",
        "data": "|"
    },
    {
        "type": "input",
        "data": "e"
    },
    {
        "type": "output",
        "data": "e"
    },
    {
        "type": "promptInputChange",
        "data": "e|"
    },
    {
        "type": "input",
        "data": "c"
    },
    {
        "type": "output",
        "data": "\bec"
    },
    {
        "type": "promptInputChange",
        "data": "ec|"
    },
    {
        "type": "input",
        "data": "h"
    },
    {
        "type": "output",
        "data": "h"
    },
    {
        "type": "promptInputChange",
        "data": "ech|"
    },
    {
        "type": "input",
        "data": "o"
    },
    {
        "type": "output",
        "data": "o"
    },
    {
        "type": "promptInputChange",
        "data": "echo|"
    },
    {
        "type": "input",
        "data": " "
    },
    {
        "type": "output",
        "data": " "
    },
    {
        "type": "promptInputChange",
        "data": "echo |"
    },
    {
        "type": "input",
        "data": "c"
    },
    {
        "type": "output",
        "data": "c"
    },
    {
        "type": "promptInputChange",
        "data": "echo c|"
    },
    {
        "type": "input",
        "data": "\r"
    },
    {
        "type": "output",
        "data": "\u001b[?2004l\r\r\n"
    },
    {
        "type": "output",
        "data": "\u001b]633;E;echo c;448d50d0-70fe-4ab5-842e-132f3b1c159a\u0007"
    },
    {
        "type": "output",
        "data": "\u001b]633;C\u0007"
    },
    {
        "type": "output",
        "data": "c\r\n\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
    },
    {
        "type": "output",
        "data": "\u001b]633;D;0\u0007"
    },
    {
        "type": "output",
        "data": ""
    },
    {
        "type": "output",
        "data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
    },
    {
        "type": "promptInputChange",
        "data": "|"
    }
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFjb3NfenNoX29tel9lY2hvXzNfdGltZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIveHRlcm0vcmVjb3JkaW5ncy9yaWNoL21hY29zX3pzaF9vbXpfZWNob18zX3RpbWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLG9CQUFvQjtBQUVwQixhQUFhO0FBQ2IsVUFBVTtBQUNWLG9CQUFvQjtBQUNwQixTQUFTO0FBQ1Qsa0JBQWtCO0FBQ2xCLGdCQUFnQjtBQUNoQixnQkFBZ0I7QUFDaEIsZ0JBQWdCO0FBQ2hCLGdCQUFnQjtBQUNoQixnQkFBZ0I7QUFDaEIsZ0JBQWdCO0FBQ2hCLE1BQU0sQ0FBQyxNQUFNLE1BQU0sR0FBRztJQUNyQjtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO1FBQ1gsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLDJSQUEyUjtLQUNuUztJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9CQUFvQjtLQUM1QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9UQUFvVDtLQUM1VDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLElBQUk7S0FDWjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsTUFBTTtLQUNkO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxLQUFLO0tBQ2I7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsTUFBTTtLQUNkO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLE9BQU87S0FDZjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxRQUFRO0tBQ2hCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFNBQVM7S0FDakI7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLElBQUk7S0FDWjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG1GQUFtRjtLQUMzRjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9CQUFvQjtLQUM1QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFLQUFxSztLQUM3SztJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHNCQUFzQjtLQUM5QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9UQUFvVDtLQUM1VDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLElBQUk7S0FDWjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsTUFBTTtLQUNkO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxLQUFLO0tBQ2I7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsTUFBTTtLQUNkO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLE9BQU87S0FDZjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxRQUFRO0tBQ2hCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFNBQVM7S0FDakI7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLElBQUk7S0FDWjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG1GQUFtRjtLQUMzRjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9CQUFvQjtLQUM1QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFLQUFxSztLQUM3SztJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHNCQUFzQjtLQUM5QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9UQUFvVDtLQUM1VDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLElBQUk7S0FDWjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsTUFBTTtLQUNkO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxLQUFLO0tBQ2I7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEdBQUc7S0FDWDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsTUFBTTtLQUNkO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLE9BQU87S0FDZjtJQUNEO1FBQ0MsTUFBTSxFQUFFLE9BQU87UUFDZixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsUUFBUTtRQUNoQixNQUFNLEVBQUUsR0FBRztLQUNYO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzNCLE1BQU0sRUFBRSxRQUFRO0tBQ2hCO0lBQ0Q7UUFDQyxNQUFNLEVBQUUsT0FBTztRQUNmLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxRQUFRO1FBQ2hCLE1BQU0sRUFBRSxHQUFHO0tBQ1g7SUFDRDtRQUNDLE1BQU0sRUFBRSxtQkFBbUI7UUFDM0IsTUFBTSxFQUFFLFNBQVM7S0FDakI7SUFDRDtRQUNDLE1BQU0sRUFBRSxPQUFPO1FBQ2YsTUFBTSxFQUFFLElBQUk7S0FDWjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFCQUFxQjtLQUM3QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLGdFQUFnRTtLQUN4RTtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9CQUFvQjtLQUM1QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHFLQUFxSztLQUM3SztJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLHNCQUFzQjtLQUM5QjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLEVBQUU7S0FDVjtJQUNEO1FBQ0MsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLG9UQUFvVDtLQUM1VDtJQUNEO1FBQ0MsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixNQUFNLEVBQUUsR0FBRztLQUNYO0NBQ0QsQ0FBQyJ9