# VS Code / native zlib process bridge

Pins VS Code 1.142.0 Linux x86-64 and the immutable process-component package. A native menu action obtains the active saved-file path, reads bounded bytes without modifying the file, and calls CRC32 through a supervised Python worker. No extension API is used. Interpreter selection is explicit and fingerprinted.

See [setup, protocol, scope and proof](../../docs/COMPONENT_BRIDGE.md).
