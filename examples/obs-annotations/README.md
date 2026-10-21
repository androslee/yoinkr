# GIMP → OBS annotations

Recover GIMP's original stroke-smoothing function and use it through a bounded C compatibility shim in an experimental OBS annotation dock/source. This transfers a numerical feature; it does not embed GTK widgets inside Qt.

Install root dependencies with `npm ci`:

```sh
npm run acquire:example-sources -- gimp-smoothing /path/to/gimp-inputs
npm run build:source-slice -- gimp-smoothing /path/to/gimp-inputs /path/to/smoothing-package
npm run build:obs-annotation -- /path/to/smoothing-package /path/to/obs-module-source
```

Compile with OBS and Qt development SDKs. [SDK requirements, commands and GUI verification checklist](../../docs/CREATOR_EXAMPLES.md).

**Status:** original numerical comparisons and Linux SDK compilation/linking passed. Actual GIMP/GTK donor observation and OBS/Qt loading, drawing, rendered frames, lifecycle and rollback remain pending. Do not install an unverified binary into your production streaming setup. This source example is not an assertion of general Qt/GTK interoperability.

Source pins and original licenses are retained in generated output. Build artifacts and downloaded SDKs stay local and are not included in Git.
