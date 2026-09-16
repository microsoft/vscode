# Artifact processing and producer validation

The Publish job separates two outcomes:

1. **Process artifacts** runs `publish.ts --process-artifacts`. It retains task-level
   retries and per-operation transient retries. It polls until all enabled producer
   stages finish, continues discovering later artifacts, and waits for every started
   publication operation to settle. Downloads and extraction remain sequential to
   avoid Azure DevOps throttling; CDN publication remains concurrent.
2. **Validate producer stages** runs `publish.ts --validate-producer-stages` only after
   processing succeeds. It re-reads the timeline and fails if an enabled producer is
   missing, incomplete, or unsuccessful. This task has no task-level retries: it cannot
   repair a terminal producer failure. Its timeline request retains transient retries.

For example, when Windows fails while macOS is still building, artifact processing
continues. macOS artifacts arriving later are still published and recorded in the
existing processed-artifact checkpoint. Only afterward does producer validation fail
the Publish job. The final build release remains gated on the whole job succeeding.

An artifact download or publication failure still fails the processing task and can
trigger its existing retries. Failed artifacts are not marked as processed.

Running `publish.ts` without arguments preserves its combined behavior: process and
drain artifacts first, then validate producer results. The split does not rename,
replace, or reuse product artifacts, and does not change signing, SBOM, security, or
release gates.
