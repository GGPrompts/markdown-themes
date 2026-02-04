import { describe, it, expect } from 'vitest';
import { parseDiff, type DiffLine } from './DiffViewer';

describe('parseDiff', () => {
  it('parses file headers correctly', () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
index abc123..def456 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,3 @@
 line 1
-old line
+new line
 line 3`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('src/app.ts');
    expect(files[0].newPath).toBe('src/app.ts');
  });

  it('parses renamed files correctly', () => {
    const diff = `diff --git a/old-name.ts b/new-name.ts
index abc123..def456 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,1 +1,1 @@
-old content
+new content`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('old-name.ts');
    expect(files[0].newPath).toBe('new-name.ts');
  });

  it('parses hunk headers with line numbers', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -10,6 +10,7 @@ function example() {
 context`;

    const files = parseDiff(diff);
    expect(files[0].hunks).toHaveLength(1);

    const hunk = files[0].hunks[0];
    expect(hunk.oldStart).toBe(10);
    expect(hunk.oldCount).toBe(6);
    expect(hunk.newStart).toBe(10);
    expect(hunk.newCount).toBe(7);
    expect(hunk.header).toBe('function example() {');
  });

  it('parses hunk headers without counts (single line changes)', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -5 +5 @@ context
-old
+new`;

    const files = parseDiff(diff);
    const hunk = files[0].hunks[0];
    expect(hunk.oldStart).toBe(5);
    expect(hunk.oldCount).toBe(1);
    expect(hunk.newStart).toBe(5);
    expect(hunk.newCount).toBe(1);
  });

  it('identifies addition lines correctly', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 line 1
+added line
 line 2`;

    const files = parseDiff(diff);
    const lines = files[0].hunks[0].lines;

    expect(lines).toHaveLength(3);
    expect(lines[0].type).toBe('context');
    expect(lines[1].type).toBe('addition');
    expect(lines[1].content).toBe('added line');
    expect(lines[2].type).toBe('context');
  });

  it('identifies deletion lines correctly', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,2 @@
 line 1
-deleted line
 line 3`;

    const files = parseDiff(diff);
    const lines = files[0].hunks[0].lines;

    expect(lines).toHaveLength(3);
    expect(lines[0].type).toBe('context');
    expect(lines[1].type).toBe('deletion');
    expect(lines[1].content).toBe('deleted line');
    expect(lines[2].type).toBe('context');
  });

  it('identifies context lines correctly', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 context line 1
-old
+new
 context line 2`;

    const files = parseDiff(diff);
    const lines = files[0].hunks[0].lines;

    expect(lines[0].type).toBe('context');
    expect(lines[0].content).toBe('context line 1');
    expect(lines[3].type).toBe('context');
    expect(lines[3].content).toBe('context line 2');
  });

  it('assigns correct line numbers', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -5,4 +5,5 @@
 context at 5
-deleted at 6
+added at 6
+added at 7
 context at 7/8`;

    const files = parseDiff(diff);
    const lines = files[0].hunks[0].lines;

    // Context line: both old and new line numbers
    expect(lines[0].oldLineNumber).toBe(5);
    expect(lines[0].newLineNumber).toBe(5);

    // Deletion: only old line number
    expect(lines[1].oldLineNumber).toBe(6);
    expect(lines[1].newLineNumber).toBeNull();

    // First addition: only new line number
    expect(lines[2].oldLineNumber).toBeNull();
    expect(lines[2].newLineNumber).toBe(6);

    // Second addition: only new line number
    expect(lines[3].oldLineNumber).toBeNull();
    expect(lines[3].newLineNumber).toBe(7);

    // Final context: both, but numbers differ due to addition
    expect(lines[4].oldLineNumber).toBe(7);
    expect(lines[4].newLineNumber).toBe(8);
  });

  it('parses multiple files in a single diff', () => {
    const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,1 @@
-foo
+bar`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0].newPath).toBe('file1.ts');
    expect(files[1].newPath).toBe('file2.ts');
  });

  it('parses multiple hunks in a single file', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
@@ -10,3 +10,3 @@
 x
-y
+Y
 z`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].hunks).toHaveLength(2);

    expect(files[0].hunks[0].oldStart).toBe(1);
    expect(files[0].hunks[1].oldStart).toBe(10);
  });

  it('handles empty diff', () => {
    const files = parseDiff('');
    expect(files).toHaveLength(0);
  });

  it('handles new file (from /dev/null)', () => {
    const diff = `diff --git a/new-file.ts b/new-file.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].newPath).toBe('new-file.ts');
    expect(files[0].hunks[0].lines).toHaveLength(3);
    expect(files[0].hunks[0].lines.every((l: DiffLine) => l.type === 'addition')).toBe(true);
  });

  it('handles deleted file (to /dev/null)', () => {
    const diff = `diff --git a/deleted-file.ts b/deleted-file.ts
deleted file mode 100644
index abc1234..0000000
--- a/deleted-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('deleted-file.ts');
    expect(files[0].hunks[0].lines).toHaveLength(3);
    expect(files[0].hunks[0].lines.every((l: DiffLine) => l.type === 'deletion')).toBe(true);
  });

  it('preserves empty lines in content', () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@

-old
+new
 `;

    const files = parseDiff(diff);
    const lines = files[0].hunks[0].lines;

    // First line is empty context
    expect(lines[0].type).toBe('context');
    expect(lines[0].content).toBe('');

    // Last line is empty context
    expect(lines[3].type).toBe('context');
    expect(lines[3].content).toBe('');
  });
});
