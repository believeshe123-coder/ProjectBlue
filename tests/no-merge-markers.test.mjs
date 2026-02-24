import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

function getSourceFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
      continue;
    }
    if (extname(fullPath) === '.js') files.push(fullPath);
  }
  return files;
}

test('source files do not contain unresolved merge conflict markers', () => {
  const sourceFiles = getSourceFiles('src');
  const markerPattern = /^(<{7}|={7}|>{7})(?: .*)?$/m;

  const filesWithMarkers = sourceFiles.filter((filePath) => markerPattern.test(readFileSync(filePath, 'utf8')));

  assert.deepEqual(filesWithMarkers, []);
});
