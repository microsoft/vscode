//
//  Copyright (c) Microsoft Corporation. All rights reserved.
//

#import "UseQuotes.h"
#import <Use/GTLT.h>

/*
	Multi
	Line
	Comments
*/
@implementation Test

- (void) applicationWillFinishLaunching:(NSNotification *)notification
{
}

- (IBAction)onSelectInput:(id)sender
{
    NSString* defaultDir = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, true)[0];

    NSOpenPanel* panel = [NSOpenPanel openPanel];
    [panel setAllowedFileTypes:[[NSArray alloc] initWithObjects:@"ipa", @"xcarchive", @"app", nil]];

    [panel beginWithCompletionHandler:^(NSInteger result)
     {
         if (result == NSFileHandlingPanelOKButton)
             [self.inputTextField setStringValue:[panel.URL path]];
     }];
     return YES;

     int hex = 0xFEF1F0F;
	 float ing = 3.14;
	 ing = 3.14e0;
	 ing = 31.4e-2;
}

-(id) initWithParams:(id<anObject>) aHandler withDeviceStateManager:(id<anotherObject>) deviceStateManager
{
    // add a tap gesture recognizer
    UITapGestureRecognizer *tapGesture = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleTap:)];
    NSMutableArray *gestureRecognizers = [NSMutableArray array];
    [gestureRecognizers addObject:tapGesture];
    [gestureRecognizers addObjectsFromArray:scnView.gestureRecognizers];
    scnView.gestureRecognizers = gestureRecognizers;

	return tapGesture;
	return nil;
}

@end
