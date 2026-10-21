"""Reviewed fixed ABI adapter. A subprocess boundary, not a hostile-code sandbox."""
import base64
import ctypes
import hashlib
import json
import pathlib
import platform
import sys


def main():
    if sys.platform != 'linux' or platform.machine() != 'x86_64':
        raise ValueError('profile requires Linux x86_64')
    if ctypes.sizeof(ctypes.c_void_p) != 8 or ctypes.sizeof(ctypes.c_ulong) != 8 or ctypes.sizeof(ctypes.c_uint) != 4:
        raise ValueError('unexpected C ABI widths')
    raw = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('job exceeds limit')
    job = json.loads(raw)
    if set(job) != {'library', 'sha256', 'cases'}:
        raise ValueError('unsupported job')
    library = pathlib.Path(job['library'])
    if not library.is_absolute() or library.is_symlink() or not library.is_file():
        raise ValueError('library must be an absolute ordinary file')
    if library.stat().st_size > 8 * 1024 * 1024 or hashlib.sha256(library.read_bytes()).hexdigest() != job['sha256']:
        raise ValueError('library hash differs')
    cases = job['cases']
    if not isinstance(cases, list) or not 1 <= len(cases) <= 32:
        raise ValueError('expected 1–32 cases')
    decoded = []
    total = 0
    for row in cases:
        if set(row) != {'chunks', 'seed'} or type(row['seed']) is not int or not 0 <= row['seed'] <= 0xffffffff:
            raise ValueError('invalid checksum case')
        if not isinstance(row['chunks'], list) or not 1 <= len(row['chunks']) <= 32:
            raise ValueError('expected 1–32 chunks')
        chunks = []
        for text in row['chunks']:
            chunk = base64.b64decode(text, validate=True)
            if len(chunk) > 65536:
                raise ValueError('chunk exceeds 64 KiB')
            total += len(chunk)
            if total > 1024 * 1024:
                raise ValueError('job exceeds 1 MiB of input')
            chunks.append(chunk)
        decoded.append((row['seed'], chunks))
    # All data validation precedes native loading (which can run library constructors).
    lib = ctypes.CDLL(str(library), mode=ctypes.RTLD_LOCAL)
    crc = lib.crc32
    crc.argtypes = [ctypes.c_ulong, ctypes.c_void_p, ctypes.c_uint]
    crc.restype = ctypes.c_ulong
    version = lib.zlibVersion
    version.argtypes = []
    version.restype = ctypes.c_char_p
    result = []
    for seed, chunks in decoded:
        value = seed
        for chunk in chunks:
            buffer = ctypes.create_string_buffer(chunk)  # non-null even for an empty chunk
            value = int(crc(value, ctypes.cast(buffer, ctypes.c_void_p), len(chunk))) & 0xffffffff
        result.append(value)
    dependencies = []
    for line in pathlib.Path('/proc/self/maps').read_text().splitlines():
        fields = line.split(maxsplit=5)
        if len(fields) == 6 and fields[5].endswith('/libc.so.6'):
            path = pathlib.Path(fields[5])
            if not any(d['path'] == str(path) for d in dependencies):
                dependencies.append({'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    print(json.dumps({'kind': 'results', 'version': version().decode('ascii'), 'library': str(library), 'cases': result,
                      'abi': {'platform': sys.platform, 'machine': platform.machine(), 'ulongBytes': 8, 'uintBytes': 4},
                      'runtimeDependencies': dependencies}, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'kind': 'failure', 'message': str(error)}))
        sys.exit(1)
