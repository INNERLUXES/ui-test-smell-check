// Reading the input: files and folders named on the command line. A folder is walked with lstat, so a symbolic link (or
// a Windows junction) inside it is listed and never followed: a link cannot lead the tool out of the folder or round in
// a loop. Only files whose ending names a language the tool reads are opened, each one only when it is a regular file
// under the size limit, with the size taken from the open file. Nothing that is read is run or imported.

import { lstat, open, readdir, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { SKIP_FOLDERS, languageOf } from './data.js';
import { matchesAny } from './glob.js';

export const FILE_LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxEntries: 100000,
  maxDepth: 32,
  maxFiles: 20000,
  maxInputs: 1000
};

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function sizeLimit(bytes) {
  return bytes >= 1048576 && bytes % 1048576 === 0 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} byte`;
}

// The whole file, or an error when it is not a regular file or is over the limit. The file is opened once and its type
// and size are taken from the open handle, so a file swapped for a link or a pipe after the walk is refused.
export async function readBounded(path, maxBytes = FILE_LIMITS.maxFileBytes) {
  let handle;
  try {
    handle = await open(resolve(path), 'r');
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(path, 'no such file');
    throw fileError(path, `cannot be read (${error.code ?? error.message})`);
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw fileError(path, 'not a regular file');
    if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${sizeLimit(maxBytes)} limit`);
    const buffer = Buffer.alloc(opened.size);
    let read = 0;
    while (read < opened.size) {
      const { bytesRead } = await handle.read(buffer, read, opened.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown absolute,
// also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// A file holds binary data when its first 8,000 bytes hold a null byte.
export const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

const isUtf16 = (buffer) => buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff));

// UTF-8 text without a leading byte order mark. A file that starts with the byte order mark of UTF-16 is refused with a
// reason, because the tool reads UTF-8 only.
export function decodeText(buffer) {
  if (isUtf16(buffer)) throw fileError('file', 'is UTF-16; only UTF-8 is read');
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Reads one file into { file, language, size, text, reason }.
async function readOne(full, shown, size, limits, budget) {
  const file = { file: shown, language: languageOf(shown), size, text: null, reason: null };
  if (size > limits.maxFileBytes) {
    file.reason = `${size.toLocaleString('en-US')} bytes is over the ${sizeLimit(limits.maxFileBytes)} limit`;
    return file;
  }
  if (budget.total + size > limits.maxTotalBytes) throw fileError(shown, `the files to read hold more than ${sizeLimit(limits.maxTotalBytes)}`);
  try {
    const buffer = await readBounded(full, limits.maxFileBytes);
    budget.total += buffer.length;
    if (isUtf16(buffer)) file.reason = 'is UTF-16; only UTF-8 is read';
    else if (isBinary(buffer)) file.reason = 'holds binary data (a null byte)';
    else file.text = decodeText(buffer);
  } catch (error) {
    file.reason = error.reason ?? error.message;
  }
  return file;
}

// Reads the files and folders named, in the order given. Returns { inputs, files, links, skipped, special, otherFiles,
// ignored }: the paths as shown, the files of a language the tool reads (with their text, or the reason they were not
// read), the links that were not followed, the folders that were not entered, the entries that are neither files nor
// folders, the count of other files, and the files left out by an ignore pattern. More entries, depth, files or bytes
// than the limits is an error: the input is refused rather than read in part.
export async function readInputs(paths, base = process.cwd(), limits = FILE_LIMITS, ignore = []) {
  const lim = { ...FILE_LIMITS, ...limits };
  if (paths.length > lim.maxInputs) throw fileError(`${paths.length} paths`, `more than ${lim.maxInputs.toLocaleString('en-US')} paths`);
  const out = { inputs: [], files: [], links: [], skipped: [], special: [], otherFiles: 0, ignored: [] };
  const budget = { total: 0, entries: 0, files: 0 };
  const seen = new Set();
  const take = async (full, shown, size) => {
    if (seen.has(shown)) return;
    seen.add(shown);
    if (ignore.length && matchesAny(ignore, shown)) {
      out.ignored.push(shown);
      return;
    }
    budget.files += 1;
    if (budget.files > lim.maxFiles) throw fileError(shown, `more than ${lim.maxFiles.toLocaleString('en-US')} files to read; give the test folders only, or raise limits.maxFiles`);
    out.files.push(await readOne(full, shown, size, lim, budget));
  };
  for (const path of paths) {
    const full = resolve(base, path);
    const shown = displayPath(full, base);
    out.inputs.push(shown);
    let info;
    try {
      info = await stat(full);
    } catch (error) {
      if (error.code === 'ENOENT') throw fileError(shown, 'no such file or folder');
      throw fileError(shown, `cannot be read (${error.code ?? error.message})`);
    }
    if (info.isFile()) {
      if (!languageOf(full)) throw fileError(shown, 'not a file the tool reads; give .js, .mjs, .cjs, .jsx, .ts, .mts, .cts, .tsx, .py or .java files, or a folder');
      await take(full, shown, info.size);
      continue;
    }
    if (!info.isDirectory()) throw fileError(shown, 'not a file or a folder');
    // The walk keeps its own list of folders, so deep folders need no recursion; folders are walked in name order.
    const pending = [{ dir: full, rel: '', depth: 0 }];
    while (pending.length) {
      const { dir, rel, depth } = pending.pop();
      let names;
      try {
        names = (await readdir(dir)).sort();
      } catch (error) {
        out.special.push({ path: rel ? `${shown}/${rel}` : shown, reason: `folder cannot be read (${error.code ?? error.message})` });
        continue;
      }
      const folders = [];
      for (const name of names) {
        budget.entries += 1;
        if (budget.entries > lim.maxEntries) throw fileError(shown, `the folders hold more than ${lim.maxEntries.toLocaleString('en-US')} files and folders; give the test folders only`);
        const childRel = rel ? `${rel}/${name}` : name;
        const childShown = shown === '.' ? childRel : `${shown}/${childRel}`;
        const child = resolve(dir, name);
        let st;
        try {
          st = await lstat(child);
        } catch (error) {
          out.special.push({ path: childShown, reason: `cannot be read (${error.code ?? error.message})` });
          continue;
        }
        if (st.isSymbolicLink()) out.links.push(childShown);
        else if (st.isDirectory()) {
          if (SKIP_FOLDERS.includes(name)) {
            out.skipped.push(childShown);
            continue;
          }
          if (depth + 1 > lim.maxDepth) throw fileError(shown, `has folders nested more than ${lim.maxDepth} deep (${childRel.slice(0, 120)}...)`);
          folders.push({ dir: child, rel: childRel, depth: depth + 1 });
        } else if (st.isFile()) {
          if (!languageOf(name)) out.otherFiles += 1;
          else await take(child, childShown, st.size);
        } else out.special.push({ path: childShown, reason: 'not a regular file or folder' });
      }
      for (const f of folders.reverse()) pending.push(f);
    }
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  out.files.sort((a, b) => order(a.file, b.file));
  out.links.sort(order);
  out.skipped.sort(order);
  out.ignored.sort(order);
  return out;
}
