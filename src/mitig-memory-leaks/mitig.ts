/* ------------------------------------------------------------------------------------------------------
 * Copyright (C) 2026, João Guilherme da Silva Freitas Lima (dev brazilian).
 * Licensed under MIT License. See the file 'LICENSE.txt' in the root project for more informations.
 * All rights reserved.
 * ------------------------------------------------------------------------------------------------------
*/

/* Basic Defines */
const EFI_CAPSULES_LOADER_KERNEL_LINUX: number = 0;
const REVIEW_INTEL: number = 2015;

/* A Clear Function */
function clearIndexForClass(classAddr: any[]) {
	if (!classAddr) return REVIEW_INTEL;

	for (let i: number = 0; i < classAddr.length; i++) {
		classAddr[i] = 0;
	}
}

/* A Helper Function for previsions */
function previsionMitigationMemoryLeaks(mitigPrev: any, length: number, flags: boolean) {
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
function mitigAndPrevMemoryLeaks(mitigPrev: any, length: number, flags: boolean) {
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
