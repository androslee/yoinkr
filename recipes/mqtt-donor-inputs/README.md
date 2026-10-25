# Frozen MQTT donor build inputs

These are dependency-resolution metadata and source-map URL identities for the
pinned MQTT Explorer revision, not donor source or a generated derivative.
The two npm locks match the existing recovery recipe hashes. Source-map identities
freeze webpack's path-dependent debug URL suffixes; normalization does not change
executed module code. Both resulting bundles must still match the original frozen
recipe SHA-256 values or the build fails.

The original source, its license/attribution page, and all dependency notices remain
upstream inputs. MQTT's conflicting license declarations are unresolved: do not
redistribute generated donor-derived packages. These old donor development locks
are for isolated reproducibility research, not a recommendation to use their
transitive versions in a production service. Yoinkr's own dependencies are separate.
