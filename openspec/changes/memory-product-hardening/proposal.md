## Why

Remembrall ya funciona, pero para usarlo a diario necesita menos ruido, más control y mejor presentación de la información. Ahora que el almacenamiento Markdown está resuelto, el siguiente paso es convertirlo en un producto usable: configurable, con mejor calidad de memorias, comandos de diagnóstico, seguridad y recuperación más inteligente.

## What Changes

- Add a user/config-driven control plane for capsule sizing, recall limits, thresholds, scope toggles, and storage overrides.
- Improve memory quality with duplicate detection, similarity hints, pruning/archiving, and optional expiration for stale content.
- Enrich saved memories with more organization metadata such as tags, relations, source, and relevant files.
- Make recall more useful with better filtering, ranking signals, and a no-noise injection threshold.
- Add operational commands for status, export/import, edit/revise, explain, pin, prune, and health checks.
- Add stronger privacy and secret redaction controls, with optional disk encryption and personal-scope disablement.
- Improve repo-aware behavior by using repo identity and git branch as recall signals.
- Harden storage behavior for corruption recovery, locking, and journal compaction.
- Improve tree/detail rendering so Markdown bodies keep their structure, bullets, and spacing visibly readable.

## Capabilities

### New Capabilities
- `memory-product-hardening`: Add configuration, memory-quality controls, richer metadata, recall improvements, UX commands, privacy safeguards, repo-aware routing, and storage robustness for day-to-day Remembrall use.

### Modified Capabilities
- None

## Impact

Affected areas include config loading, memory persistence metadata, recall scoring, capsule generation, tree/detail rendering, command surface, privacy handling, repo context integration, and storage maintenance logic. This change may also add new files for config defaults and diagnostic output.
