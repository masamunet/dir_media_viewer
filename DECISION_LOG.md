# Decision Log

## Image conversion: two independent ffmpeg timeouts (240 s total)

**Decision:** Keep the current two-stage PPM pipeline with two separate `runFfmpeg` calls, each with a 120 s timeout.

**Why skipped / not merged into one timeout:** The two-stage approach is required to guarantee ICC profile removal — a single ffmpeg pass retains ICC as AV_FRAME_DATA_ICC_PROFILE side data even with `-map_metadata -1`. PPM has no metadata capacity, so decoding to PPM first is the only reliable method. Merging both stages into one call would require a complex pipe via `-`, complicating error handling. The 240 s combined ceiling is acceptable for the 500 MB file size limit; in practice only the first stage (decode to PPM) is slow for large images.

**How to apply:** If a user reports image conversion timeout, revisit with a single-stage approach using an intermediate format that also strips side data (e.g., raw bitmap), or reduce `MAX_FILE_SIZE`.

## `new Uint8Array(output).buffer` — correctly copies pooled Buffer data

**Decision:** Keep `new Uint8Array(output).buffer` in `src/lib/server/convert.ts`.

**Why:** Multiple reviewers questioned whether this copies data when the source `Buffer` is backed by Node's pooled `ArrayBuffer`. ECMAScript §23.2.5.1 specifies that `TypedArray(typedArray)` (i.e., constructing a TypedArray from another TypedArray) always allocates a fresh `ArrayBuffer` and copies elements — regardless of the source's `byteOffset` or backing store type (pooled or otherwise). The resulting `.buffer` is therefore always a correctly-sized, independent copy. The alternative `output.buffer.slice(output.byteOffset, ...)` is equivalent in correctness but adds noise.

**How to apply:** Do not change this line without verifying the ECMAScript spec still holds in the target Node.js version. The comment in the source cites the spec section for future reference.

## Path-traversal guard: `BUILD_DIR` itself never appears as `filePath`

**Decision:** The traversal guard uses only `filePath.startsWith(buildDirWithSep)` without an additional `|| filePath === BUILD_DIR` exception.

**Why:** `filePath` equals `BUILD_DIR` only if `resolvePath(join(BUILD_DIR, pathname))` collapses to the directory itself, which requires `pathname` to be `/` or empty — neither of which has an extension. The routing logic sends all extension-less paths directly to `index.html` before the traversal check, so `filePath === BUILD_DIR` is unreachable in the `isKnownAsset` branch. Adding the exception back would be dead code.

**How to apply:** If routing logic changes to allow extension-less paths through the asset branch, re-evaluate whether `filePath === BUILD_DIR` should be added to the guard or handled as a 403.

## `Content-Disposition`: `filename` and `filename*` intentionally differ

**Decision:** Keep `filename` using `safeFallback` (sanitized, ASCII) and `filename*` using raw `baseName` (percent-encoded via `encodeURIComponent` + RFC 5987 extras).

**Why:** RFC 6266 §4.3 explicitly recommends that `filename` be a legacy ASCII fallback and `filename*` carry the original name encoded as UTF-8. The divergence is intentional and standard. `encodeURIComponent` safely encodes all unsafe characters (`<`, `>`, `;`, newlines, etc.) in `baseName`, and the subsequent `.replace(/['()*]/g, ...)` covers the remaining RFC 5987 `attr-char` gaps. Using `safeFallback` for both would unnecessarily mangle non-ASCII filenames in modern browsers.

**How to apply:** Do not unify `filename` and `filename*` to the same value. The RFC-recommended pattern of sanitized fallback + encoded original is correct.

## `convertMedia`: no content-type validation of the buffer against `mediaType`

**Decision:** Accept any buffer for a given `mediaType` without sniffing the content.

**Why:** `ffmpeg` detects the actual format via demuxer probing and returns a non-zero exit code if the content is unrecognisable or incompatible with the requested output. The error propagates to the caller normally. Adding a separate magic-byte check before calling ffmpeg would duplicate logic ffmpeg already performs and would reject legitimate edge cases (e.g. HEIC images, which ffmpeg can decode to JPEG via the image pipeline). The `isMediaType` guard ensures only `'image'` or `'video'` are accepted; within each category ffmpeg handles the rest.

**How to apply:** If silent zero-byte outputs are ever observed, add ffmpeg `-v error` probing before the conversion step to surface the error earlier.
