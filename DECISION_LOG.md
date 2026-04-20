# Decision Log

## Image conversion: two independent ffmpeg timeouts (240 s total)

**Decision:** Keep the current two-stage PPM pipeline with two separate `runFfmpeg` calls, each with a 120 s timeout.

**Why skipped / not merged into one timeout:** The two-stage approach is required to guarantee ICC profile removal — a single ffmpeg pass retains ICC as AV_FRAME_DATA_ICC_PROFILE side data even with `-map_metadata -1`. PPM has no metadata capacity, so decoding to PPM first is the only reliable method. Merging both stages into one call would require a complex pipe via `-`, complicating error handling. The 240 s combined ceiling is acceptable for the 500 MB file size limit; in practice only the first stage (decode to PPM) is slow for large images.

**How to apply:** If a user reports image conversion timeout, revisit with a single-stage approach using an intermediate format that also strips side data (e.g., raw bitmap), or reduce `MAX_FILE_SIZE`.

## `new Uint8Array(output).buffer` — correctly copies pooled Buffer data

**Decision:** Keep `new Uint8Array(output).buffer` in `src/lib/server/convert.ts`.

**Why:** Multiple reviewers questioned whether this copies data when the source `Buffer` is backed by Node's pooled `ArrayBuffer`. ECMAScript §23.2.5.1 specifies that `TypedArray(typedArray)` (i.e., constructing a TypedArray from another TypedArray) always allocates a fresh `ArrayBuffer` and copies elements — regardless of the source's `byteOffset` or backing store type (pooled or otherwise). The resulting `.buffer` is therefore always a correctly-sized, independent copy. The alternative `output.buffer.slice(output.byteOffset, ...)` is equivalent in correctness but adds noise.

**How to apply:** Do not change this line without verifying the ECMAScript spec still holds in the target Node.js version. The comment in the source cites the spec section for future reference.
