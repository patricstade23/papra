// Deterministic, idempotent comparator used everywhere flagged tag names are ordered.
// Keep this the single source of truth so repeated syncs always produce the same file name.
function compareTagNames(a: string, b: string): number {
  return a.localeCompare(b);
}

// Removes any leading `<flaggedTagName>` / `<flaggedTagName> ` prefixes from the current name to
// recover the user's "base" name. Longest-match-first so a shorter flagged name that is a textual
// prefix of a longer one (e.g. "Tax" vs "Tax 2024") does not win over the longer match.
//
// Accepted limitation: a base file name that coincidentally begins with a flagged tag name word
// (e.g. tag "Invoice" + file "Invoice from acme.pdf") will be over-stripped. This is inherent to
// prefix-based stripping and is accepted behavior.
function stripFlaggedTagPrefixes({
  currentName,
  allFlaggedTagNames,
}: {
  currentName: string;
  allFlaggedTagNames: string[];
}): string {
  const stripList = [...allFlaggedTagNames].sort((a, b) => b.length - a.length);

  let working = currentName.trimStart();
  let didStrip = true;

  while (didStrip) {
    didStrip = false;

    for (const flaggedName of stripList) {
      if (flaggedName.length === 0) {
        continue;
      }

      if (working === flaggedName) {
        working = '';
        didStrip = true;
        break;
      }

      if (working.startsWith(`${flaggedName} `)) {
        working = working.slice(flaggedName.length + 1).trimStart();
        didStrip = true;
        break;
      }
    }
  }

  return working;
}

// Computes the document name after applying flagged-tag prefixes:
//   `<sorted flagged tag names> <base name>`
// It first strips any previously-applied flagged prefixes (using the org-wide flagged set) to
// recover the base name, then prepends the currently-assigned flagged tag names alphabetically.
//
// Idempotent: because every assigned flagged name is also in the org-wide flagged set, running the
// function twice strips then re-applies the exact same prefixes.
export function computeDocumentNameWithTags({
  currentName,
  allFlaggedTagNames,
  assignedFlaggedTagNames,
}: {
  currentName: string;
  allFlaggedTagNames: string[];
  assignedFlaggedTagNames: string[];
}): string {
  const baseName = stripFlaggedTagPrefixes({ currentName, allFlaggedTagNames });

  const sortedAssignedNames = [...new Set(assignedFlaggedTagNames)].sort(compareTagNames);

  if (sortedAssignedNames.length === 0) {
    return baseName;
  }

  if (baseName.length === 0) {
    return sortedAssignedNames.join(' ');
  }

  return `${sortedAssignedNames.join(' ')} ${baseName}`;
}
