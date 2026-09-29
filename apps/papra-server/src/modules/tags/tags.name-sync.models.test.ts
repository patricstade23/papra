import { describe, expect, test } from 'vitest';
import { computeDocumentNameWithTags } from './tags.name-sync.models';

describe('tags name sync models', () => {
  describe('computeDocumentNameWithTags', () => {
    test('when no flagged tags are assigned and none exist in the org, the name is unchanged', () => {
      expect(
        computeDocumentNameWithTags({
          currentName: 'invoice.pdf',
          allFlaggedTagNames: [],
          assignedFlaggedTagNames: [],
        }),
      ).to.eql('invoice.pdf');
    });

    test('a single assigned flagged tag name is prepended to the base name', () => {
      expect(
        computeDocumentNameWithTags({
          currentName: 'invoice.pdf',
          allFlaggedTagNames: ['Invoice'],
          assignedFlaggedTagNames: ['Invoice'],
        }),
      ).to.eql('Invoice invoice.pdf');
    });

    test('multiple assigned flagged tag names are prepended in alphabetical order', () => {
      expect(
        computeDocumentNameWithTags({
          currentName: 'report.pdf',
          allFlaggedTagNames: ['Invoice', '2024', 'Tax'],
          assignedFlaggedTagNames: ['Tax', 'Invoice', '2024'],
        }),
      ).to.eql('2024 Invoice Tax report.pdf');
    });

    test('is idempotent: re-computing on an already-prefixed name yields the same result', () => {
      const once = computeDocumentNameWithTags({
        currentName: 'report.pdf',
        allFlaggedTagNames: ['Invoice', '2024'],
        assignedFlaggedTagNames: ['Invoice', '2024'],
      });

      const twice = computeDocumentNameWithTags({
        currentName: once,
        allFlaggedTagNames: ['Invoice', '2024'],
        assignedFlaggedTagNames: ['Invoice', '2024'],
      });

      expect(once).to.eql('2024 Invoice report.pdf');
      expect(twice).to.eql(once);
    });

    test('removing a flagged tag strips its previously-applied prefix back out', () => {
      // Document currently named with both prefixes, but only "2024" is still assigned.
      expect(
        computeDocumentNameWithTags({
          currentName: '2024 Invoice report.pdf',
          allFlaggedTagNames: ['Invoice', '2024'],
          assignedFlaggedTagNames: ['2024'],
        }),
      ).to.eql('2024 report.pdf');
    });

    test('removing the last flagged tag restores the original base name', () => {
      expect(
        computeDocumentNameWithTags({
          currentName: 'Invoice invoice.pdf',
          allFlaggedTagNames: ['Invoice'],
          assignedFlaggedTagNames: [],
        }),
      ).to.eql('invoice.pdf');
    });

    test('duplicate assigned tag names are de-duplicated', () => {
      expect(
        computeDocumentNameWithTags({
          currentName: 'doc.pdf',
          allFlaggedTagNames: ['Invoice'],
          assignedFlaggedTagNames: ['Invoice', 'Invoice'],
        }),
      ).to.eql('Invoice doc.pdf');
    });

    test('tag names with regex-special characters are matched literally, not as patterns', () => {
      const applied = computeDocumentNameWithTags({
        currentName: 'notes.txt',
        allFlaggedTagNames: ['C++ (draft)'],
        assignedFlaggedTagNames: ['C++ (draft)'],
      });

      expect(applied).to.eql('C++ (draft) notes.txt');

      // Stripping matches the literal string, so removing the tag restores the base name.
      expect(
        computeDocumentNameWithTags({
          currentName: applied,
          allFlaggedTagNames: ['C++ (draft)'],
          assignedFlaggedTagNames: [],
        }),
      ).to.eql('notes.txt');
    });

    test('longest-match-first: overlapping tag names strip the correct prefix', () => {
      // "Tax 2024" and "Tax" both flagged; the longer one must be stripped as a unit.
      expect(
        computeDocumentNameWithTags({
          currentName: 'Tax 2024 return.pdf',
          allFlaggedTagNames: ['Tax', 'Tax 2024'],
          assignedFlaggedTagNames: ['Tax 2024'],
        }),
      ).to.eql('Tax 2024 return.pdf');
    });

    test('tag names containing spaces are prepended and stripped correctly', () => {
      const applied = computeDocumentNameWithTags({
        currentName: 'summary.pdf',
        allFlaggedTagNames: ['Q1 2024'],
        assignedFlaggedTagNames: ['Q1 2024'],
      });

      expect(applied).to.eql('Q1 2024 summary.pdf');

      // Now remove it again.
      expect(
        computeDocumentNameWithTags({
          currentName: applied,
          allFlaggedTagNames: ['Q1 2024'],
          assignedFlaggedTagNames: [],
        }),
      ).to.eql('summary.pdf');
    });

    test('accepted limitation: a base name that coincidentally starts with a flagged tag word is over-stripped', () => {
      // Tag "Invoice" is flagged and NOT assigned, but the base file name legitimately starts with
      // "Invoice ". The prefix-based strip removes it. This documents the known trade-off.
      expect(
        computeDocumentNameWithTags({
          currentName: 'Invoice from acme.pdf',
          allFlaggedTagNames: ['Invoice'],
          assignedFlaggedTagNames: [],
        }),
      ).to.eql('from acme.pdf');
    });
  });
});
