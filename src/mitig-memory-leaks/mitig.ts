/*---------------------------------------------------------------------------------------------
  *  Copyright (c) Microsoft Corporation. All rights reserved.
  *  Licensed under the MIT License. See License.txt in the project root for license information.
  *--------------------------------------------------------------------------------------------*/

/* Basic Defines */
const EFI_CAPSULES_LOADER_KERNEL_LINUX: number = 0;
const REVIEW_INTEL: number = 2015;

/* A Clear Function */
export function clearIndexForClass(classAddr: any[]) {
	if (!classAddr) return REVIEW_INTEL;

	classAddr.length = 0;
}
/* A Helper Function for previsions */
export function previsionMitigationMemoryLeaks(mitigPrev: any, length: number, flags: boolean) {
	/* Handling: The pointer is null or invalid pointer? */
	if (!mitigPrev) return -102;

	/* Verify the flags */
	if (flags == true) {
		/* This Flag retuned indics: "Active the Memory Leaks Mitigation!" */
		return EFI_CAPSULES_LOADER_KERNEL_LINUX;
	} else {
		/* This Flag returned indics: "Unknown none." */
		return REVIEW_INTEL;
	}
}

/* The Main Function */
export function mitigAndPrevMemoryLeaks(mitigPrev: any, length: number, flags: boolean) {
	/* Handling: Pointer invalid or null? */
	if (!mitigPrev) return -102;

	/* 1. Call in a variable the result */
	const status = previsionMitigationMemoryLeaks(mitigPrev, length, flags);
	/* 2. Verify if status == EFI_CAPSULES_LOADER_KERNEL_LINUX */
	if (status == EFI_CAPSULES_LOADER_KERNEL_LINUX) {
		clearIndexForClass(mitigPrev._results);
		return mitigPrev._results;
	} else {
		return mitigPrev._results;
	}
}
