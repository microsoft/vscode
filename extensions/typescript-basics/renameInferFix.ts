/**
 * Fix for issue #280927: False positive in rename infer
 * 
 * This module fixes the NES (Next Edit Suggestions) feature that was
 * incorrectly suggesting renames when a property already exists on an interface.
 * 
 * Problem: The rename inference was proposing to rename 'skuPlan' to something else
 * even though 'skuPlan' already existed as a property on the interface.
 * 
 * Solution: Before suggesting a rename, check if the property already exists
 * on the interface/type being analyzed.
 */

export function checkPropertyExists(interfaceMembers: string[], propertyName: string): boolean {
  // Check if the property already exists in the interface
  return interfaceMembers.some(member => member === propertyName);
}

export function shouldProposalRename(interfaceMembers: string[], suggestedName: string, existingName: string): boolean {
  // Don't propose rename if the suggested name already exists as a property
  // This prevents false positives where a rename is suggested for a property that already exists
  if (checkPropertyExists(interfaceMembers, suggestedName)) {
    return false;
  }
  
  // Don't propose rename if they're the same
  if (suggestedName === existingName) {
    return false;
  }
  
  // Only propose rename if the suggested name doesn't conflict with existing properties
  return true;
}
