// Test file for change highlights

export function test() {
  console.log('Line 1');
  console.log('Line 2 - MODIFIED');
  console.log('Line 3');
  console.log('Line 4 - NEW');
  console.log('Line 5 - NEW');
  console.log('Line 6 - NEW');
  console.log('Line 7 - NEW');
}

// More new lines
export const newVar = 'added';
export const anotherVar = 'also added';

// Round 2 - testing with fixed isStreaming
export function newFunction() {
  console.log('This should be highlighted green');
  console.log('Line 2');
  console.log('Line 3');
  console.log('Line 4 - NEW');
  console.log('Line 5 - NEW');
}

// This should highlight green
export const test1 = 'new line';
export const test2 = 'another new line';
export const test3 = 'third new line';
export const test4 = 'fourth new line';
export const test5 = 'fifth new line';

// These should stay highlighted
export const persistent1 = 'highlight persists';
export const persistent2 = 'no fade out';
export const persistent3 = 'stays green';
export const persistent4 = 'until file switch';

// Testing with git diff disabled
export const test1 = 'new line 1';
export const test2 = 'new line 2';
export const test3 = 'new line 3';
export const test4 = 'new line 4';

// Git-based highlighting test
export const gitLine1 = 'should be green from git diff';
export const gitLine2 = 'all uncommitted lines highlighted';

// Recent edit should have accent border
export const recent1 = 'this should have border + green';
export const recent2 = 'border fades after 2.5s';
